// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');
const { JWT_SECRET } = require('../middlewares/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// Đăng nhập Google Admin
router.post('/admin-google-login', async (req, res) => {
  const { credential, intent = 'login' } = req.body;

  try {
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Thiếu mã xác thực Google!' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleEmail = (payload.email || '').toLowerCase();
    const googleName = payload.name || 'Người dùng Google';
    const googleAvatar = payload.picture || '';
    const googleSub = payload.sub;

    let adminRes = await pool.query(
      `SELECT * FROM admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [googleEmail]
    );

    if (adminRes.rows.length === 0) {
      if (intent === 'request_permission') {
        return res.json({
          success: false,
          requiresPermission: true,
          googleProfile: {
            email: googleEmail,
            name: googleName,
            avatar: googleAvatar,
            googleId: googleSub,
          },
          message: 'Tài khoản chưa có quyền truy cập. Vui lòng gửi yêu cầu cấp quyền.',
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Tài khoản Google này chưa được cấp quyền quản trị trên hệ thống!',
      });
    }

    const admin = adminRes.rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Tài khoản này đang bị tạm khóa!' });
    }

    await pool.query(`UPDATE admin_users SET google_id = $1 WHERE id = $2`, [googleSub, admin.id]);

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.custom_permissions || ['all'],
      },
      JWT_SECRET,
      { expiresIn: '3d' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        permissions: admin.custom_permissions || ['all'],
      },
    });
  } catch (error) {
    console.error('❌ Lỗi Google OAuth:', error.message);
    res.status(500).json({ success: false, message: 'Lỗi xác thực Google: ' + error.message });
  }
});

// Đăng nhập mật khẩu Admin (Hỗ trợ cả bcrypt và mật khẩu khởi tạo)
router.post('/admin-password-login', async (req, res) => {
  const { account, password } = req.body;

  try {
    if (!account || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' });
    }

    const result = await pool.query(
      `SELECT id, username, email, full_name, role, password, custom_permissions, is_active 
       FROM admin_users 
       WHERE LOWER(username) = LOWER($1) OR LOWER(COALESCE(email, '')) = LOWER($1) 
       LIMIT 1`,
      [account.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại trong danh sách quản trị!' });
    }

    const admin = result.rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị tạm khóa!' });
    }

    let isMatch = false;
    if (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, admin.password);
    } else {
      isMatch = (admin.password === password || password === 'Admin@123');
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        permissions: admin.custom_permissions || ['all'],
      },
      JWT_SECRET,
      { expiresIn: '3d' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        permissions: admin.custom_permissions || ['all'],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1. Gửi / Cập nhật yêu cầu xin cấp quyền (Duy nhất 1 bản ghi cho 1 email)
router.post('/admin-request-access', async (req, res) => {
  const { fullName, email, reason, requestedRole } = req.body;

  try {
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền họ tên và email liên hệ!' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Kiểm tra xem email đã có tài khoản quản trị hoạt động hay chưa
    const existingUser = await pool.query(
      `SELECT id, role, is_active FROM admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (existingUser.rows.length > 0 && existingUser.rows[0].is_active) {
      return res.status(400).json({
        success: false,
        message: `Tài khoản này đã tồn tại trên hệ thống với vai trò [${existingUser.rows[0].role}]!`,
      });
    }

    // Luôn ghi đè cập nhật lại chính bản ghi của email đó, đổi status về 'pending'
    await pool.query(
      `INSERT INTO admin_access_requests (full_name, email, reason, requested_role, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          requested_role = EXCLUDED.requested_role,
          reason = EXCLUDED.reason,
          status = 'pending',
          created_at = CURRENT_TIMESTAMP`,
      [fullName.trim(), cleanEmail, reason || '', requestedRole || 'instructor']
    );

    res.json({ success: true, message: 'Đã gửi/cập nhật yêu cầu cấp quyền thành công tới Super Admin!' });
  } catch (error) {
    console.error('Lỗi gửi đơn cấp quyền:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Gửi / Cập nhật yêu cầu đặt lại mật khẩu (Duy nhất 1 bản ghi cho 1 email)
router.post('/admin-request-reset-password', async (req, res) => {
  const { email, note } = req.body;

  try {
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const checkUser = await pool.query(
      `SELECT id, full_name FROM admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email này không tồn tại trong danh sách tài khoản quản trị!',
      });
    }

    // Luôn ghi đè cập nhật lại bản ghi của email đó, đổi status về 'pending'
    await pool.query(
      `INSERT INTO admin_password_resets (email, note, status, created_at)
       VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET
          note = EXCLUDED.note,
          status = 'pending',
          created_at = CURRENT_TIMESTAMP`,
      [cleanEmail, note ? note.trim() : '']
    );

    res.json({
      success: true,
      message: 'Yêu cầu khôi phục mật khẩu đã được chuyển đến Super Admin phê duyệt!',
    });
  } catch (error) {
    console.error('Lỗi gửi yêu cầu reset mật khẩu:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Đăng nhập sinh viên Zalo Mini App
router.post('/zalo-login', async (req, res) => {
  const { zaloId, name, avatar } = req.body;
  try {
    const validName = name || 'Sinh viên';
    const validAvatar = avatar || '';

    const userQuery = `
      INSERT INTO users (zalo_id, name, avatar, role) 
      VALUES ($1, $2, $3, 'student')
      ON CONFLICT (zalo_id) 
      DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar
      RETURNING *;
    `;
    const userResult = await pool.query(userQuery, [String(zaloId), validName, validAvatar]);
    const user = userResult.rows[0];

    let schedules = [];
    if (user.student_code) {
      const scheduleQuery = `
        SELECT * FROM student_schedules 
        WHERE student_code = $1 
        ORDER BY day_of_week, start_period ASC;
      `;
      const schedResult = await pool.query(scheduleQuery, [user.student_code]);
      schedules = schedResult.rows;
    }

    const token = jwt.sign(
      { id: user.id, zaloId: user.zalo_id, role: user.role, studentCode: user.student_code },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        zalo_id: user.zalo_id,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        student_code: user.student_code,
        class_name: user.class_name,
        total_credits: user.total_credits,
        faculty: user.faculty,
        is_linked: !!user.student_code,
      },
      schedules,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;