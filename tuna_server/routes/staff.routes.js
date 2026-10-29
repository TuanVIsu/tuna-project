// routes/staff.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('../middlewares/auth');

router.use(authenticateToken);

// 1. Danh sách Quản trị viên & Giảng viên chính thức
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, 
              COALESCE(student_code, email) AS username, 
              email, 
              name AS "fullName", 
              role, 
              assigned_subject AS "assignedSubject",
              COALESCE(is_active, true) AS "isActive",
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM users 
       WHERE role IN ('super_admin', 'teacher') 
         AND verification_status = 'approved'
       ORDER BY id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Tạo thủ công tài khoản Quản trị / Giảng viên
router.post('/', async (req, res) => {
  const { username, email, fullName, role, password, assignedSubject } = req.body;
  try {
    if (!email || !fullName) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ Email và Họ tên!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const baseUsername = (username?.trim() || cleanEmail.split('@')[0])
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase();

    const targetRole = role === 'super_admin' ? 'super_admin' : 'teacher';
    const rawPassword = password?.trim() || 'Admin@123';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const permissions = targetRole === 'super_admin' ? ['all'] : ['curriculum', 'schedules', 'users', 'library', 'community'];

    const insertRes = await pool.query(
      `INSERT INTO users (student_code, email, name, role, password_hash, assigned_subject, is_active, is_verified, verification_status, custom_permissions)
       VALUES ($1, $2, $3, $4, $5, $6, true, true, 'approved', $7)
       RETURNING id, student_code AS username, email, name AS "fullName", role, is_active AS "isActive"`,
      [baseUsername, cleanEmail, fullName.trim(), targetRole, hashedPassword, assignedSubject || null, permissions]
    );

    res.json({ success: true, message: 'Tạo tài khoản quản trị thành công!', data: insertRes.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Email hoặc Tên đăng nhập đã tồn tại trong hệ thống!' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Cập nhật thông tin Quản trị viên
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, role, email, password } = req.body;

  try {
    const cleanEmail = email.trim().toLowerCase();
    const targetRole = role === 'super_admin' ? 'super_admin' : 'teacher';

    const checkEmail = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2`,
      [cleanEmail, id]
    );
    if (checkEmail.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại trên một tài khoản khác!' });
    }

    let passwordClause = '';
    const params = [fullName.trim(), cleanEmail, targetRole, id];

    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password.trim(), 10);
      params.splice(3, 0, hashedPassword);
      passwordClause = `, password_hash = $4`;
    }

    const updateRes = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, role = $3 ${passwordClause}
       WHERE id = $${params.length} AND role IN ('super_admin', 'teacher')
       RETURNING id, COALESCE(student_code, email) AS username, email, name AS "fullName", role, is_active AS "isActive"`,
      params
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });
    }

    res.json({ success: true, message: 'Cập nhật tài khoản thành công!', data: updateRes.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Khóa / Mở khóa tài khoản
router.patch('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT id, role, is_active FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại!' });
    }

    if (check.rows[0].role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Không được phép khóa tài khoản Super Admin!' });
    }

    const newStatus = !check.rows[0].is_active;
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newStatus, id]);

    res.json({ 
      success: true, 
      isActive: newStatus, 
      message: newStatus ? 'Đã kích hoạt lại tài khoản' : 'Đã tạm khóa tài khoản' 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Xóa tài khoản
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT role FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });
    }
    if (check.rows[0].role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Super Admin!' });
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Đã xóa tài khoản khỏi hệ thống!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Danh sách yêu cầu cấp quyền Giảng viên (Truy vấn ngay từ users pending)
router.get('/access-requests', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name AS "fullName", email, faculty AS reason, 
              role AS "requestedRole", 
              verification_status AS status,
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM users 
       WHERE role = 'teacher' AND verification_status = 'pending'
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

// 7. Danh sách yêu cầu đặt lại mật khẩu (Lọc tài khoản staff có yêu cầu reset)
router.get('/password-resets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name AS "fullName", role, 
              COALESCE(student_code, email) AS username,
              'Yêu cầu cấp lại mật khẩu' AS note,
              'pending' AS status,
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM users 
       WHERE role IN ('super_admin', 'teacher') 
         AND otp_code IS NOT NULL
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

// 8. Duyệt / Từ chối yêu cầu cấp quyền Giảng viên
router.post('/approve-access', async (req, res) => {
  const { requestId, email, action = 'approve' } = req.body;
  try {
    if (action === 'reject') {
      await pool.query(`UPDATE users SET verification_status = 'rejected', is_active = false WHERE id = $1 OR LOWER(email) = LOWER($2)`, [requestId, email]);
      return res.json({ success: true, message: `Đã từ chối cấp quyền` });
    }

    await pool.query(
      `UPDATE users 
       SET verification_status = 'approved', is_verified = true, is_active = true 
       WHERE id = $1 OR LOWER(email) = LOWER($2)`,
      [requestId, email]
    );

    res.json({ success: true, message: `Đã duyệt và kích hoạt tài khoản thành công!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Duyệt và đặt lại mật khẩu tài khoản
router.post('/approve-reset-password', async (req, res) => {
  const { email, newPassword = 'Admin@123' } = req.body;
  try {
    const cleanEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);

    await pool.query(
      `UPDATE users 
       SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL 
       WHERE LOWER(email) = $2`,
      [hashedPassword, cleanEmail]
    );

    res.json({ success: true, message: `Mật khẩu của tài khoản ${cleanEmail} đã được đặt lại thành: ${newPassword}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. Thông báo chờ duyệt cho Super Admin (Lấy từ bảng users)
router.get('/notifications', async (req, res) => {
  try {
    const accessReqs = await pool.query(
      `SELECT id, name AS "fullName", email, role,
              'access' AS "type",
              TO_CHAR(created_at, 'HH24:MI DD/MM') AS "time"
       FROM users 
       WHERE role = 'teacher' AND verification_status = 'pending'
       ORDER BY created_at DESC LIMIT 5`
    );

    res.json({
      success: true,
      totalPending: accessReqs.rows.length,
      notifications: accessReqs.rows.map((r) => ({
        id: `acc_${r.id}`,
        rawId: r.id,
        type: 'access',
        title: `Yêu cầu cấp quyền: ${r.fullName}`,
        desc: `${r.email} xin cấp quyền Giảng viên`,
        time: r.time,
      })),
    });
  } catch (err) {
    res.json({ success: true, totalPending: 0, notifications: [] });
  }
});

module.exports = router;