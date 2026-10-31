// routes/major.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. Lấy danh sách toàn bộ ngành đào tạo
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id, 
        m.major_code, 
        m.major_name, 
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
    console.error("Lỗi lấy danh sách ngành:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Thêm mới ngành đào tạo
router.post('/', async (req, res) => {
  try {
    const { major_code, major_name, total_years, semesters_per_year, total_credits_required } = req.body;

    if (!major_code?.trim() || !major_name?.trim()) {
      return res.status(400).json({ success: false, message: 'Mã và tên ngành là bắt buộc!' });
    }

    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;

    const result = await pool.query(`
      INSERT INTO faculty_majors (major_code, major_name, total_years, semesters_per_year, total_credits_required)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *, total_years::float AS total_years
    `, [
      major_code.trim(),
      major_name.trim(),
      cleanYears,
      cleanSemPerYear,
      cleanCredits
    ]);

    res.json({ success: true, message: 'Thêm ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Mã ngành hoặc tên ngành đã tồn tại trên hệ thống!' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Cập nhật cấu hình ngành (Hỗ trợ số năm thập phân 4.5, 3.5 và đồng bộ CTĐT)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { major_code, major_name, total_years, semesters_per_year, total_credits_required, is_active } = req.body;

    // Lấy thông tin ngành hiện tại
    const currentRes = await pool.query('SELECT * FROM faculty_majors WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần cập nhật!' });
    }
    const currentMajor = currentRes.rows[0];

    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;
    const targetMajorCode = major_code?.trim() || currentMajor.major_code;
    const targetMajorName = major_name?.trim() || currentMajor.major_name;

    // Cập nhật bảng faculty_majors
    const result = await pool.query(`
      UPDATE faculty_majors
      SET major_code = $1,
          major_name = $2,
          total_years = $3,
          semesters_per_year = $4,
          total_credits_required = $5,
          is_active = $6
      WHERE id = $7
      RETURNING *, total_years::float AS total_years
    `, [
      targetMajorCode,
      targetMajorName,
      cleanYears,
      cleanSemPerYear,
      cleanCredits,
      is_active !== undefined ? is_active : true,
      id
    ]);

    // Tự động đồng bộ major_name sang curriculum_plans nếu có thay đổi
    if (currentMajor.major_name !== targetMajorName) {
      await pool.query(
        `UPDATE curriculum_plans SET major_name = $1 WHERE major_code = $2`,
        [targetMajorName, targetMajorCode]
      ).catch(() => {});
    }

    res.json({ success: true, message: 'Cập nhật thông tin ngành thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Xóa ngành (Chặn xóa nếu đã có môn trong kế hoạch CTĐT)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const majorCheck = await pool.query('SELECT major_code, major_name FROM faculty_majors WHERE id = $1', [id]);
    if (majorCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần xóa!' });
    }

    const { major_code, major_name } = majorCheck.rows[0];
    const planCheck = await pool.query('SELECT COUNT(*)::int AS count FROM curriculum_plans WHERE major_code = $1', [major_code]);

    if (planCheck.rows[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Không thể xóa vì ngành "${major_name}" đang có ${planCheck.rows[0].count} học phần trong khung CTĐT!` 
      });
    }

    await pool.query('DELETE FROM faculty_majors WHERE id = $1', [id]);
    res.json({ success: true, message: 'Đã xóa ngành đào tạo thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;