// routes/major.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. Lấy danh sách ngành
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id, 
        m.major_code, 
        m.major_name, 
        COALESCE(m.applied_cohort, 'all') AS applied_cohort,
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

// 2. Thêm mới ngành (Nhận applied_cohort tự nhập)
router.post('/', async (req, res) => {
  try {
    const { major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required } = req.body;

    if (!major_code?.trim() || !major_name?.trim()) {
      return res.status(400).json({ success: false, message: 'Mã và tên ngành là bắt buộc!' });
    }

    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;
    const cleanCohort = applied_cohort?.trim().toUpperCase() || 'ALL';

    const result = await pool.query(`
      INSERT INTO faculty_majors (major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, total_years::float AS total_years
    `, [major_code.trim(), major_name.trim(), cleanCohort, cleanYears, cleanSemPerYear, cleanCredits]);

    res.json({ success: true, message: 'Thêm ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Mã ngành đã tồn tại!' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Cập nhật ngành
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { major_code, major_name, applied_cohort, total_years, semesters_per_year, total_credits_required, is_active } = req.body;

    const cleanYears = parseFloat(total_years) || 4.0;
    const cleanSemPerYear = parseInt(semesters_per_year, 10) || 3;
    const cleanCredits = parseInt(total_credits_required, 10) || 130;
    const cleanCohort = applied_cohort?.trim().toUpperCase() || 'ALL';

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
      major_code?.trim(),
      major_name?.trim(),
      cleanCohort,
      cleanYears,
      cleanSemPerYear,
      cleanCredits,
      is_active !== undefined ? is_active : true,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần cập nhật!' });
    }

    res.json({ success: true, message: 'Cập nhật ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Xóa ngành
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const majorCheck = await pool.query('SELECT major_code, major_name FROM faculty_majors WHERE id = $1', [id]);
    if (majorCheck.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy ngành!' });

    const { major_code, major_name } = majorCheck.rows[0];
    const planCheck = await pool.query('SELECT COUNT(*)::int AS count FROM curriculum_plans WHERE major_code = $1', [major_code]);
    if (planCheck.rows[0].count > 0) {
      return res.status(400).json({ success: false, message: `Ngành "${major_name}" đang có ${planCheck.rows[0].count} môn trong CTĐT, không thể xóa!` });
    }

    await pool.query('DELETE FROM faculty_majors WHERE id = $1', [id]);
    res.json({ success: true, message: 'Đã xóa ngành thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;