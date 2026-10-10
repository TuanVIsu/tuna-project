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
        COALESCE(s.current_streak, 0) AS "currentStreak",
        COALESCE(s.longest_streak, 0) AS "longestStreak"
      FROM users u
      LEFT JOIN user_streaks s ON (
        s.user_id = u.zalo_id 
        OR s.user_id = u.student_code 
        OR s.user_id = u.id::text 
        OR (u.email IS NOT NULL AND LOWER(s.user_id) = LOWER(u.email))
      )
      WHERE 1=1
    `;
    const params = [];

    // Tìm kiếm mở rộng theo Tên, MSSV, Lớp và Email
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(u.name) LIKE $${params.length} 
        OR LOWER(COALESCE(u.student_code, '')) LIKE $${params.length} 
        OR LOWER(COALESCE(u.class_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(u.email, '')) LIKE $${params.length}
      )`;
    }

    // Lọc theo Chuyên ngành
    if (major && major !== 'all' && major !== 'Tất cả ngành') {
      params.push(major);
      query += ` AND u.faculty = $${params.length}`;
    }

    // Lọc theo Khóa tuyển sinh
    if (cohort && cohort !== 'all' && cohort !== 'Tất cả khóa') {
      const cohortDigits = cohort.replace(/\D/g, '');
      params.push(`%${cohortDigits}%`);
      query += ` AND (u.class_name ILIKE $${params.length} OR u.class_name ILIKE '%${cohort}%')`;
    }

    // Lọc theo Năm học quy đổi tín chỉ
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

// 2. LẤY DANH SÁCH CHỜ DUYỆT (Đồng nhất cấu trúc trường với GET /)
// routes/users.routes.js
// 2. LẤY DANH SÁCH CHỜ DUYỆT (ĐỒNG BỘ STREAK VÀ THÔNG TIN CHÍNH XÁC NHƯ TAB TẤT CẢ)
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
        COALESCE(s.current_streak, 0) AS "currentStreak",
        COALESCE(s.longest_streak, 0) AS "longestStreak"
       FROM users u
       LEFT JOIN user_streaks s ON (
         s.user_id = u.zalo_id 
         OR s.user_id = u.student_code 
         OR s.user_id = u.id::text 
         OR (u.email IS NOT NULL AND LOWER(s.user_id) = LOWER(u.email))
       )
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

// 6. XÓA VĨNH VIỄN SINH VIÊN (DỌN SẠCH CÁC BẢNG LIÊN QUAN TRÁNH LỖI KHÓA NGOẠI)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    // 1. Lấy toàn bộ định danh của sinh viên
    const userRes = await client.query(
      `SELECT id, student_code, email, zalo_id FROM users WHERE id = $1`,
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên này!' });
    }

    const u = userRes.rows[0];
    const identifiers = [
      String(u.id),
      u.student_code,
      u.email,
      u.zalo_id
    ].filter(Boolean);

    await client.query('BEGIN');

    // 2. Dọn sạch dữ liệu ở các bảng liên quan
    await client.query(`DELETE FROM user_streaks WHERE user_id = ANY($1)`, [identifiers]).catch(() => {});
    await client.query(`DELETE FROM streak_logs WHERE user_id = ANY($1)`, [identifiers]).catch(() => {});
    await client.query(`DELETE FROM ai_tasks WHERE user_id = ANY($1)`, [identifiers]).catch(() => {});
    await client.query(`DELETE FROM user_documents WHERE user_id = ANY($1)`, [identifiers]).catch(() => {});
    await client.query(`DELETE FROM community_messages WHERE user_id = ANY($1)`, [identifiers]).catch(() => {});
    await client.query(`DELETE FROM quiz_answer_attempts WHERE user_id = ANY($1)`, [identifiers]).catch(() => {});
    await client.query(`DELETE FROM student_verifications WHERE student_code = ANY($1) OR email = ANY($1)`, [identifiers]).catch(() => {});

    // 3. Xóa bản ghi chính trong bảng users
    await client.query(`DELETE FROM users WHERE id = $1`, [id]);

    await client.query('COMMIT');

    res.json({ success: true, message: 'Đã xóa sinh viên và toàn bộ dữ liệu liên quan khỏi hệ thống!' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Lỗi DELETE /users/:id:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi khi xóa: ' + error.message });
  } finally {
    client.release();
  }
});

module.exports = router;