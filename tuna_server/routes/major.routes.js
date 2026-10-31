// routes/major.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Tự động kiểm tra và thêm cột nếu CSDL chưa có (ngăn lỗi 500 do thiếu cột)
(async () => {
  try {
    await pool.query(`
      ALTER TABLE faculty_majors 
      ADD COLUMN IF NOT EXISTS applied_cohort VARCHAR(50) DEFAULT 'ALL',
      ADD COLUMN IF NOT EXISTS total_years NUMERIC(3, 1) DEFAULT 4.0,
      ADD COLUMN IF NOT EXISTS semesters_per_year INT DEFAULT 3,
      ADD COLUMN IF NOT EXISTS total_credits_required INT DEFAULT 130,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
    `);
  } catch (e) {}
})();

// Helper chuẩn hóa khóa: người dùng nhập HTTT2311, 23, hay K23 đều ra đúng 'K23'
const extractCleanCohort = (input) => {
  if (!input) return 'ALL';
  const trimmed = String(input).trim();
  if (['ALL', 'TẤT CẢ', 'TAT CA', '*'].includes(trimmed.toUpperCase())) return 'ALL';
  
  // Trích xuất 2 chữ số niên khóa (VD: HTTT2311 -> 23 -> K23)
  const match = trimmed.match(/(?:K|k)?(\d{2})/);
  if (match) return `K${match[1]}`;
  return trimmed.toUpperCase();
};

// =============================================================================
// 1. LẤY DANH SÁCH NGÀNH KÈM KHÓA ÁP DỤNG
// =============================================================================
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id, 
        m.major_code, 
        m.major_name, 
        COALESCE(m.applied_cohort, 'ALL') AS applied_cohort,
        m.total_years::float AS total_years, 
        m.semesters_per_year, 
        m.total_credits_required,
        m.is_active,
        (SELECT COUNT(*)::int FROM curriculum_plans c WHERE c.major_code = m.major_code) AS subject_count
      FROM faculty_majors m
      ORDER BY m.id ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 2. THÊM MỚI NGÀNH (TỰ ĐỘNG BÓC TÁCH VÀ GHI VÀO ACADEMIC_COHORTS)
// =============================================================================
router.post('/', async (req, res) => {
  try {
    const { major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required } = req.body;

    if (!major_code?.trim() || !major_name?.trim()) {
      return res.status(400).json({ success: false, message: 'Mã và tên ngành là bắt buộc!' });
    }

    const cleanCohort = extractCleanCohort(applied_cohort);
    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;

    const result = await pool.query(`
      INSERT INTO faculty_majors (major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, total_years::float AS total_years
    `, [major_code.trim(), major_name.trim(), cleanCohort, cleanYears, cleanSemPerYear, cleanCredits]);

    // ĐỒNG BỘ: Tự động ghi nhận Khóa này vào bảng academic_cohorts để các trang khác lập tức thấy
    if (cleanCohort && cleanCohort !== 'ALL') {
      const cohortDigits = cleanCohort.replace(/\D/g, '');
      const admYear = cohortDigits ? 2000 + parseInt(cohortDigits, 10) : new Date().getFullYear();
      await pool.query(`
        INSERT INTO academic_cohorts (cohort_code, admission_year, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (cohort_code) DO NOTHING
      `, [cleanCohort, admYear]).catch(() => {});
    }

    res.json({ success: true, message: 'Thêm ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Mã ngành đã tồn tại!' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 3. CẬP NHẬT NGÀNH (ĐỒNG BỘ KHÓA & TÊN NGÀNH SANG CURRICULUM_PLANS)
// =============================================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required, is_active } = req.body;

    // Lấy thông tin ngành trước khi sửa
    const prevRes = await pool.query('SELECT major_code, major_name FROM faculty_majors WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần cập nhật!' });
    }
    const prevMajor = prevRes.rows[0];

    const cleanCohort = extractCleanCohort(applied_cohort);
    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;
    const targetCode = major_code?.trim() || prevMajor.major_code;
    const targetName = major_name?.trim() || prevMajor.major_name;

    // Chặn đổi mã ngành nếu đã phát sinh môn học trong CTĐT
    if (targetCode !== prevMajor.major_code) {
      const planCount = await pool.query('SELECT COUNT(*)::int AS count FROM curriculum_plans WHERE major_code = $1', [prevMajor.major_code]);
      if (planCount.rows[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: `Không thể đổi mã ngành "${prevMajor.major_code}" vì đang có ${planCount.rows[0].count} môn học gắn liền với mã này trong CTĐT!`
        });
      }
    }

    const result = await pool.query(`
      UPDATE faculty_majors
      SET major_code = $1, 
          major_name = $2, 
          applied_cohort = $3, 
          total_years = $4, 
          semesters_per_year = $5, 
          total_credits_required = $6, 
          is_active = $7
      WHERE id = $8
      RETURNING *, total_years::float AS total_years
    `, [
      targetCode,
      targetName,
      cleanCohort,
      cleanYears,
      cleanSemPerYear,
      cleanCredits,
      is_active !== undefined ? is_active : true,
      id
    ]);

    // ĐỒNG BỘ 1: Ghi nhận khóa vào academic_cohorts
    if (cleanCohort && cleanCohort !== 'ALL') {
      const cohortDigits = cleanCohort.replace(/\D/g, '');
      const admYear = cohortDigits ? 2000 + parseInt(cohortDigits, 10) : new Date().getFullYear();
      await pool.query(`
        INSERT INTO academic_cohorts (cohort_code, admission_year, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (cohort_code) DO NOTHING
      `, [cleanCohort, admYear]).catch(() => {});
    }

    // ĐỒNG BỘ 2: Cập nhật tên ngành mới sang curriculum_plans
    if (targetName !== prevMajor.major_name) {
      await pool.query('UPDATE curriculum_plans SET major_name = $1 WHERE major_code = $2', [targetName, targetCode]).catch(() => {});
    }

    res.json({ success: true, message: 'Cập nhật ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 4. XÓA NGÀNH (BẢO VỆ DỮ LIỆU CTĐT)
// =============================================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const majorCheck = await pool.query('SELECT major_code, major_name FROM faculty_majors WHERE id = $1', [id]);
    if (majorCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy ngành!' });

    const { major_code, major_name } = majorCheck.rows[0];
    const planCheck = await pool.query('SELECT COUNT(*)::int AS count FROM curriculum_plans WHERE major_code = $1', [major_code]);
    if (planCheck.rows[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Ngành "${major_name}" đang có ${planCheck.rows[0].count} môn trong CTĐT, không thể xóa!` 
      });
    }

    await pool.query('DELETE FROM faculty_majors WHERE id = $1', [id]);
    res.json({ success: true, message: 'Đã xóa ngành thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;