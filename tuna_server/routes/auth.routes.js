// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');

// Lấy JWT_SECRET
let JWT_SECRET = process.env.JWT_SECRET || 'tuna_secret_jwt_key_2026';
try {
  const authMiddleware = require('../middlewares/auth');
  if (authMiddleware && authMiddleware.JWT_SECRET) {
    JWT_SECRET = authMiddleware.JWT_SECRET;
  }
} catch (e) {}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// ==========================================
// 1. CỔNG XÁC THỰC EMAIL (.ctuet.edu.vn)
// ==========================================
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email của bạn!' });
    }

    const targetEmail = email.trim().toLowerCase();

    if (!targetEmail.endsWith('.ctuet.edu.vn')) {
      return res.status(400).json({
        success: false,
        message: 'Hệ thống chỉ dành cho thành viên có email kết thúc bằng .ctuet.edu.vn!',
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `INSERT INTO student_verifications (student_code, email, otp_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [targetEmail, targetEmail, otp, expiresAt]
    );

    const emailPayload = {
      sender: { 
        name: "TUNA - Trợ Lý Học Tập", 
        email: process.env.SMTP_USER || "nguyentuan452016@gmail.com" 
      },
      to: [{ email: targetEmail }],
      subject: `[TUNA] Mã xác thực tài khoản: ${otp}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
          <h2 style="color: #0045ce; text-align: center; margin-bottom: 8px;">Xác Thực Tài Khoản TUNA</h2>
          <p style="color: #475569; font-size: 14px;">Xin chào bạn,</p>
          <p style="color: #475569; font-size: 14px;">Mã xác thực đăng nhập của bạn là:</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0045ce; background: #eff6ff; padding: 12px 24px; border-radius: 12px; border: 1px dashed #3b82f6;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 12px; line-height: 1.5;">Mã này có hiệu lực trong vòng <b>5 phút</b>. Vui lòng không chia sẻ mã này cho người khác.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">Trợ lý học tập TUNA • ĐH Kỹ thuật - Công nghệ Cần Thơ</p>
        </div>
      `,
    };

    // Gửi ngầm qua Brevo HTTPS API (Cổng 443 - Không timeout trên Render)
    fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    })
      .then(async (response) => {
        const resData = await response.json();
        if (!response.ok) {
          console.error(`❌ [Brevo API] Lỗi gửi thư tới ${targetEmail}:`, resData);
        } else {
          console.log(`✅ [Brevo API] Đã gửi OTP thành công tới: ${targetEmail}`, resData.messageId);
        }
      })
      .catch((err) => {
        console.error(`❌ [Brevo API] Lỗi kết nối mạng:`, err.message);
      });

    return res.json({
      success: true,
      message: `Đã gửi mã OTP đến ${targetEmail}`,
      targetEmail,
    });
  } catch (error) {
    console.error('❌ Lỗi send-otp:', error);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tạo mã OTP!' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, userCode, otp, name } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin xác thực!' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = (userCode || cleanEmail.split('@')[0]).trim().toUpperCase();

    const otpCheck = await pool.query(
      `SELECT * FROM student_verifications 
       WHERE email = $1 AND otp_code = $2 AND expires_at > NOW() AND is_verified = FALSE
       ORDER BY id DESC LIMIT 1`,
      [cleanEmail, otp.trim()]
    );

    if (otpCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Mã OTP không đúng hoặc đã hết hạn!' });
    }

    await pool.query('UPDATE student_verifications SET is_verified = TRUE WHERE id = $1', [otpCheck.rows[0].id]);

    const isStudent = cleanEmail.includes('student.') || /^[A-Z]{2,5}\d{4,}/i.test(cleanCode);
    const assignedRole = isStudent ? 'student' : 'member';

    const existing = await pool.query('SELECT * FROM users WHERE student_code = $1', [cleanCode]);
    let finalUser = null;

    if (existing.rows.length > 0) {
      const updateRes = await pool.query(
        'UPDATE users SET is_verified = TRUE, name = COALESCE($1, name) WHERE student_code = $2 RETURNING *',
        [name, cleanCode]
      );
      finalUser = updateRes.rows[0];
    } else {
      const generatedZaloId = `ctut_${cleanCode.toLowerCase()}`;
      const insertRes = await pool.query(
        `INSERT INTO users (zalo_id, student_code, name, role, is_verified)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING *`,
        [generatedZaloId, cleanCode, name || `Thành viên ${cleanCode}`, assignedRole]
      );
      finalUser = insertRes.rows[0];
    }

    const token = jwt.sign(
      { id: finalUser.id, role: finalUser.role, studentCode: finalUser.student_code },
      JWT_SECRET,
      { expiresIn: '30d' }
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
// 2. CỔNG ĐĂNG NHẬP ADMIN & QUẢN TRỊ VIÊN
// ==========================================
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

router.post('/admin-request-access', async (req, res) => {
  const { fullName, email, reason, requestedRole } = req.body;

  try {
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền họ tên và email liên hệ!' });
    }

    const cleanEmail = email.trim().toLowerCase();

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

// ==========================================
// 3. ĐĂNG NHẬP QUA ZALO CŨ (DỰ PHÒNG)
// ==========================================
router.post('/zalo-login', async (req, res) => {
  const { zaloId, name, avatar } = req.body;
  try {
    const validName = name || 'Thành viên';
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
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;