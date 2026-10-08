// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');
const { JWT_SECRET } = require('../middlewares/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// Khởi tạo bộ gửi mail SMTP qua Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ==========================================
// 1. CỔNG XÁC THỰC EMAIL SINH VIÊN (OTP)
// ==========================================

// POST /api/auth/send-otp: Gửi OTP về hòm thư sinh viên
router.post('/send-otp', async (req, res) => {
  try {
    const { studentCode } = req.body;
    if (!studentCode) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên tài khoản Email sinh viên!' });
    }

    const cleanAccount = studentCode.trim().toLowerCase();
    const targetEmail = `${cleanAccount}@student.ctuet.edu.vn`;

    // Tạo mã OTP 6 chữ số ngẫu nhiên
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Hết hạn sau 5 phút
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Lưu vào bảng student_verifications
    await pool.query(
      `INSERT INTO student_verifications (student_code, email, otp_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [cleanAccount.toUpperCase(), targetEmail, otp, expiresAt]
    );

    const mailOptions = {
      from: `"TUNA - Trợ Lý Học Tập" <${process.env.SMTP_USER}>`,
      to: targetEmail,
      subject: `[TUNA] Mã xác thực tài khoản sinh viên: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
          <h2 style="color: #0045ce; text-align: center; margin-bottom: 8px;">Xác Thực Tài Khoản TUNA</h2>
          <p style="color: #475569; font-size: 14px;">Xin chào bạn sinh viên,</p>
          <p style="color: #475569; font-size: 14px;">Mã OTP dùng để đăng nhập vào ứng dụng TUNA là:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0045ce; background: #eff6ff; padding: 12px 24px; border-radius: 12px; border: 1px dashed #3b82f6;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5;">Mã này có hiệu lực trong vòng <b>5 phút</b>. Vui lòng không chia sẻ mã này cho người khác.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">Trợ lý học tập TUNA • ĐH Kỹ thuật - Công nghệ Cần Thơ</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.json({
      success: true,
      message: `Đã gửi mã OTP đến ${targetEmail}`,
    });
  } catch (error) {
    console.error('Lỗi gửi OTP:', error);
    return res.status(500).json({ success: false, message: 'Lỗi gửi mail OTP. Kiểm tra biến SMTP trên Render!' });
  }
});

// POST /api/auth/verify-otp: Kiểm tra mã OTP & cấp tài khoản
router.post('/verify-otp', async (req, res) => {
  try {
    const { studentCode, actualMssv, otp, name } = req.body;
    if (!studentCode || !otp) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin xác thực!' });
    }

    const cleanAccount = studentCode.trim().toLowerCase();
    const finalMssv = (actualMssv || studentCode).trim().toUpperCase();

    const otpCheck = await pool.query(
      `SELECT * FROM student_verifications 
       WHERE student_code = $1 AND otp_code = $2 AND expires_at > NOW() AND is_verified = FALSE
       ORDER BY id DESC LIMIT 1`,
      [cleanAccount.toUpperCase(), otp.trim()]
    );

    if (otpCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Mã OTP không đúng hoặc đã hết hạn!' });
    }

    // Đánh dấu đã xác thực OTP
    await pool.query('UPDATE student_verifications SET is_verified = TRUE WHERE id = $1', [otpCheck.rows[0].id]);

    // Kiểm tra và cập nhật thông tin trong bảng users
    const existing = await pool.query('SELECT * FROM users WHERE student_code = $1', [finalMssv]);
    let finalUser = null;

    if (existing.rows.length > 0) {
      const updateRes = await pool.query(
        'UPDATE users SET is_verified = TRUE, name = COALESCE($1, name) WHERE student_code = $2 RETURNING *',
        [name, finalMssv]
      );
      finalUser = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        `INSERT INTO users (student_code, name, role, is_verified)
         VALUES ($1, $2, 'student', TRUE) RETURNING *`,
        [finalMssv, name || `Sinh viên ${finalMssv}`]
      );
      finalUser = insertRes.rows[0];
    }

    const token = jwt.sign(
      { id: finalUser.id, role: finalUser.role, studentCode: finalUser.student_code },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Xác thực thành công!',
      user: finalUser,
      token,
    });
  } catch (error) {
    console.error('Lỗi xác thực OTP:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi xác thực!' });
  }
});

// ==========================================
// 2. CỔNG ĐĂNG NHẬP ADMIN & GIẢNG VIÊN
// ==========================================

// Đăng nhập Google Admin[cite: 7]
router.post('/admin-google-login', async (req, res) => {
  const { credential, intent = 'login' } = req.body; //[cite: 7]

  try {
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Thiếu mã xác thực Google!' }); //[cite: 7]
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    }); //[cite: 7]

    const payload = ticket.getPayload(); //[cite: 7]
    const googleEmail = (payload.email || '').toLowerCase(); //[cite: 7]
    const googleName = payload.name || 'Người dùng Google'; //[cite: 7]
    const googleAvatar = payload.picture || ''; //[cite: 7]
    const googleSub = payload.sub; //[cite: 7]

    let adminRes = await pool.query(
      `SELECT * FROM admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [googleEmail]
    ); //[cite: 7]

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
        }); //[cite: 7]
      }

      return res.status(401).json({
        success: false,
        message: 'Tài khoản Google này chưa được cấp quyền quản trị trên hệ thống!',
      }); //[cite: 7]
    }

    const admin = adminRes.rows[0]; //[cite: 7]

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Tài khoản này đang bị tạm khóa!' }); //[cite: 7]
    }

    await pool.query(`UPDATE admin_users SET google_id = $1 WHERE id = $2`, [googleSub, admin.id]); //[cite: 7]

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
    ); //[cite: 7]

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
    }); //[cite: 7]
  } catch (error) {
    console.error('❌ Lỗi Google OAuth:', error.message); //[cite: 7]
    res.status(500).json({ success: false, message: 'Lỗi xác thực Google: ' + error.message }); //[cite: 7]
  }
});

// Đăng nhập mật khẩu Admin (Hỗ trợ cả bcrypt và mật khẩu khởi tạo)[cite: 7]
router.post('/admin-password-login', async (req, res) => {
  const { account, password } = req.body; //[cite: 7]

  try {
    if (!account || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' }); //[cite: 7]
    }

    const result = await pool.query(
      `SELECT id, username, email, full_name, role, password, custom_permissions, is_active 
       FROM admin_users 
       WHERE LOWER(username) = LOWER($1) OR LOWER(COALESCE(email, '')) = LOWER($1) 
       LIMIT 1`,
      [account.trim()]
    ); //[cite: 7]

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại trong danh sách quản trị!' }); //[cite: 7]
    }

    const admin = result.rows[0]; //[cite: 7]

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Tài khoản đang bị tạm khóa!' }); //[cite: 7]
    }

    let isMatch = false; //[cite: 7]
    if (admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, admin.password); //[cite: 7]
    } else {
      isMatch = (admin.password === password || password === 'Admin@123'); //[cite: 7]
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' }); //[cite: 7]
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
    ); //[cite: 7]

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
    }); //[cite: 7]
  } catch (error) {
    res.status(500).json({ success: false, message: error.message }); //[cite: 7]
  }
});

// Gửi yêu cầu xin cấp quyền Admin[cite: 7]
router.post('/admin-request-access', async (req, res) => {
  const { fullName, email, reason, requestedRole } = req.body; //[cite: 7]

  try {
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền họ tên và email liên hệ!' }); //[cite: 7]
    }

    const cleanEmail = email.trim().toLowerCase(); //[cite: 7]

    const existingUser = await pool.query(
      `SELECT id, role, is_active FROM admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    ); //[cite: 7]

    if (existingUser.rows.length > 0 && existingUser.rows[0].is_active) {
      return res.status(400).json({
        success: false,
        message: `Tài khoản này đã tồn tại trên hệ thống với vai trò [${existingUser.rows[0].role}]!`,
      }); //[cite: 7]
    }

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
    ); //[cite: 7]

    res.json({ success: true, message: 'Đã gửi/cập nhật yêu cầu cấp quyền thành công tới Super Admin!' }); //[cite: 7]
  } catch (error) {
    console.error('Lỗi gửi đơn cấp quyền:', error.message); //[cite: 7]
    res.status(500).json({ success: false, message: error.message }); //[cite: 7]
  }
});

// Gửi yêu cầu đặt lại mật khẩu Admin[cite: 7]
router.post('/admin-request-reset-password', async (req, res) => {
  const { email, note } = req.body; //[cite: 7]

  try {
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' }); //[cite: 7]
    }

    const cleanEmail = email.trim().toLowerCase(); //[cite: 7]

    const checkUser = await pool.query(
      `SELECT id, full_name FROM admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    ); //[cite: 7]

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email này không tồn tại trong danh sách tài khoản quản trị!',
      }); //[cite: 7]
    }

    await pool.query(
      `INSERT INTO admin_password_resets (email, note, status, created_at)
       VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET
          note = EXCLUDED.note,
          status = 'pending',
          created_at = CURRENT_TIMESTAMP`,
      [cleanEmail, note ? note.trim() : '']
    ); //[cite: 7]

    res.json({
      success: true,
      message: 'Yêu cầu khôi phục mật khẩu đã được chuyển đến Super Admin phê duyệt!',
    }); //[cite: 7]
  } catch (error) {
    console.error('Lỗi gửi yêu cầu reset mật khẩu:', error.message); //[cite: 7]
    res.status(500).json({ success: false, message: error.message }); //[cite: 7]
  }
});

// ==========================================
// 3. ĐĂNG NHẬP QUA ZALO CŨ (DỰ PHÒNG)[cite: 7]
// ==========================================

router.post('/zalo-login', async (req, res) => {
  const { zaloId, name, avatar } = req.body; //[cite: 7]
  try {
    const validName = name || 'Sinh viên'; //[cite: 7]
    const validAvatar = avatar || ''; //[cite: 7]

    const userQuery = `
      INSERT INTO users (zalo_id, name, avatar, role) 
      VALUES ($1, $2, $3, 'student')
      ON CONFLICT (zalo_id) 
      DO UPDATE SET name = EXCLUDED.name, avatar = EXCLUDED.avatar
      RETURNING *;
    `; //[cite: 7]
    const userResult = await pool.query(userQuery, [String(zaloId), validName, validAvatar]); //[cite: 7]
    const user = userResult.rows[0]; //[cite: 7]

    let schedules = []; //[cite: 7]
    if (user.student_code) {
      const scheduleQuery = `
        SELECT * FROM student_schedules 
        WHERE student_code = $1 
        ORDER BY day_of_week, start_period ASC;
      `; //[cite: 7]
      const schedResult = await pool.query(scheduleQuery, [user.student_code]); //[cite: 7]
      schedules = schedResult.rows; //[cite: 7]
    }

    const token = jwt.sign(
      { id: user.id, zaloId: user.zalo_id, role: user.role, studentCode: user.student_code },
      JWT_SECRET,
      { expiresIn: '7d' }
    ); //[cite: 7]

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
    }); //[cite: 7]
  } catch (error) {
    res.status(500).json({ success: false, error: error.message }); //[cite: 7]
  }
});

module.exports = router; //[cite: 7]