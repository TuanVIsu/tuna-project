// backend/routes/auth.js
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const { Pool } = require("pg"); // Hoặc connection pool của bạn

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Cấu hình Nodemailer gửi qua Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// 1. API GỬI MÃ OTP VỀ EMAIL TRƯỜNG
router.post("/send-otp", async (req, res) => {
  try {
    const { studentCode } = req.body;
    if (!studentCode) {
      return res.status(400).json({ success: false, message: "Vui lòng nhập MSSV!" });
    }

    const cleanCode = studentCode.trim().toLowerCase();
    const targetEmail = `${cleanCode}@ctuet.edu.vn`;

    // Tạo mã OTP ngẫu nhiên gồm 6 chữ số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Hết hạn sau 5 phút
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Lưu mã OTP vào database
    await pool.query(
      `INSERT INTO student_verifications (student_code, email, otp_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [cleanCode.toUpperCase(), targetEmail, otp, expiresAt]
    );

    // Mẫu Email thông báo đẹp mắt
    const mailOptions = {
      from: `"TUNA - Trợ Lý Học Tập" <${process.env.SMTP_USER}>`,
      to: targetEmail,
      subject: `[TUNA] Mã xác thực tài khoản sinh viên: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 16px;">
          <h2 style="color: #0045ce; text-align: center;">Xác Thực Tài Khoản TUNA</h2>
          <p>Xin chào bạn sinh viên mang mã số <b>${cleanCode.toUpperCase()}</b>,</p>
          <p>Mã xác thực (OTP) của bạn là:</p>
          <div style="text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0045ce; background: #eff6ff; padding: 10px 24px; border-radius: 12px; border: 1px dashed #3b82f6;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 13px;">Mã này có hiệu lực trong vòng <b>5 phút</b>. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center;">Hệ thống học tập cá nhân hóa TUNA - ĐH Kỹ thuật Công nghệ Cần Thơ</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.json({ 
      success: true, 
      message: `Đã gửi mã OTP đến ${targetEmail}`,
      emailMasked: `${cleanCode.slice(0, 4)}***@ctuet.edu.vn`
    });
  } catch (error) {
    console.error("Lỗi gửi OTP:", error);
    return res.status(500).json({ success: false, message: "Không thể gửi email OTP. Vui lòng thử lại sau!" });
  }
});

// 2. API XÁC THỰC MÃ OTP VÀ KÍCH HOẠT TÀI KHOẢN
router.post("/verify-otp", async (req, res) => {
  try {
    const { studentCode, otp, name, className, faculty } = req.body;
    if (!studentCode || !otp) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin xác thực!" });
    }

    const cleanCode = studentCode.trim().toUpperCase();

    // Kiểm tra OTP hợp lệ và chưa hết hạn
    const otpResult = await pool.query(
      `SELECT * FROM student_verifications 
       WHERE student_code = $1 AND otp_code = $2 AND expires_at > NOW() AND is_verified = FALSE
       ORDER BY id DESC LIMIT 1`,
      [cleanCode, otp.trim()]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Mã OTP không đúng hoặc đã hết hạn!" });
    }

    // Đánh dấu OTP đã sử dụng
    await pool.query(
      `UPDATE student_verifications SET is_verified = TRUE WHERE id = $1`,
      [otpResult.rows[0].id]
    );

    // Cập nhật hoặc thêm mới sinh viên vào bảng users
    const existingUser = await pool.query(`SELECT * FROM users WHERE student_code = $1`, [cleanCode]);
    let finalUser = null;

    if (existingUser.rows.length > 0) {
      const updateRes = await pool.query(
        `UPDATE users SET is_verified = TRUE, name = COALESCE($1, name) WHERE student_code = $2 RETURNING *`,
        [name, cleanCode]
      );
      finalUser = updateRes.rows[0];
    } else {
      const insertRes = await pool.query(
        `INSERT INTO users (student_code, name, class_name, faculty, role, is_verified)
         VALUES ($1, $2, $3, $4, 'student', TRUE) RETURNING *`,
        [cleanCode, name || `Sinh viên ${cleanCode}`, className || "BOOO0000001", faculty || "Hệ Thống Thông Tin"]
      );
      finalUser = insertRes.rows[0];
    }

    return res.json({
      success: true,
      message: "Xác thực danh tính sinh viên thành công!",
      user: finalUser,
      token: `token_${finalUser.student_code}_${Date.now()}`
    });
  } catch (error) {
    console.error("Lỗi xác minh OTP:", error);
    return res.status(500).json({ success: false, message: "Lỗi hệ thống khi xác thực OTP!" });
  }
});

module.exports = router;