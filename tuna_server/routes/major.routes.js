// routes/major.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Tự động kiểm tra và thêm cột nếu CSDL chưa có
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
// 2. THÊM MỚI NGÀNH (GIỮ NGUYÊN VĂN KHÓA NGƯỜI DÙNG NHẬP)
// =============================================================================
router.post('/', async (req, res) => {
  try {
    const { major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required } = req.body;

    if (!major_code?.trim() || !major_name?.trim()) {
      return res.status(400).json({ success: false, message: 'Mã và tên ngành là bắt buộc!' });
    }

    // Giữ nguyên chuỗi người dùng nhập (không tự ý đổi sang K20/K23)
    const rawCohort = applied_cohort ? String(applied_cohort).trim() : 'ALL';
    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;

    const result = await pool.query(`
      INSERT INTO faculty_majors (major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, total_years::float AS total_years
    `, [major_code.trim(), major_name.trim(), rawCohort, cleanYears, cleanSemPerYear, cleanCredits]);

    // Đồng bộ vào academic_cohorts nếu cần
    if (rawCohort && rawCohort.toUpperCase() !== 'ALL') {
      const yearMatch = rawCohort.match(/\b(19\d{2}|20\d{2})\b/);
      const admYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      await pool.query(`
        INSERT INTO academic_cohorts (cohort_code, admission_year, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (cohort_code) DO NOTHING
      `, [rawCohort, admYear]).catch(() => {});
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
// 3. CẬP NHẬT NGÀNH (LƯU NGUYÊN VĂN KHÓA NHẬP)
// =============================================================================
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required, is_active } = req.body;

    const prevRes = await pool.query('SELECT major_code, major_name FROM faculty_majors WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần cập nhật!' });
    }
    const prevMajor = prevRes.rows[0];

    // Giữ nguyên chuỗi nhập (KHÓA 2023 -> KHÓA 2023, 2023 -> 2023, K23 -> K23)
    const rawCohort = applied_cohort ? String(applied_cohort).trim() : 'ALL';
    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;
    const targetCode = major_code?.trim() || prevMajor.major_code;
    const targetName = major_name?.trim() || prevMajor.major_name;

    if (targetCode !== prevMajor.major_code) {
      const planCount = await pool.query('SELECT COUNT(*)::int AS count FROM curriculum_plans WHERE major_code = $1', [prevMajor.major_code]);
      if (planCount.rows[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: `Không thể đổi mã ngành "${prevMajor.major_code}" vì đang có ${planCount.rows[0].count} môn học trong CTĐT!`
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
      rawCohort,
      cleanYears,
      cleanSemPerYear,
      cleanCredits,
      is_active !== undefined ? is_active : true,
      id
    ]);

    // Đồng bộ vào academic_cohorts
    if (rawCohort && rawCohort.toUpperCase() !== 'ALL') {
      const yearMatch = rawCohort.match(/\b(19\d{2}|20\d{2})\b/);
      const admYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
      await pool.query(`
        INSERT INTO academic_cohorts (cohort_code, admission_year, is_active)
        VALUES ($1, $2, true)
        ON CONFLICT (cohort_code) DO NOTHING
      `, [rawCohort, admYear]).catch(() => {});
    }

    if (targetName !== prevMajor.major_name) {
      await pool.query('UPDATE curriculum_plans SET major_name = $1 WHERE major_code = $2', [targetName, targetCode]).catch(() => {});
    }

    res.json({ success: true, message: 'Cập nhật ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 4. XÓA NGÀNH
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