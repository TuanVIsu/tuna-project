// routes/major.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. Lấy danh sách toàn bộ ngành
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        m.id, 
        m.major_code, 
        m.major_name, 
        m.total_years, 
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

// 2. Thêm mới ngành đào tạo
router.post('/', async (req, res) => {
  try {
    const { major_code, major_name, total_years, semesters_per_year, total_credits_required } = req.body;

    if (!major_code?.trim() || !major_name?.trim()) {
      return res.status(400).json({ success: false, message: 'Mã và tên ngành là bắt buộc!' });
    }

    const result = await pool.query(`
      INSERT INTO faculty_majors (major_code, major_name, total_years, semesters_per_year, total_credits_required)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      major_code.trim(),
      major_name.trim(),
      parseInt(total_years, 10) || 4,
      parseInt(semesters_per_year, 10) || 3,
      parseInt(total_credits_required, 10) || 130
    ]);

    res.json({ success: true, message: 'Thêm ngành đào tạo thành công!', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Mã ngành hoặc tên ngành đã tồn tại!' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Cập nhật thông tin ngành và điều chỉnh năm/kỳ
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { major_code, major_name, total_years, semesters_per_year, total_credits_required, is_active } = req.body;

    const result = await pool.query(`
      UPDATE faculty_majors
      SET major_code = $1,
          major_name = $2,
          total_years = $3,
          semesters_per_year = $4,
          total_credits_required = $5,
          is_active = $6
      WHERE id = $7
      RETURNING *
    `, [
      major_code?.trim(),
      major_name?.trim(),
      parseInt(total_years, 10) || 4,
      parseInt(semesters_per_year, 10) || 3,
      parseInt(total_credits_required, 10) || 130,
      is_active !== undefined ? is_active : true,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần cập nhật!' });
    }

    res.json({ success: true, message: 'Cập nhật thông tin ngành thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Xóa ngành (Chặn xóa nếu đã có môn trong kế hoạch đào tạo)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const majorCheck = await pool.query('SELECT major_code FROM faculty_majors WHERE id = $1', [id]);
    if (majorCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ngành cần xóa!' });
    }

    const majorCode = majorCheck.rows[0].major_code;
    const planCheck = await pool.query('SELECT COUNT(*)::int AS count FROM curriculum_plans WHERE major_code = $1', [majorCode]);

    if (planCheck.rows[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Ngành này đang có ${planCheck.rows[0].count} học phần trong khung CTĐT. Vui lòng chuyển dữ liệu hoặc xóa học phần trước!` 
      });
    }

    await pool.query('DELETE FROM faculty_majors WHERE id = $1', [id]);
    res.json({ success: true, message: 'Đã xóa ngành đào tạo thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;