// routes/users.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  const { search, major, cohort, year } = req.query;
  try {
    let query = `
      SELECT 
        u.id, 
        u.zalo_id AS "zaloId", 
        u.name, 
        u.avatar, 
        u.role, 
        u.student_code AS "studentCode", 
        u.class_name AS "className", 
        u.total_credits AS "totalCredits", 
        u.faculty,
        COALESCE(u.is_active, true) AS "isActive",
        COALESCE(u.is_verified, false) AS "isVerified",
        COALESCE(u.verification_status, 'pending') AS "verificationStatus",
        TO_CHAR(u.created_at, 'DD/MM/YYYY') AS "createdAt",
        COALESCE(s.current_streak, 0) AS "currentStreak",
        COALESCE(s.longest_streak, 0) AS "longestStreak"
      FROM users u
      LEFT JOIN user_streaks s ON s.user_id = u.zalo_id OR s.user_id = u.student_code OR s.user_id = u.id::text
      WHERE 1=1
    `;
    const params = [];

    // Lọc theo từ khóa tìm kiếm
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(u.name) LIKE $${params.length} OR LOWER(COALESCE(u.student_code, '')) LIKE $${params.length} OR LOWER(COALESCE(u.class_name, '')) LIKE $${params.length})`;
    }

    // Lọc theo Chuyên ngành từ CSDL
    if (major && major !== 'all' && major !== 'Tất cả ngành') {
      params.push(major);
      query += ` AND u.faculty = $${params.length}`;
    }

    // Lọc theo Khóa tuyển sinh từ CSDL (dựa trên mã lớp)
    if (cohort && cohort !== 'all' && cohort !== 'Tất cả khóa') {
      const cohortDigits = cohort.replace(/\D/g, '');
      params.push(`%${cohortDigits}%`);
      query += ` AND (u.class_name ILIKE $${params.length} OR u.class_name ILIKE '%${cohort}%')`;
    }

    // Lọc theo Năm học (quy đổi ngưỡng tín chỉ tích lũy)
    if (year && year !== 'all') {
      const y = Number(year);
      if (y === 1) query += ` AND COALESCE(u.total_credits, 0) <= 35`;
      else if (y === 2) query += ` AND COALESCE(u.total_credits, 0) BETWEEN 30 AND 75`;
      else if (y === 3) query += ` AND COALESCE(u.total_credits, 0) BETWEEN 70 AND 115`;
      else if (y === 4) query += ` AND COALESCE(u.total_credits, 0) >= 110`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lấy danh sách sinh viên đang chờ duyệt
router.get('/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        id, 
        zalo_id AS "zaloId", 
        name, 
        avatar, 
        student_code AS "studentCode", 
        class_name AS "className", 
        faculty,
        verification_status AS "verificationStatus",
        TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM users
       WHERE verification_status = 'pending' AND student_code IS NOT NULL
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Phê duyệt / Từ chối hồ sơ sinh viên
router.post('/verify', async (req, res) => {
  const { userId, action } = req.body;
  try {
    const isApprove = action === 'approve';
    const newStatus = isApprove ? 'approved' : 'rejected';

    const result = await pool.query(
      `UPDATE users 
       SET is_verified = $1, verification_status = $2 
       WHERE id = $3 
       RETURNING id, name, student_code, class_name, verification_status`,
      [isApprove, newStatus, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên!' });
    }

    res.json({
      success: true,
      message: isApprove ? 'Đã duyệt sinh viên vào lớp thành công!' : 'Đã từ chối yêu cầu vào lớp!',
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Chỉnh sửa hồ sơ
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, studentCode, className, totalCredits, faculty, isActive, isVerified, verificationStatus } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET name = $1, student_code = $2, class_name = $3, total_credits = $4, faculty = $5, 
           is_active = $6, is_verified = $7, verification_status = $8
       WHERE id = $9 RETURNING *`,
      [
        name,
        studentCode || null,
        className || null,
        Number(totalCredits) || 0,
        faculty || null,
        Boolean(isActive),
        Boolean(isVerified),
        verificationStatus || 'approved',
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    res.json({ success: true, message: 'Cập nhật tài khoản sinh viên thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Khóa / Mở khóa
router.patch('/:id/toggle-status', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT is_active FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const newStatus = !check.rows[0].is_active;
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newStatus, id]);

    res.json({ success: true, isActive: newStatus, message: newStatus ? 'Đã kích hoạt lại tài khoản' : 'Đã khóa tài khoản' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Xóa tài khoản
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: 'Đã xóa người dùng khỏi hệ thống!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;