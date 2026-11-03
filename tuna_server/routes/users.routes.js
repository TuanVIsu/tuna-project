// routes/users.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

// 1. LẤY DANH SÁCH SINH VIÊN ĐÃ ĐƯỢC DUYỆT
router.get('/', authenticateToken, async (req, res) => {
  const { search, major, cohort, year, class: classQuery, className } = req.query;
  const classNameFilter = className || classQuery;

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
        COALESCE(u.is_verified, false) AS "isVerified",
        COALESCE(u.verification_status, 'pending') AS "verificationStatus",
        TO_CHAR(u.created_at, 'DD/MM/YYYY') AS "createdAt",
        COALESCE(u.current_streak, 0) AS "currentStreak",
        COALESCE(u.longest_streak, 0) AS "longestStreak"
      FROM users u
      WHERE u.role = 'student' 
        AND u.is_verified = TRUE 
        AND u.verification_status = 'approved'
    `;
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(u.name) ILIKE $${params.length} 
        OR LOWER(COALESCE(u.student_code, '')) ILIKE $${params.length} 
        OR LOWER(COALESCE(u.class_name, '')) ILIKE $${params.length}
        OR LOWER(COALESCE(u.email, '')) ILIKE $${params.length}
      )`;
    }

    if (major && major !== 'all' && major !== 'Tất cả ngành') {
      params.push(major);
      query += ` AND u.faculty = $${params.length}`;
    }

    if (cohort && cohort !== 'all' && cohort !== 'Tất cả khóa') {
      const cohortDigits = cohort.replace(/\D/g, '');
      if (cohortDigits) {
        params.push(`%${cohortDigits}%`);
        query += ` AND (u.class_name ILIKE $${params.length} OR u.student_code ILIKE $${params.length})`;
      }
    }

    if (classNameFilter && classNameFilter !== 'all') {
      params.push(`%${classNameFilter.trim()}%`);
      query += ` AND u.class_name ILIKE $${params.length}`;
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. LẤY DANH SÁCH CHỜ DUYỆT (PENDING / REJECTED)
router.get('/pending', authenticateToken, async (req, res) => {
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
        COALESCE(u.is_verified, false) AS "isVerified",
        COALESCE(u.verification_status, 'pending') AS "verificationStatus",
        TO_CHAR(u.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
        COALESCE(u.current_streak, 0) AS "currentStreak",
        COALESCE(u.longest_streak, 0) AS "longestStreak"
       FROM users u
       WHERE (u.verification_status = 'pending' OR u.verification_status = 'rejected' OR u.is_verified = FALSE) 
         AND u.role = 'student'
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. ADMIN DUYỆT / TỪ CHỐI
router.post('/verify', authenticateToken, async (req, res) => {
  const { userId, action } = req.body;
  try {
    const isApprove = action === 'approve';
    const newStatus = isApprove ? 'approved' : 'rejected';

    if (isApprove) {
      const chk = await pool.query(`SELECT student_code FROM users WHERE id = $1`, [userId]);
      if (chk.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên!' });
      }
      if (!chk.rows[0].student_code) {
        return res.status(400).json({ success: false, message: 'Sinh viên chưa có MSSV, không thể phê duyệt vào lớp!' });
      }
    }

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

    const io = req.app.get('io');
    if (io) {
      io.emit(`user_verify_status_${userId}`, { status: newStatus, isVerified: isApprove });
      io.emit('student_profile_updated');
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

// 4. ADMIN CHỈNH SỬA HỒ SƠ SINH VIÊN (LUÔN ĐƯA VỀ PENDING)
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, studentCode, className, totalCredits, faculty } = req.body;

  try {
    const cleanCode = studentCode ? studentCode.trim().toUpperCase() : null;
    const cleanClass = className ? className.trim().toUpperCase() : null;
    const cleanName = name ? name.trim() : null;

    if (cleanCode) {
      const conflict = await pool.query(
        `SELECT id, name FROM users WHERE UPPER(TRIM(student_code)) = $1 AND id != $2 LIMIT 1`,
        [cleanCode, id]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: `MSSV ${cleanCode} đã được đăng ký bởi sinh viên ${conflict.rows[0].name}!`
        });
      }
    }

    const result = await pool.query(
      `UPDATE users 
       SET name = $1, 
           student_code = $2, 
           class_name = $3, 
           total_credits = $4, 
           faculty = $5, 
           is_verified = FALSE,
           verification_status = 'pending'
       WHERE id = $6 
       RETURNING id, name, student_code AS "studentCode", class_name AS "className", faculty, 
                 is_verified AS "isVerified", verification_status AS "verificationStatus"`,
      [cleanName, cleanCode, cleanClass, Number(totalCredits) || 0, faculty || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit(`user_verify_status_${id}`, { status: 'pending', isVerified: false, studentCode: cleanCode });
      io.emit('student_profile_updated');
    }

    res.json({ 
      success: true, 
      message: 'Đã cập nhật hồ sơ sinh viên! Hồ sơ đã được chuyển về trạng thái Chờ duyệt.', 
      data: result.rows[0] 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + error.message });
  }
});

// 5. XÓA VĨNH VIỄN SINH VIÊN
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên này!' });
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Đã xóa sinh viên và toàn bộ dữ liệu liên quan khỏi hệ thống!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi xóa: ' + error.message });
  }
});

// 6. ĐỒNG BỘ HỒ SƠ TỪ ZALO MINI APP
router.post(['/student/link', '/sync'], async (req, res) => {
  try {
    const { userId, zaloId, email, name, studentCode, className, faculty } = req.body;

    if (!name?.trim() || !studentCode?.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp Họ tên và Mã số sinh viên (MSSV)!' });
    }

    const cleanName = name.trim();
    const cleanCode = studentCode.trim().toUpperCase();
    const cleanClass = className ? className.trim().toUpperCase() : null;
    const cleanFaculty = faculty ? faculty.trim() : 'Hệ Thống Thông Tin';

    let existingUser = null;

    const rawId = userId || req.headers['x-user-id'];
    if (rawId && !isNaN(Number(rawId))) {
      const byId = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [Number(rawId)]);
      if (byId.rows.length > 0) existingUser = byId.rows[0];
    }

    if (!existingUser && zaloId) {
      const byZalo = await pool.query(`SELECT * FROM users WHERE zalo_id = $1 LIMIT 1`, [String(zaloId).trim()]);
      if (byZalo.rows.length > 0) existingUser = byZalo.rows[0];
    }

    if (!existingUser && email) {
      const byEmail = await pool.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [String(email).trim()]);
      if (byEmail.rows.length > 0) existingUser = byEmail.rows[0];
    }

    const curUserId = existingUser ? existingUser.id : -1;
    const conflict = await pool.query(
      `SELECT id, name, is_verified, verification_status 
       FROM users 
       WHERE UPPER(TRIM(student_code)) = $1 AND id != $2 
       LIMIT 1`,
      [cleanCode, curUserId]
    );

    if (conflict.rows.length > 0) {
      const cUser = conflict.rows[0];
      return res.status(409).json({
        success: false,
        message: (cUser.is_verified || cUser.verification_status === 'approved')
          ? `MSSV ${cleanCode} đã được đăng ký bởi sinh viên (${cUser.name}).`
          : `MSSV ${cleanCode} đang có hồ sơ chờ duyệt trên hệ thống!`
      });
    }

    let updatedUser;

    if (existingUser) {
      const updateRes = await pool.query(
        `UPDATE users 
         SET name = $1, 
             student_code = $2, 
             class_name = $3, 
             faculty = $4,
             is_verified = FALSE,
             verification_status = 'pending'
         WHERE id = $5 
         RETURNING id, name, email, student_code AS "studentCode", class_name AS "className", faculty, 
                   avatar, role, is_verified AS "isVerified", verification_status AS "verificationStatus"`,
        [cleanName, cleanCode, cleanClass, cleanFaculty, existingUser.id]
      );
      updatedUser = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        `INSERT INTO users 
           (name, student_code, class_name, faculty, zalo_id, email, role, is_verified, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'student', FALSE, 'pending')
         RETURNING id, name, email, student_code AS "studentCode", class_name AS "className", faculty, 
                   avatar, role, is_verified AS "isVerified", verification_status AS "verificationStatus"`,
        [cleanName, cleanCode, cleanClass, cleanFaculty, zaloId || `zalo_${Date.now()}`, email || null]
      );
      updatedUser = insertRes.rows[0];
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('student_profile_updated', { userId: updatedUser.id, status: 'pending' });
      io.emit(`user_verify_status_${updatedUser.id}`, { status: 'pending', isVerified: false });
    }

    return res.json({
      success: true,
      message: 'Hồ sơ đã được lưu, vui lòng chờ Admin duyệt vào lớp!',
      user: updatedUser
    });
  } catch (err) {
    console.error("Lỗi /api/users/sync:", err);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + err.message });
  }
});

module.exports = router;