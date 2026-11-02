// routes/users.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. LẤY DANH SÁCH TẤT CẢ SINH VIÊN KÈM BỘ LỌC
router.get('/', async (req, res) => {
  const { search, major, cohort, year } = req.query;
  try {
    let query = `
      SELECT 
        u.id, 
        u.zalo_id AS "zaloId", 
        u.name, 
        COALESCE(u.email, '') AS "email",
        u.avatar, 
        u.role, 
        u.student_code AS "studentCode", 
        u.class_name AS "className", 
        COALESCE(u.total_credits, 0) AS "totalCredits", 
        u.faculty,
        COALESCE(u.is_active, true) AS "isActive",
        COALESCE(u.is_verified, false) AS "isVerified",
        COALESCE(u.verification_status, 'pending') AS "verificationStatus",
        TO_CHAR(u.created_at, 'DD/MM/YYYY') AS "createdAt",
        COALESCE(u.current_streak, 0) AS "currentStreak",
        COALESCE(u.longest_streak, 0) AS "longestStreak"
      FROM users u
      WHERE u.role = 'student'
    `;
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(u.name) LIKE $${params.length} 
        OR LOWER(COALESCE(u.student_code, '')) LIKE $${params.length} 
        OR LOWER(COALESCE(u.class_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(u.email, '')) LIKE $${params.length}
      )`;
    }

    if (major && major !== 'all' && major !== 'Tất cả ngành') {
      params.push(major);
      query += ` AND u.faculty = $${params.length}`;
    }

    if (cohort && cohort !== 'all' && cohort !== 'Tất cả khóa') {
      const cohortDigits = cohort.replace(/\D/g, '');
      params.push(`%${cohortDigits}%`);
      query += ` AND (u.class_name ILIKE $${params.length} OR u.class_name ILIKE '%${cohort}%')`;
    }

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
    console.error("Lỗi GET /users:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. LẤY DANH SÁCH CHỜ DUYỆT
router.get('/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        u.id, 
        u.zalo_id AS "zaloId", 
        u.name, 
        COALESCE(u.email, '') AS "email",
        u.avatar, 
        u.student_code AS "studentCode", 
        u.class_name AS "className", 
        COALESCE(u.total_credits, 0) AS "totalCredits",
        u.faculty,
        COALESCE(u.is_active, true) AS "isActive",
        COALESCE(u.is_verified, false) AS "isVerified",
        COALESCE(u.verification_status, 'pending') AS "verificationStatus",
        TO_CHAR(u.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
        COALESCE(u.current_streak, 0) AS "currentStreak",
        COALESCE(u.longest_streak, 0) AS "longestStreak"
       FROM users u
       WHERE (u.verification_status = 'pending' OR u.is_verified = FALSE) 
         AND u.role = 'student'
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Lỗi GET /users/pending:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. PHÊ DUYỆT HOẶC TỪ CHỐI HỒ SƠ VÀO LỚP
router.post('/verify', async (req, res) => {
  const { userId, action } = req.body;
  try {
    const isApprove = action === 'approve';
    const newStatus = isApprove ? 'approved' : 'rejected';

    const result = await pool.query(
      `UPDATE users 
       SET is_verified = $1, 
           verification_status = $2 
       WHERE id = $3 
       RETURNING id, name, student_code AS "studentCode", class_name AS "className", is_verified AS "isVerified", verification_status AS "verificationStatus"`,
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
    console.error("Lỗi POST /users/verify:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. CHỈNH SỬA HỒ SƠ SINH VIÊN
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, studentCode, className, totalCredits, faculty, isActive, isVerified, verificationStatus } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET name = $1, 
           student_code = $2, 
           class_name = $3, 
           total_credits = $4, 
           faculty = $5, 
           is_active = $6, 
           is_verified = $7, 
           verification_status = $8
       WHERE id = $9 RETURNING *`,
      [
        name,
        studentCode || null,
        className || null,
        Number(totalCredits) || 0,
        faculty || null,
        Boolean(isActive),
        Boolean(isVerified),
        verificationStatus || (isVerified ? 'approved' : 'pending'),
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    res.json({ success: true, message: 'Cập nhật tài khoản sinh viên thành công!', data: result.rows[0] });
  } catch (error) {
    console.error("Lỗi PUT /users/:id:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. KHÓA HOẶC MỞ KHÓA TÀI KHOẢN
router.patch('/:id/toggle-status', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT is_active FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const newStatus = !check.rows[0].is_active;
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newStatus, id]);

    res.json({ 
      success: true, 
      isActive: newStatus, 
      message: newStatus ? 'Đã kích hoạt lại tài khoản' : 'Đã khóa tài khoản' 
    });
  } catch (error) {
    console.error("Lỗi PATCH /users/:id/toggle-status:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. XÓA VĨNH VIỄN SINH VIÊN (ON DELETE CASCADE TỰ ĐỘNG DỌN SẠCH CÁC BẢNG PHỤ THUỘC)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên này!' });
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    res.json({ success: true, message: 'Đã xóa sinh viên và toàn bộ dữ liệu liên quan khỏi hệ thống!' });
  } catch (error) {
    console.error('Lỗi DELETE /users/:id:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi khi xóa: ' + error.message });
  }
});
// routes/users.routes.js (Bổ sung API cập nhật hồ sơ đồng bộ)

router.post(['/student/link', '/sync'], async (req, res) => {
  try {
    const { userId, zaloId, email, name, studentCode, className, faculty } = req.body;

    if (!name?.trim() || !studentCode?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vui lòng cung cấp Họ tên và Mã số sinh viên (MSSV)!' 
      });
    }

    const cleanName = name.trim();
    const cleanCode = studentCode.trim().toUpperCase();
    const cleanClass = className ? className.trim().toUpperCase() : null;
    const cleanFaculty = faculty ? faculty.trim() : 'Hệ Thống Thông Tin';

    // 1. Tìm xem tài khoản đã tồn tại qua id, student_code, zalo_id hoặc email
    let existingUser = null;

    if (userId && /^\d+$/.test(String(userId))) {
      const byId = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [parseInt(userId, 10)]);
      if (byId.rows.length > 0) existingUser = byId.rows[0];
    }

    if (!existingUser && cleanCode) {
      const byCode = await pool.query(`SELECT * FROM users WHERE student_code = $1 LIMIT 1`, [cleanCode]);
      if (byCode.rows.length > 0) existingUser = byCode.rows[0];
    }

    if (!existingUser && zaloId) {
      const byZalo = await pool.query(`SELECT * FROM users WHERE zalo_id = $1 LIMIT 1`, [zaloId]);
      if (byZalo.rows.length > 0) existingUser = byZalo.rows[0];
    }

    if (!existingUser && email) {
      const byEmail = await pool.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [email]);
      if (byEmail.rows.length > 0) existingUser = byEmail.rows[0];
    }

    let updatedUser;

    if (existingUser) {
      // 2. Cập nhật tài khoản hiện có
      const updateRes = await pool.query(
        `UPDATE users 
         SET name = $1, 
             student_code = $2, 
             class_name = COALESCE($3, class_name), 
             faculty = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 
         RETURNING id, name, email, student_code, class_name, faculty, avatar, role, is_verified, verification_status`,
        [cleanName, cleanCode, cleanClass, cleanFaculty, existingUser.id]
      );
      updatedUser = updateRes.rows[0];
    } else {
      // 3. Tạo mới nếu là sinh viên lần đầu vào hệ thống
      const insertRes = await pool.query(
        `INSERT INTO users 
           (name, student_code, class_name, faculty, zalo_id, email, role, is_verified, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'student', true, 'approved')
         RETURNING id, name, email, student_code, class_name, faculty, avatar, role, is_verified, verification_status`,
        [cleanName, cleanCode, cleanClass, cleanFaculty, zaloId || `user_${Date.now()}`, email || null]
      );
      updatedUser = insertRes.rows[0];
    }

    res.json({
      success: true,
      message: 'Cập nhật hồ sơ sinh viên thành công!',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        student_code: updatedUser.student_code,
        class_name: updatedUser.class_name,
        faculty: updatedUser.faculty,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        is_verified: updatedUser.is_verified,
        verification_status: updatedUser.verification_status,
      }
    });
  } catch (err) {
    console.error("Lỗi POST /student/link:", err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật: ' + err.message });
  }
});
module.exports = router;