// tuna_server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { OAuth2Client } = require('google-auth-library');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

const JWT_SECRET = process.env.JWT_SECRET || 'tuna_secret_key';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

// Cấu hình Gemini AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  apiVersion: 'v1',
});

// Cấu hình Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Tạo thư mục uploads tĩnh nếu chưa có
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Cấu hình Multer lưu trữ tài liệu tải lên
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage });

// Kết nối PostgreSQL Database (Định nghĩa trước các route)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'tuna_project_db',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Lỗi kết nối PostgreSQL:', err.message);
  } else {
    console.log('✅ Đã kết nối thành công đến PostgreSQL database: tuna_project_db!');
    release();
  }
});

// Tự động kiểm tra các cột mở rộng
pool.query(`
  ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS is_doc_saved BOOLEAN DEFAULT false;
  ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS is_daily BOOLEAN DEFAULT false;
  ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS daily_date DATE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE;
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS google_id VARCHAR(100);
`).catch((err) => console.error('Lỗi cập nhật schema:', err.message));

// Middleware xác thực JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Chưa đăng nhập' });

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) return res.status(403).json({ message: 'Token không hợp lệ' });
    req.user = decodedUser;
    next();
  });
};

// Danh sách model hợp lệ của Google
const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

async function generateContentWithFallback(prompt, config) {
  let lastError = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      console.log(`🤖 Đang thử gọi model: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config,
      });

      console.log(`✅ Gọi thành công qua model: ${modelName}`);
      return response.text;
    } catch (err) {
      console.warn(`⚠️ Model ${modelName} gặp sự cố: ${err.message}. Đang chuyển model dự phòng...`);
      lastError = err;
    }
  }

  throw new Error(`Tất cả model Gemini đều không khả dụng: ${lastError?.message}`);
}

// ==================== 1. XÁC THỰC GOOGLE OAUTH CHO SUPER ADMIN ====================
// ==================== 1. XÁC THỰC GOOGLE VÀ PHÂN QUYỀN ADMIN ====================

// API ĐĂNG NHẬP GOOGLE (Phân biệt giữa Login thông thường và Yêu cầu cấp quyền)
app.post('/api/auth/admin-google-login', async (req, res) => {
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

    // TRƯỜNG HỢP: TÀI KHOẢN CHƯA ĐƯỢC CẤP QUYỀN TRONG HỆ THỐNG
    if (adminRes.rows.length === 0) {
      // Nếu người dùng chủ động bấm link "Yêu cầu cấp quyền" -> Cho phép mở form điền thông tin
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

      // Nếu người dùng bấm nút Google để đăng nhập thông thường -> Báo sai tài khoản
      return res.status(401).json({
        success: false,
        message: 'Tài khoản Google này chưa được cấp quyền quản trị trên hệ thống!',
      });
    }

    const admin = adminRes.rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ success: false, message: 'Tài khoản này đang bị tạm khóa!' });
    }

    await pool.query(
      `UPDATE admin_users SET google_id = $1 WHERE id = $2`,
      [googleSub, admin.id]
    );

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
// ==================== QUẢN TRỊ VIÊN & PHÊ DUYỆT (SUPER ADMIN ONLY) ====================

// Middleware kiểm tra quyền Super Admin
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Chỉ Super Admin mới có quyền thực hiện thao tác này!' });
  }
  next();
};

// 1. Lấy danh sách tài khoản Admin
app.get('/api/admin/staff', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, full_name AS "fullName", role, is_active AS "isActive",
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM admin_users ORDER BY id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Tạo tài khoản Admin mới thủ công
app.post('/api/admin/staff', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { username, email, fullName, role, password } = req.body;
  try {
    if (!username || !email || !fullName) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ tên đăng nhập, email và họ tên!' });
    }

    const defaultPwd = password?.trim() || 'Admin@123';
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    const insertRes = await pool.query(
      `INSERT INTO admin_users (username, email, full_name, role, password, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id, username, email, full_name AS "fullName", role`,
      [cleanUsername, cleanEmail, fullName.trim(), role || 'instructor', defaultPwd]
    );

    res.json({ success: true, message: 'Đã tạo tài khoản thành công!', data: insertRes.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Tên đăng nhập hoặc email đã tồn tại!' });
  }
});

// 3. Khóa / Mở khóa tài khoản Admin
app.patch('/api/admin/staff/:id/toggle', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT is_active, role FROM admin_users WHERE id = $1`, [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    if (check.rows[0].role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Không thể khóa tài khoản Super Admin!' });
    }

    const newStatus = !check.rows[0].is_active;
    await pool.query(`UPDATE admin_users SET is_active = $1 WHERE id = $2`, [newStatus, id]);
    res.json({ success: true, isActive: newStatus, message: newStatus ? 'Đã kích hoạt tài khoản' : 'Đã khóa tài khoản' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Lấy danh sách yêu cầu xin cấp quyền Google
app.get('/api/admin/access-requests', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name AS "fullName", email, requested_role AS "requestedRole", reason, 
              COALESCE(status, 'pending') AS status,
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM admin_access_requests ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Duyệt đơn xin cấp quyền Google -> Tự tạo tài khoản vào admin_users
app.post('/api/admin/approve-access', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { requestId, email, fullName, role } = req.body;
  try {
    const generatedUsername = email.split('@')[0];

    // Thêm vào admin_users nếu chưa có
    await pool.query(
      `INSERT INTO admin_users (username, email, full_name, role, password, is_active)
       VALUES ($1, $2, $3, $4, 'Admin@123', true)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, is_active = true`,
      [generatedUsername, email.toLowerCase(), fullName, role || 'instructor']
    );

    // Cập nhật trạng thái đơn duyệt
    await pool.query(`UPDATE admin_access_requests SET status = 'approved' WHERE id = $1`, [requestId]);
    res.json({ success: true, message: `Đã cấp quyền thành công cho ${fullName}!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Lấy danh sách yêu cầu đặt lại mật khẩu
app.get('/api/admin/password-resets', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.email, r.note, r.status, 
              TO_CHAR(r.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
              u.full_name AS "fullName", u.role
       FROM admin_password_resets r
       LEFT JOIN admin_users u ON LOWER(u.email) = LOWER(r.email)
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Duyệt đặt lại mật khẩu (Mặc định reset về Admin@123 hoặc pass tùy chọn)
app.post('/api/admin/approve-reset-password', authenticateToken, requireSuperAdmin, async (req, res) => {
  const { requestId, email, newPassword = 'Admin@123' } = req.body;
  try {
    await pool.query(
      `UPDATE admin_users SET password = $1 WHERE LOWER(email) = LOWER($2)`,
      [newPassword.trim(), email.trim()]
    );
    await pool.query(`UPDATE admin_password_resets SET status = 'approved' WHERE id = $1`, [requestId]);
    res.json({ success: true, message: `Đã đặt lại mật khẩu của ${email} thành: ${newPassword}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// API Tiếp nhận yêu cầu đặt lại mật khẩu gửi cho Super Admin
app.post('/api/auth/admin-request-reset-password', async (req, res) => {
  const { email, note } = req.body;

  try {
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Kiểm tra xem email có thuộc quyền quản trị không
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

    // Đưa vào bảng admin_password_resets để Super Admin duyệt
    await pool.query(
      `INSERT INTO admin_password_resets (email, note, status) VALUES ($1, $2, 'pending')`,
      [cleanEmail, note ? note.trim() : '']
    );

    res.json({
      success: true,
      message: 'Yêu cầu đặt lại mật khẩu đã được gửi đến Super Admin phê duyệt!',
    });
  } catch (error) {
    console.error('❌ Lỗi gửi yêu cầu reset mật khẩu:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1. Đăng nhập bằng tài khoản được Admin cấp (Username/Email + Password)
// Đăng nhập bằng tài khoản do Admin cấp (Username hoặc Email + Password)
app.post('/api/auth/admin-password-login', async (req, res) => {
  const { account, password } = req.body;

  try {
    if (!account || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tài khoản và mật khẩu!' });
    }

    // Tra cứu theo username hoặc email
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

    // Cho phép mật khẩu đúng hoặc mật khẩu mặc định khởi tạo Admin@123
    const isMatch = (admin.password === password || password === 'Admin@123');
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' });
    }

    // Cấp token đăng nhập
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
    console.error('Lỗi đăng nhập mật khẩu:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Gửi yêu cầu xin cấp quyền truy cập Quản trị
app.post('/api/auth/admin-request-access', async (req, res) => {
  const { fullName, email, reason, requestedRole } = req.body;

  try {
    if (!fullName || !email) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền họ tên và email liên hệ!' });
    }

    // Chỉ thực hiện lệnh INSERT trực tiếp vào bảng đã có sẵn trong CSDL
    await pool.query(
      `INSERT INTO admin_access_requests (full_name, email, reason, requested_role)
       VALUES ($1, $2, $3, $4)`,
      [fullName.trim(), email.trim().toLowerCase(), reason || '', requestedRole || 'instructor']
    );

    res.json({ success: true, message: 'Yêu cầu cấp quyền đã được chuyển đến Super Admin phê duyệt!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// API: Super Admin lấy danh sách các yêu cầu quên mật khẩu cần duyệt (Dành cho trang Dashboard của Super Admin)
app.get('/api/admin/password-resets', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.email, r.note, r.status, 
              TO_CHAR(r.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
              u.full_name AS "fullName", u.username, u.role
       FROM admin_password_resets r
       LEFT JOIN admin_users u ON LOWER(u.email) = LOWER(r.email)
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Super Admin phê duyệt & đặt lại mật khẩu mới cho tài khoản (Ví dụ reset về: Admin@123)
app.post('/api/admin/approve-reset-password', authenticateToken, async (req, res) => {
  const { requestId, email, newPassword = 'Admin@123' } = req.body;

  try {
    // Cập nhật mật khẩu mới cho admin_user
    await pool.query(
      `UPDATE admin_users SET password = $1 WHERE LOWER(email) = LOWER($2)`,
      [newPassword, email.trim()]
    );

    // Cập nhật trạng thái yêu cầu đã xử lý
    await pool.query(
      `UPDATE admin_password_resets SET status = 'approved' WHERE id = $1`,
      [requestId]
    );

    res.json({
      success: true,
      message: `Đã duyệt thành công! Mật khẩu tài khoản ${email} đã được đặt lại thành: ${newPassword}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// ==================== 2. XÁC THỰC SINH VIÊN ZALO MINI APP ====================

app.post('/api/auth/zalo-login', async (req, res) => {
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

app.post('/api/student/link', async (req, res) => {
  const { zaloId, studentCode, className, totalCredits, faculty, initialSchedules } = req.body;
  try {
    await pool.query(
      `UPDATE users 
       SET student_code = $1, class_name = $2, total_credits = $3, faculty = $4 
       WHERE zalo_id = $5`,
      [studentCode, className, totalCredits, faculty, zaloId]
    );

    if (initialSchedules && initialSchedules.length > 0) {
      for (const item of initialSchedules) {
        await pool.query(
          `INSERT INTO student_schedules (student_code, subject_code, subject_name, credits, day_of_week, start_period, end_period, room, teacher_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [studentCode, item.subjectCode, item.subjectName, item.credits, item.dayOfWeek, item.startPeriod, item.endPeriod, item.room, item.teacherName]
        );
      }
    }

    res.json({ success: true, message: 'Đồng bộ thời khóa biểu thành công!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 3. QUẢN LÝ TÀI LIỆU CÁ NHÂN ====================

app.get('/api/documents', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, size, content, download_url AS "downloadUrl", 
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as date 
       FROM user_documents ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/documents', async (req, res) => {
  const { id, name, size, content, downloadUrl } = req.body;
  try {
    if (!id || !name || !content) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bắt buộc (id, name, content)' });
    }

    const cleanContent = String(content).replace(/\0/g, '');
    const cleanName = String(name).replace(/\0/g, '');

    await pool.query(
      `INSERT INTO user_documents (id, name, size, content, download_url) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, 
          content = EXCLUDED.content,
          size = EXCLUDED.size,
          download_url = EXCLUDED.download_url`,
      [String(id), cleanName, String(size || ''), cleanContent, downloadUrl || '']
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 4. QUẢN LÝ BÀI TẬP VÀ TIẾN ĐỘ THI ====================

app.get('/api/tasks', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, feature_id AS "featureId", doc_name AS "docName", status, config, 
              result_data AS "resultData", error_message AS "errorMessage", 
              COALESCE(is_saved, false) AS "isSaved",
              COALESCE(is_doc_saved, false) AS "isDocSaved",
              COALESCE(is_daily, false) AS "isDaily",
              TO_CHAR(daily_date, 'YYYY-MM-DD') AS "dailyDate",
              COALESCE(hidden_in_history, false) AS "hiddenInHistory",
              TO_CHAR(created_at, 'HH24:MI') as time 
       FROM ai_tasks ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { 
    id, featureId, docName, status, config, resultData, 
    errorMessage, isSaved, isDocSaved, isDaily, dailyDate, hiddenInHistory 
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO ai_tasks (id, feature_id, doc_name, status, config, result_data, error_message, is_saved, is_doc_saved, is_daily, daily_date, hidden_in_history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET 
          status = EXCLUDED.status, 
          result_data = EXCLUDED.result_data, 
          error_message = EXCLUDED.error_message,
          is_saved = EXCLUDED.is_saved,
          is_doc_saved = EXCLUDED.is_doc_saved,
          is_daily = EXCLUDED.is_daily,
          daily_date = EXCLUDED.daily_date,
          hidden_in_history = EXCLUDED.hidden_in_history`,
      [
        id, 
        featureId, 
        docName, 
        status, 
        JSON.stringify(config), 
        JSON.stringify(resultData), 
        errorMessage || '',
        Boolean(isSaved),
        Boolean(isDocSaved),
        Boolean(isDaily),
        dailyDate || null,
        Boolean(hiddenInHistory),
      ]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/quiz/attempt', async (req, res) => {
  const { questionId, subject, userId, isCorrect, selectedAnswer } = req.body;
  try {
    await pool.query(
      `INSERT INTO quiz_answer_attempts (question_id, subject, user_id, is_correct, selected_answer)
       VALUES ($1, $2, $3, $4, $5)`,
      [questionId || null, subject, String(userId || 'sv_01'), Boolean(isCorrect), selectedAnswer || '']
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 5. MÔN HỌC & LẬP LỊCH TRÌNH WRR ====================

app.get('/api/curriculum/subjects', async (req, res) => {
  const { major, year, semester } = req.query;
  try {
    const query = `
      SELECT subject_name AS "subjectName", credits, difficulty_base AS "difficultyBase"
      FROM curriculum_subjects
      WHERE faculty_major = $1 AND academic_year = $2 AND semester = $3
      ORDER BY id ASC
    `;
    const { rows } = await pool.query(query, [major, Number(year) || 1, Number(semester) || 1]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/timelines', async (req, res) => {
  const { userId, startDate, endDate } = req.query;
  const currentUserId = String(userId || 'sv_01');

  try {
    let query = `
      SELECT id, subject, goal_level AS "goalLevel", 
             TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
             time_slot AS "timeSlot", task_type AS "taskType",
             title, description, duration_minutes AS "durationMinutes",
             is_completed AS "isCompleted", action_target AS "actionTarget"
      FROM learning_timelines
      WHERE user_id = $1
    `;
    const params = [currentUserId];

    if (startDate && endDate) {
      params.push(startDate, endDate);
      query += ` AND timeline_date BETWEEN $2 AND $3`;
    }

    query += ` ORDER BY timeline_date ASC, time_slot ASC`;
    const { rows } = await pool.query(query, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/timelines/generate-wrr-plan', async (req, res) => {
  const { 
    userId, 
    facultyMajor = 'Hệ Thống Thông Tin', 
    year = 1, 
    semester = 1, 
    subjects = [], 
    subjectLevels = {}, 
    goalLevel = 'KhaGioi', 
    currentGpa = 3.0,
    dailyPace = 15, 
    startDate,
  } = req.body;

  const currentUserId = String(userId || 'sv_01');
  const pace = Number(dailyPace) || 15;
  const start = startDate ? new Date(startDate) : new Date();

  try {
    let targetSubjects = Array.isArray(subjects) && subjects.length > 0 ? subjects : [];
    if (targetSubjects.length === 0) {
      const currRes = await pool.query(
        `SELECT subject_name FROM curriculum_subjects 
         WHERE faculty_major = $1 AND academic_year = $2 AND semester = $3`,
        [facultyMajor, Number(year) || 1, Number(semester) || 1]
      );
      targetSubjects = currRes.rows.map((r) => r.subject_name);
    }
    
    if (targetSubjects.length === 0) {
      targetSubjects = ['Cơ sở dữ liệu (Database)', 'Cấu trúc dữ liệu và giải thuật'];
    }

    const payloadSubjects = [];

    for (const sub of targetSubjects) {
      const subInfo = await pool.query(
        `SELECT credits, difficulty_base FROM curriculum_subjects WHERE subject_name ILIKE $1 LIMIT 1`,
        [`%${sub}%`]
      );
      const credits = subInfo.rows[0]?.credits || 3;

      const quizRes = await pool.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_correct = true) as correct
         FROM quiz_answer_attempts WHERE user_id = $1 AND subject ILIKE $2`,
        [currentUserId, `%${sub}%`]
      );

      const examRes = await pool.query(
        `SELECT 1 FROM custom_schedules 
         WHERE (user_id = (SELECT id FROM users WHERE zalo_id = $1 OR student_code = $1 LIMIT 1) OR zalo_id = $1)
           AND category IN ('Kiểm tra', 'Lịch thi', 'exam')
           AND title ILIKE $2
           AND schedule_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
         LIMIT 1`,
        [currentUserId, `%${sub}%`]
      );

      payloadSubjects.push({
        subject_name: sub,
        credits: credits,
        quiz_total: Number(quizRes.rows[0]?.total || 0),
        quiz_correct: Number(quizRes.rows[0]?.correct || 0),
        is_near_exam: examRes.rows.length > 0,
        user_level: subjectLevels[sub] || 'medium',
      });
    }

    const pyResponse = await fetch('http://localhost:5001/api/schedule/wrr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        subjects: payloadSubjects, 
        total_days: 28, 
        goal_level: goalLevel,
        current_gpa: Number(currentGpa) || 3.0,
      }),
    });

    if (!pyResponse.ok) {
      throw new Error(`Dịch vụ Python trả về mã lỗi HTTP: ${pyResponse.status}`);
    }

    const pyData = await pyResponse.json();
    if (!pyData.success) {
      throw new Error('Dịch vụ Python báo lỗi trong quá trình chạy WRR');
    }

    for (const w of pyData.weights) {
      await pool.query(
        `INSERT INTO subject_learning_weights 
         (user_id, subject_name, calculated_weight, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, subject_name)
         DO UPDATE SET calculated_weight = EXCLUDED.calculated_weight, updated_at = CURRENT_TIMESTAMP`,
        [currentUserId, w.subject, w.weight]
      );
    }

    await pool.query(`DELETE FROM learning_timelines WHERE user_id = $1`, [currentUserId]);

    const insertedRows = [];

    for (let dayIdx = 0; dayIdx < pyData.schedule_plan.length; dayIdx++) {
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + dayIdx);
      const dateStr = targetDate.toISOString().split('T')[0];
      const dayOfWeek = targetDate.getDay() === 0 ? 8 : targetDate.getDay() + 1;

      const schoolSchedules = await pool.query(
        `SELECT start_period, end_period FROM student_schedules 
         WHERE student_code = (SELECT student_code FROM users WHERE zalo_id = $1 OR id::text = $1 LIMIT 1)
           AND day_of_week = $2`,
        [currentUserId, dayOfWeek]
      );

      const hasMorningClass = schoolSchedules.rows.some((s) => s.start_period <= 5);

      const availableTimeSlots = [];
      if (!hasMorningClass) availableTimeSlots.push('07:45 - 08:30');
      availableTimeSlots.push('12:00 - 12:45');
      availableTimeSlots.push('18:30 - 19:15');
      availableTimeSlots.push('19:45 - 20:30');
      availableTimeSlots.push('21:00 - 21:45');

      const dayTasks = pyData.schedule_plan[dayIdx];

      for (let taskIdx = 0; taskIdx < dayTasks.length; taskIdx++) {
        const task = dayTasks[taskIdx];
        const assignedTimeSlot = availableTimeSlots[taskIdx % availableTimeSlots.length];
        const matchedWeight = pyData.weights.find((w) => w.subject === task.subject)?.weight || 1.0;

        const description = task.task_type === 'doc_study'
          ? `Đọc hiểu kiến thức nền tảng & slide lý thuyết (Ưu tiên: ${matchedWeight})`
          : task.task_type === 'quiz'
          ? `Thực hành làm đề trắc nghiệm vận dụng kiến thức (Ưu tiên: ${matchedWeight})`
          : `Ghi nhớ nhanh các định nghĩa & thuật ngữ cốt lõi (Ưu tiên: ${matchedWeight})`;

        const actionTarget = task.task_type === 'doc_study' ? 'docs' : 'tasks';

        const insertRes = await pool.query(
          `INSERT INTO learning_timelines 
           (user_id, subject, goal_level, timeline_date, time_slot, task_type, title, description, duration_minutes, is_completed, action_target)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
           RETURNING id, subject, goal_level AS "goalLevel", TO_CHAR(timeline_date, 'YYYY-MM-DD') AS "timelineDate",
                     time_slot AS "timeSlot", task_type AS "taskType", title, description,
                     duration_minutes AS "durationMinutes", is_completed AS "isCompleted", action_target AS "actionTarget"`,
          [
            currentUserId,
            task.subject,
            goalLevel,
            dateStr,
            assignedTimeSlot,
            task.task_type,
            task.title,
            description,
            pace,
            actionTarget,
          ]
        );
        insertedRows.push(insertRes.rows[0]);
      }
    }

    res.json({
      success: true,
      algorithm: 'Smooth Weighted Round Robin (SWRR)',
      goalLevel,
      slotsPerDay: pyData.slots_per_day,
      weights: pyData.weights,
      totalInserted: insertedRows.length,
      data: insertedRows,
    });
  } catch (err) {
    console.error('❌ Lỗi tạo lịch WRR:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 6. QUẢN LÝ STREAK ĐIỂM DANH ====================

app.get('/api/streak/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const query = `SELECT * FROM user_streaks WHERE user_id = $1`;
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return res.json({ success: true, current_streak: 0, longest_streak: 0, last_completed_date: null });
    }

    const streakData = result.rows[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (streakData.last_completed_date) {
      const lastDate = new Date(streakData.last_completed_date);
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays > 1) {
        await pool.query(
          `UPDATE user_streaks SET current_streak = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
          [userId]
        );
        streakData.current_streak = 0;
      }
    }

    res.json({
      success: true,
      current_streak: streakData.current_streak,
      longest_streak: streakData.longest_streak,
      last_completed_date: streakData.last_completed_date,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/streak/complete', async (req, res) => {
  const { userId } = req.body;
  try {
    if (!userId) return res.status(400).json({ success: false, error: 'Thiếu userId' });

    const checkQuery = `SELECT * FROM user_streaks WHERE user_id = $1`;
    const checkResult = await pool.query(checkQuery, [userId]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    if (checkResult.rows.length === 0) {
      const insertQuery = `
        INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_completed_date, updated_at)
        VALUES ($1, 1, 1, $2, CURRENT_TIMESTAMP) RETURNING *;
      `;
      const insertResult = await pool.query(insertQuery, [userId, todayStr]);
      return res.json({ success: true, streak: insertResult.rows[0] });
    }

    const streakRecord = checkResult.rows[0];
    const lastDate = streakRecord.last_completed_date ? new Date(streakRecord.last_completed_date) : null;
    
    if (lastDate) {
      lastDate.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return res.json({ success: true, streak: streakRecord, message: 'Đã điểm danh hôm nay' });
      }

      let newStreak = diffDays === 1 ? Number(streakRecord.current_streak) + 1 : 1;
      const newLongest = Math.max(newStreak, Number(streakRecord.longest_streak || 0));

      const updateQuery = `
        UPDATE user_streaks
        SET current_streak = $1, longest_streak = $2, last_completed_date = $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4 RETURNING *;
      `;
      const updateResult = await pool.query(updateQuery, [newStreak, newLongest, todayStr, userId]);
      return res.json({ success: true, streak: updateResult.rows[0] });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 7. THỜI KHÓA BIỂU & HỌC LIỆU ====================

app.get('/api/schedules', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, TO_CHAR(schedule_date, 'YYYY-MM-DD') AS date, 
              time_slot AS time, location, category
       FROM custom_schedules 
       WHERE user_id = $1 OR zalo_id = $2 
       ORDER BY schedule_date ASC, time_slot ASC`,
      [req.user.id, req.user.zaloId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/schedules', authenticateToken, async (req, res) => {
  const { title, date, time, location, category } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO custom_schedules (user_id, zalo_id, title, schedule_date, time_slot, location, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, req.user.zaloId, title, date, time, location || 'Phòng học', category || 'Chính khóa']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM custom_schedules WHERE id = $1 AND (user_id = $2 OR zalo_id = $3)`,
      [req.params.id, req.user.id, req.user.zaloId]
    );
    res.json({ success: true, message: 'Đã xóa lịch học' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/library', async (req, res) => {
  const { major, year, semester, subject, isReference } = req.query;
  try {
    let query = `SELECT id, faculty_majors AS "facultyMajors", academic_year AS "year", 
                        semester, subject_name AS "subject", is_reference AS "isReference",
                        resource_type AS "resourceType", title, file_type AS type, 
                        file_size AS size, download_url AS "downloadUrl", 
                        embed_url AS "embedUrl", duration, author,
                        TO_CHAR(created_at, 'DD/MM/YYYY') as "date"
                 FROM admin_library_resources WHERE 1=1`;
    const params = [];

    if (major && major !== 'Tất cả' && major !== 'all') {
      params.push(major);
      query += ` AND $${params.length} = ANY(faculty_majors)`;
    }
    if (year && year !== 'all') {
      params.push(Number(year));
      query += ` AND academic_year = $${params.length}`;
    }
    if (semester && semester !== 'all') {
      params.push(Number(semester));
      query += ` AND semester = $${params.length}`;
    }
    if (subject && subject !== 'all') {
      params.push(subject);
      query += ` AND subject_name = $${params.length}`;
    }
    if (isReference !== undefined && isReference !== 'all') {
      params.push(isReference === 'true');
      query += ` AND is_reference = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, params);
    res.json({
      success: true,
      total: rows.length,
      docs: rows.filter((r) => r.resourceType === 'doc'),
      videos: rows.filter((r) => r.resourceType === 'video'),
      all: rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 8. REALTIME COMMUNITY CHAT (SOCKET.IO) ====================

app.get('/api/community/messages/:category', async (req, res) => {
  const { category } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, category, user_id, user_name, avatar, content, image_url, is_ai, 
              TO_CHAR(created_at, 'HH24:MI') as time,
              TO_CHAR(created_at, 'YYYY-MM-DD') as date
       FROM community_messages 
       WHERE category = $1 
       ORDER BY created_at ASC LIMIT 100`,
      [category || 'all']
    );
    res.json({ success: true, messages: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

io.on('connection', (socket) => {
  socket.on('join_room', (category) => socket.join(category));
  socket.on('leave_room', (category) => socket.leave(category));

  socket.on('send_message', async (data) => {
    const { category, userId, userName, avatar, content, imageUrl, isAnonymous } = data;
    if ((!content || !content.trim()) && !imageUrl) return;

    try {
      const displayName = isAnonymous ? userName || 'Sinh viên ẩn danh' : userName;
      const insertQuery = `
        INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url, is_ai)
        VALUES ($1, $2, $3, $4, $5, $6, false)
        RETURNING id, category, user_id, user_name, avatar, content, image_url, is_ai,
                  TO_CHAR(created_at, 'HH24:MI') as time,
                  TO_CHAR(created_at, 'YYYY-MM-DD') as date;
      `;
      const res = await pool.query(insertQuery, [
        category || 'all',
        userId,
        displayName,
        avatar || '',
        (content || '').trim(),
        imageUrl || null,
      ]);

      io.to(category).emit('receive_message', res.rows[0]);
    } catch (err) {
      console.error('Lỗi lưu tin nhắn:', err.message);
    }
  });
});

// ==================== 9. GEMINI AI HUB & CACHE ====================

app.post('/api/generate-ai', async (req, res) => {
  const { prompt, isJson } = req.body;
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, error: 'Chưa cấu hình GEMINI_API_KEY trong file .env!' });
    }

    const config = {
      temperature: 0.2,
      maxOutputTokens: 8192,
    };
    if (isJson) config.responseMimeType = 'application/json';

    const text = await generateContentWithFallback(prompt, config);
    res.json({ success: true, text });
  } catch (error) {
    console.error('❌ Lỗi Gemini API:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ai-cache', async (req, res) => {
  const { hash, feature, limit } = req.query;
  try {
    const { rows } = await pool.query(
      'SELECT payload FROM ai_cached_outputs WHERE content_hash = $1 AND feature_type = $2 LIMIT 1',
      [hash, feature]
    );

    if (rows.length > 0 && rows[0].payload) {
      let data = rows[0].payload;

      if (Array.isArray(data) && data.length > 0) {
        const totalCount = data.length;
        data = [...data].sort(() => 0.5 - Math.random());
        if (limit) data = data.slice(0, Number(limit));
        return res.json({ success: true, data, total_stored: totalCount });
      }

      return res.json({ success: true, data, total_stored: 1 });
    }

    return res.json({ success: false, data: null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/ai-cache', async (req, res) => {
  const { hash, feature, payload, title } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id, payload FROM ai_cached_outputs WHERE content_hash = $1 AND feature_type = $2 LIMIT 1',
      [hash, feature]
    );

    if (existing.rows.length > 0) {
      let combined = existing.rows[0].payload;
      if (Array.isArray(combined) && Array.isArray(payload)) {
        const existingKeys = new Set(combined.map((item) => item.question || item.front));
        const newUnique = payload.filter((item) => !existingKeys.has(item.question || item.front));
        combined = [...combined, ...newUnique];
      } else {
        combined = payload;
      }
      await pool.query(
        'UPDATE ai_cached_outputs SET payload = $1, created_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(combined), existing.rows[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO ai_cached_outputs (content_hash, doc_title, feature_type, payload) VALUES ($1, $2, $3, $4)',
        [hash, title, feature, JSON.stringify(payload)]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 10. SINH BÀI TẬP HÀNG NGÀY THEO MÔN ====================

app.post('/api/daily-quiz/generate', async (req, res) => {
  const { subject, targetGoal = 'KhaGioi', dailyPace = 15 } = req.body;

  try {
    const numQuestions = dailyPace >= 30 ? 5 : 3;
    const difficulty = targetGoal === 'HocBong' ? 'Nâng cao' : 'Căn bản';

    const dbQuiz = await pool.query(
      `SELECT question, options, answer, explain
       FROM question_bank 
       WHERE subject ILIKE $1 
       ORDER BY RANDOM() LIMIT $2`,
      [`%${subject}%`, numQuestions]
    );

    if (dbQuiz.rows.length >= numQuestions) {
      return res.json({
        success: true,
        source: 'database',
        questions: dbQuiz.rows,
        flashcards: [],
      });
    }

    const prompt = `Bạn là giảng viên đại học. Hãy tạo đúng ${numQuestions} câu hỏi trắc nghiệm và 3 thẻ ghi nhớ (flashcards) cho môn học "${subject}" ở mức độ [${difficulty}].
YÊU CẦU BẮT BUỘC: Trả về duy nhất một chuỗi JSON hợp lệ không dùng markdown code block:
{
  "questions": [
    {
      "question": "Câu hỏi?",
      "options": ["A. Nội dung A", "B. Nội dung B", "C. Nội dung C", "D. Nội dung D"],
      "answer": "A",
      "explain": "Giải thích ngắn gọn"
    }
  ],
  "flashcards": [
    {
      "front": "Thuật ngữ cốt lõi",
      "back": "Định nghĩa / Ý nghĩa"
    }
  ]
}`;

    const textOutput = await generateContentWithFallback(prompt, {
      responseMimeType: 'application/json',
    });

    const cleanJson = textOutput.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson || '{}');

    const generatedQuestions = parsed.questions || [];
    if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
      for (const q of generatedQuestions) {
        await pool.query(
          `INSERT INTO question_bank (subject, difficulty, question, options, answer, explain, usage_count)
           VALUES ($1, $2, $3, $4, $5, $6, 1)`,
          [subject, difficulty, q.question, JSON.stringify(q.options), (q.answer || 'A').charAt(0).toUpperCase(), q.explain || '']
        ).catch(() => {});
      }
    }

    res.json({
      success: true,
      source: 'gemini-ai',
      questions: generatedQuestions,
      flashcards: parsed.flashcards || [],
    });
  } catch (err) {
    console.error('❌ Lỗi sinh bài tập hàng ngày:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 11. QUẢN LÝ NGƯỜI DÙNG ZALO MINI APP CHO ADMIN ====================

app.get('/api/admin/users', async (req, res) => {
  const { search, major } = req.query;
  try {
    let query = `
      SELECT 
        u.id, 
        u.zalo_id AS "zaloId", 
        u.name, 
        u.avatar, 
        u.role, 
        u.student_code AS "studentCode", 
        u.class_name AS "className", 
        u.total_credits AS "totalCredits", 
        u.faculty,
        COALESCE(u.is_active, true) AS "isActive",
        TO_CHAR(u.created_at, 'DD/MM/YYYY') AS "createdAt",
        COALESCE(s.current_streak, 0) AS "currentStreak",
        COALESCE(s.longest_streak, 0) AS "longestStreak"
      FROM users u
      LEFT JOIN user_streaks s ON s.user_id = u.zalo_id OR s.user_id = u.student_code OR s.user_id = u.id::text
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(u.name) LIKE $${params.length} OR LOWER(COALESCE(u.student_code, '')) LIKE $${params.length} OR LOWER(COALESCE(u.class_name, '')) LIKE $${params.length})`;
    }

    if (major && major !== 'all') {
      params.push(major);
      query += ` AND u.faculty = $${params.length}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, studentCode, className, totalCredits, faculty, isActive } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users 
       SET name = $1, student_code = $2, class_name = $3, total_credits = $4, faculty = $5, is_active = $6
       WHERE id = $7 RETURNING *`,
      [name, studentCode || null, className || null, Number(totalCredits) || 0, faculty || null, Boolean(isActive), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    res.json({ success: true, message: 'Cập nhật tài khoản sinh viên thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/admin/users/:id/toggle-status', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT is_active FROM users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const newStatus = !check.rows[0].is_active;
    await pool.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [newStatus, id]);

    res.json({ success: true, isActive: newStatus, message: newStatus ? 'Đã kích hoạt lại tài khoản' : 'Đã khóa tài khoản' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true, message: 'Đã xóa người dùng khỏi hệ thống!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// ==================== QUẢN LÝ QUẢN TRỊ VIÊN & DUYỆT YÊU CẦU (SUPER ADMIN) ====================

// 1. Lấy danh sách tất cả quản trị viên từ admin_users
app.get('/api/admin/staff', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, full_name AS "fullName", role, 
              assigned_subject AS "assignedSubject",
              COALESCE(is_active, true) AS "isActive",
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
       FROM admin_users 
       ORDER BY id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('❌ Lỗi nạp staff:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Tạo thủ công tài khoản Admin mới
app.post('/api/admin/staff', authenticateToken, async (req, res) => {
  const { username, email, fullName, role, password, assignedSubject } = req.body;
  try {
    if (!username || !email || !fullName) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ Username, Email và Họ tên!' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password?.trim() || 'Admin@123';
    const permissions = role === 'super_admin' ? ['all'] : role === 'instructor' ? ['library', 'schedules', 'broadcast'] : ['community'];

    const insertRes = await pool.query(
      `INSERT INTO admin_users (username, email, full_name, role, password, assigned_subject, is_active, custom_permissions)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       RETURNING id, username, email, full_name AS "fullName", role, is_active AS "isActive"`,
      [cleanUsername, cleanEmail, fullName.trim(), role || 'instructor', cleanPassword, assignedSubject || null, permissions]
    );

    res.json({ success: true, message: 'Tạo tài khoản quản trị thành công!', data: insertRes.rows[0] });
  } catch (err) {
    console.error('❌ Lỗi tạo staff:', err.message);
    res.status(500).json({ success: false, message: 'Tên đăng nhập hoặc Email đã tồn tại trong hệ thống!' });
  }
});

// 3. Khóa / Mở khóa tài khoản Admin
app.patch('/api/admin/staff/:id/toggle', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT id, role, is_active FROM admin_users WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại!' });
    }

    if (check.rows[0].role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Không được phép khóa tài khoản Super Admin!' });
    }

    const newStatus = !check.rows[0].is_active;
    await pool.query(`UPDATE admin_users SET is_active = $1 WHERE id = $2`, [newStatus, id]);

    res.json({ 
      success: true, 
      isActive: newStatus, 
      message: newStatus ? 'Đã kích hoạt lại tài khoản' : 'Đã tạm khóa tài khoản' 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Xóa tài khoản Admin
app.delete('/api/admin/staff/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(`SELECT role FROM admin_users WHERE id = $1`, [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    if (check.rows[0].role === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Super Admin!' });
    }

    await pool.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
    res.json({ success: true, message: 'Đã xóa tài khoản khỏi hệ thống!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Lấy danh sách yêu cầu cấp quyền từ admin_access_requests
app.get('/api/admin/access-requests', authenticateToken, async (req, res) => {
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Phê duyệt hoặc từ chối cấp quyền Google
app.post('/api/admin/approve-access', authenticateToken, async (req, res) => {
  const { requestId, email, fullName, role, action = 'approve' } = req.body;
  try {
    if (action === 'reject') {
      await pool.query(`UPDATE admin_access_requests SET status = 'rejected' WHERE id = $1`, [requestId]);
      return res.json({ success: true, message: `Đã từ chối cấp quyền cho ${email}` });
    }

    // Tự sinh username từ prefix email
    const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    const finalUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
    const permissions = role === 'instructor' ? ['library', 'schedules', 'broadcast'] : ['community'];

    // Chèn hoặc kích hoạt vào admin_users
    await pool.query(
      `INSERT INTO admin_users (username, email, full_name, role, password, is_active, custom_permissions)
       VALUES ($1, $2, $3, $4, 'Admin@123', true, $5)
       ON CONFLICT (email) DO UPDATE 
       SET role = EXCLUDED.role, is_active = true, custom_permissions = EXCLUDED.custom_permissions`,
      [finalUsername, email.toLowerCase().trim(), fullName, role || 'instructor', permissions]
    );

    // Cập nhật trạng thái yêu cầu
    await pool.query(`UPDATE admin_access_requests SET status = 'approved' WHERE id = $1`, [requestId]);

    res.json({ success: true, message: `Đã duyệt và cấp quyền ${role} thành công cho ${fullName}!` });
  } catch (err) {
    console.error('❌ Lỗi duyệt quyền:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Lấy danh sách yêu cầu khôi phục mật khẩu từ admin_password_resets
app.get('/api/admin/password-resets', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.email, r.note, 
              COALESCE(r.status, 'pending') AS status,
              TO_CHAR(r.created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt",
              u.full_name AS "fullName", u.role, u.username
       FROM admin_password_resets r
       LEFT JOIN admin_users u ON LOWER(u.email) = LOWER(r.email)
       ORDER BY r.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Duyệt và cập nhật mật khẩu mới cho admin
app.post('/api/admin/approve-reset-password', authenticateToken, async (req, res) => {
  const { requestId, email, newPassword = 'Admin@123' } = req.body;
  try {
    await pool.query(
      `UPDATE admin_users SET password = $1 WHERE LOWER(email) = LOWER($2)`,
      [newPassword.trim(), email.trim()]
    );

    await pool.query(`UPDATE admin_password_resets SET status = 'approved' WHERE id = $1`, [requestId]);

    res.json({ success: true, message: `Mật khẩu của tài khoản ${email} đã được đặt lại thành: ${newPassword}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// Khởi động HTTP và Socket Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Tuna Server đang chạy mượt mà tại http://localhost:${PORT}`);
});