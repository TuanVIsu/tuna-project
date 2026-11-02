// routes/users.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

// =============================================================================
// 1. LẤY DANH SÁCH SINH VIÊN ĐÃ ĐƯỢC DUYỆT / HOẠT ĐỘNG
// =============================================================================
router.get('/', async (req, res) => {
  const { search, major, cohort, year, class: classNameFilter } = req.query;
  try {
    // CHỈ LẤY SINH VIÊN ĐÃ DUYỆT (is_verified = true) cho Tab Tất cả sinh viên
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
      WHERE u.role = 'student' AND (u.is_verified = TRUE OR u.verification_status = 'approved')
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
    console.error("Lỗi GET /users:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 2. LẤY DANH SÁCH CHỜ DUYỆT (PENDING) HOẶC BỊ TỪ CHỐI
// =============================================================================
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
       WHERE (u.verification_status = 'pending' OR u.verification_status = 'rejected' OR u.is_verified = FALSE) 
         AND u.role = 'student'
       ORDER BY u.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Lỗi GET /users/pending:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 3. ADMIN DUYỆT / TỪ CHỐI SINH VIÊN VÀO LỚP
// =============================================================================
router.post('/verify', authenticateToken, async (req, res) => {
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

    // Bắn socket thông báo cho App Sinh viên
    const io = req.app.get('io');
    if (io) {
      io.emit(`user_verify_status_${userId}`, { status: newStatus });
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

// =============================================================================
// 4. CHỈNH SỬA HỒ SƠ SINH VIÊN (Admin)
// =============================================================================
router.put('/:id', authenticateToken, async (req, res) => {
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

// =============================================================================
// 5. KHÓA HOẶC MỞ KHÓA TÀI KHOẢN (Admin) + BẮN SOCKET THÔNG BÁO TỨC THÌ
// =============================================================================
router.patch('/:id/toggle-status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT is_active FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const newStatus = !check.rows[0].is_active; // true (mở) hoặc false (khóa)
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newStatus, id]);

    // Bắn Socket để App Zalo / Web tự động logout hoặc thông báo
    const io = req.app.get('io');
    if (io) {
      if (!newStatus) {
        io.emit(`force_logout_${id}`, { reason: 'Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên!' });
      }
    }

    res.json({ 
      success: true, 
      isActive: newStatus, 
      message: newStatus ? 'Đã kích hoạt lại tài khoản' : 'Đã vô hiệu hóa (khóa) tài khoản' 
    });
  } catch (error) {
    console.error("Lỗi PATCH /users/:id/toggle-status:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 6. XÓA VĨNH VIỄN SINH VIÊN
// =============================================================================
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên này!' });
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Đã xóa sinh viên và toàn bộ dữ liệu liên quan khỏi hệ thống!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi xóa: ' + error.message });
  }
});

// =============================================================================
// 7. ĐỒNG BỘ HỒ SƠ TỪ ZALO MINI APP (NẾU ĐỔI MSSV -> HẠ CẤP VỀ PENDING)
// =============================================================================
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

    let updatedUser;

// Thay thế đoạn code xử lý existingUser trong API /student/link hoặc /sync
    if (existingUser) {
      const oldCode = existingUser.student_code || "";
      const oldClass = existingUser.class_name || "";
      
      let newVerificationStatus = existingUser.verification_status;
      let newIsVerified = existingUser.is_verified;

      // NẾU ĐỔI MSSV HOẶC LỚP SAU KHI ĐÃ ĐƯỢC DUYỆT -> BẮT BUỘC HẠ CẤP VỀ CHỜ DUYỆT
      if (cleanCode !== oldCode || cleanClass !== oldClass) {
        newVerificationStatus = 'pending';
        newIsVerified = false;
      }

      const updateRes = await pool.query(
        `UPDATE users 
         SET name = $1, 
             student_code = $2, 
             class_name = COALESCE($3, class_name), 
             faculty = $4,
             is_verified = $5,
             verification_status = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7 
         RETURNING id, name, email, student_code, class_name, faculty, avatar, role, is_verified, verification_status, is_active`,
        [cleanName, cleanCode, cleanClass, cleanFaculty, newIsVerified, newVerificationStatus, existingUser.id]
      );
      updatedUser = updateRes.rows[0];
    } else {
      // NẾU LÀ TÀI KHOẢN MỚI HOÀN TOÀN (VỪA XÓA ĐĂNG NHẬP LẠI) -> LUÔN CHỜ DUYỆT
      const insertRes = await pool.query(
        `INSERT INTO users 
           (name, student_code, class_name, faculty, zalo_id, email, role, is_verified, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'student', false, 'pending')
         RETURNING id, name, email, student_code, class_name, faculty, avatar, role, is_verified, verification_status, is_active`,
        [cleanName, cleanCode, cleanClass, cleanFaculty, zaloId || `user_${Date.now()}`, email || null]
      );
      updatedUser = insertRes.rows[0];
    }

    if (updatedUser.is_active === false) {
      return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị vô hiệu hóa!' });
    }

    res.json({
      success: true,
      message: updatedUser.verification_status === 'pending' ? 'Hồ sơ đã được lưu, vui lòng chờ Admin duyệt vào lớp!' : 'Cập nhật hồ sơ sinh viên thành công!',
      user: updatedUser
    });
  } catch (err) {
    console.error("Lỗi POST /student/link:", err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật: ' + err.message });
  }
});

module.exports = router;