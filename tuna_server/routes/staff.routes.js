// routes/staff.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { authenticateToken } = require('../middlewares/auth');

router.use(authenticateToken);

// 1. Danh sách tài khoản Quản trị viên
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
       WHERE role IN ('super_admin', 'instructor', 'moderator')
       ORDER BY id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi GET /admin/staff:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Tạo thủ công tài khoản Quản trị viên
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

    const rawPassword = password?.trim() || 'Admin@123';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const permissions = role === 'super_admin' 
      ? ['all'] 
      : role === 'instructor' 
      ? ['library', 'schedules', 'broadcast'] 
      : ['community'];

    const insertRes = await pool.query(
      `INSERT INTO users (student_code, email, name, role, password_hash, assigned_subject, is_active, custom_permissions)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id, student_code AS username, email, name AS "fullName", role, is_active AS "isActive"`,
      [baseUsername, cleanEmail, fullName.trim(), role || 'instructor', hashedPassword, assignedSubject || null, permissions]
    );

    res.json({ success: true, message: 'Tạo tài khoản quản trị thành công!', data: insertRes.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /admin/staff:', err);
    res.status(500).json({ success: false, message: 'Email hoặc Tên đăng nhập đã tồn tại trong hệ thống!' });
  }
});

// 3. Cập nhật thông tin tài khoản Quản trị viên
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, role, email, password } = req.body;

  try {
    const check = await pool.query(`SELECT id, password_hash FROM users WHERE id = $1 AND role IN ('super_admin', 'instructor', 'moderator')`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản quản trị!' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const checkEmail = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2`,
      [cleanEmail, id]
    );
    if (checkEmail.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Email đã tồn tại trên một tài khoản khác!' });
    }

    const permissions = role === 'super_admin' 
      ? ['all'] 
      : role === 'instructor' 
      ? ['library', 'schedules', 'broadcast'] 
      : ['community'];

    let finalPassword = check.rows[0].password_hash;
    if (password && password.trim() !== '') {
      finalPassword = await bcrypt.hash(password.trim(), 10);
    }

    const updateRes = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, role = $3, password_hash = $4, custom_permissions = $5
       WHERE id = $6
       RETURNING id, COALESCE(student_code, email) AS username, email, name AS "fullName", role, is_active AS "isActive"`,
      [fullName.trim(), cleanEmail, role, finalPassword, permissions, id]
    );

    res.json({ success: true, message: 'Cập nhật tài khoản thành công!', data: updateRes.rows[0] });
  } catch (err) {
    console.error('Lỗi PUT /admin/staff/:id:', err);
    res.status(500).json({ success: false, message: err.message || 'Lỗi cập nhật tài khoản!' });
  }
});

// 4. Khóa / Mở khóa tài khoản Quản trị viên
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
    console.error('Lỗi PATCH /admin/staff/:id/toggle:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Xóa tài khoản Quản trị viên
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
    console.error('Lỗi DELETE /admin/staff/:id:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Danh sách yêu cầu cấp quyền Google
router.get('/access-requests', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name AS "fullName", email, reason, 
              requested_role AS "requestedRole", 
              COALESCE(status, 'pending') AS status,
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM admin_access_requests 
       ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi GET /admin/staff/access-requests:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Danh sách yêu cầu đặt lại mật khẩu
router.get('/password-resets', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.email, r.note, 
              COALESCE(r.status, 'pending') AS status,
              TO_CHAR(r.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
              u.name AS "fullName", u.role, COALESCE(u.student_code, u.email) AS username
       FROM admin_password_resets r
       LEFT JOIN users u ON LOWER(u.email) = LOWER(r.email)
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi GET /admin/staff/password-resets:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Duyệt / Từ chối yêu cầu cấp quyền Google
router.post('/approve-access', async (req, res) => {
  const { requestId, email, fullName, role, action = 'approve' } = req.body;
  try {
    const cleanEmail = email.toLowerCase().trim();

    if (action === 'reject') {
      await pool.query(`UPDATE admin_access_requests SET status = 'rejected' WHERE id = $1`, [requestId]);
      return res.json({ success: true, message: `Đã từ chối cấp quyền cho ${cleanEmail}` });
    }

    const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    const permissions = role === 'instructor' ? ['library', 'schedules', 'broadcast'] : ['community'];
    const defaultHashedPassword = await bcrypt.hash('Admin@123', 10);

    await pool.query(
      `INSERT INTO users (student_code, email, name, role, password_hash, is_active, custom_permissions)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (email) DO UPDATE 
       SET role = EXCLUDED.role, is_active = true, custom_permissions = EXCLUDED.custom_permissions`,
      [baseUsername, cleanEmail, fullName, role || 'instructor', defaultHashedPassword, permissions]
    );

    await pool.query(`UPDATE admin_access_requests SET status = 'approved' WHERE id = $1`, [requestId]);
    await pool.query(
      `DELETE FROM admin_access_requests WHERE LOWER(email) = $1 AND id != $2`,
      [cleanEmail, requestId]
    );

    res.json({ success: true, message: `Đã duyệt và cấp quyền [${role}] thành công cho ${fullName}!` });
  } catch (err) {
    console.error('Lỗi POST /admin/staff/approve-access:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Duyệt và đặt lại mật khẩu tài khoản
router.post('/approve-reset-password', async (req, res) => {
  const { requestId, email, newPassword = 'Admin@123' } = req.body;
  try {
    const cleanEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);

    await pool.query(
      `UPDATE users SET password_hash = $1 WHERE LOWER(email) = $2`,
      [hashedPassword, cleanEmail]
    );

    await pool.query(`UPDATE admin_password_resets SET status = 'approved' WHERE id = $1`, [requestId]);
    await pool.query(
      `DELETE FROM admin_password_resets WHERE LOWER(email) = $1 AND id != $2`,
      [cleanEmail, requestId]
    );

    res.json({ success: true, message: `Mật khẩu của tài khoản ${cleanEmail} đã được đặt lại thành: ${newPassword}` });
  } catch (err) {
    console.error('Lỗi POST /admin/staff/approve-reset-password:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. Thông báo chờ duyệt cho Super Admin
router.get('/notifications', async (req, res) => {
  try {
    const accessReqs = await pool.query(
      `SELECT id, full_name AS "fullName", email, requested_role AS "role",
              'access' AS "type",
              TO_CHAR(created_at, 'HH24:MI DD/MM') AS "time"
       FROM admin_access_requests 
       WHERE status = 'pending' 
       ORDER BY created_at DESC LIMIT 5`
    );

    const resetReqs = await pool.query(
      `SELECT id, email, note,
              'password_reset' AS "type",
              TO_CHAR(created_at, 'HH24:MI DD/MM') AS "time"
       FROM admin_password_resets 
       WHERE status = 'pending' 
       ORDER BY created_at DESC LIMIT 5`
    );

    const totalCount = accessReqs.rows.length + resetReqs.rows.length;

    res.json({
      success: true,
      totalPending: totalCount,
      notifications: [
        ...accessReqs.rows.map((r) => ({
          id: `acc_${r.id}`,
          rawId: r.id,
          type: 'access',
          title: `Yêu cầu cấp quyền: ${r.fullName}`,
          desc: `${r.email} xin quyền ${r.role === 'instructor' ? 'Giảng viên' : 'Moderator'}`,
          time: r.time,
        })),
        ...resetReqs.rows.map((r) => ({
          id: `pwd_${r.id}`,
          rawId: r.id,
          type: 'password_reset',
          title: `Khôi phục mật khẩu`,
          desc: `Tài khoản ${r.email} yêu cầu cấp lại mật khẩu`,
          time: r.time,
        })),
      ],
    });
  } catch (err) {
    console.error('Lỗi GET /admin/staff/notifications:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;