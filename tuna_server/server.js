// tuna_server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Khởi tạo kết nối PostgreSQL pool
const pool = require('./config/db');

// TỰ ĐỘNG MIGRATION CÁC CỘT QUAN TRỌNG KHI SERVER KHỞI ĐỘNG
(async () => {
  try {
    // 1. Đảm bảo bảng users có cột email
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS email VARCHAR(255);
    `);
    
    // 2. Đảm bảo bảng user_documents có cột user_id
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        size VARCHAR(50),
        content TEXT,
        download_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      ALTER TABLE user_documents 
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
    `);

    // 3. Đảm bảo bảng community_messages có các cột tính năng mới
    await pool.query(`
      ALTER TABLE community_messages 
      ADD COLUMN IF NOT EXISTS reply_to JSONB,
      ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE;
    `);

    console.log("✅ [PostgreSQL Migration] Đã đồng bộ cấu trúc bảng thành công!");
  } catch (err) {
    console.warn("⚠️ [PostgreSQL Migration Warning]:", err.message);
  }
})();

// Hàm kiểm tra nguồn gốc truy cập linh hoạt
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (origin.endsWith('.zdn.vn') || origin.endsWith('.zalo.me') || origin.endsWith('.onrender.com')) return true;
  if (origin.startsWith('zbrowser://')) return true;
  return true;
};

// 1. Cấu hình Socket.IO với CORS Whitelist
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
});

app.set('io', io);

// 2. Cấu hình CORS cho Express
const corsOptions = {
  origin: function (origin, callback) {
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-user-id',
    'bypass-tunnel-reminder',
    'x-requested-with',
    'Accept'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trang chủ xác thực Zalo Developers
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="zalo-platform-site-verification" content="P-IV4eNt3abC-gXHi-qJRsJ-jbY8Y6m1E34s" />
  <title>TUNA Platform Backend</title>
</head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc;">
  <div style="text-align: center; padding: 24px; background: white; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <h1 style="color: #2563eb; margin-bottom: 8px;">🚀 TUNA Backend</h1>
    <p style="color: #64748b; margin: 0;">Server đang hoạt động bình thường trên Render.</p>
  </div>
</body>
</html>`);
});

// ROUTE HEALTH CHECK CHỐNG NGỦ CHO RENDER
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Route xác thực file tĩnh dự phòng cho Zalo
app.get('/zalo_verifierP-IV4eNt3abC-gXHi-qJRsJ-jbY8Y6m1E34s.html', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send('zalo-platform-site-verification: P-IV4eNt3abC-gXHi-qJRsJ-jbY8Y6m1E34s.html');
});

// Route tiếp nhận Webhook từ Zalo Mini App
app.post('/api/webhook/zalo', (req, res) => {
  const eventData = req.body;
  console.log('📬 Nhận sự kiện Webhook từ Zalo:', JSON.stringify(eventData, null, 2));
  res.status(200).json({ success: true, message: 'Webhook received' });
});

// Thư mục uploads tĩnh
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// KÍCH HOẠT SOCKET CHAT REALTIME
require('./sockets/chat.socket')(io);

// Đăng ký toàn bộ các module Routes
const aiRouter = require('./routes/ai.routes');
const schedulesRouter = require('./routes/schedules.routes');
const streakRouter = require('./routes/streak.routes');
const usersRoutes = require('./routes/users.routes');

app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/student', require('./routes/student.routes'));
app.use('/api/documents', require('./routes/documents.routes'));
app.use('/api/tasks', require('./routes/tasks.routes'));
app.use('/api/library', require('./routes/library.routes'));
app.use('/api/exams', require('./routes/exams.routes'));
app.use('/api/community', require('./routes/community.routes'));
app.use('/api/admin/community', require('./routes/community.routes'));

// Mount Users routes cho cả /api/users và /api/admin/users
app.use('/api/admin/users', usersRoutes);
app.use('/api/users', usersRoutes);

app.use('/api/admin/staff', require('./routes/staff.routes'));
app.use('/api/curriculum', require('./routes/curriculum.routes'));

// Mount module Streak & Leaderboard
app.use('/api/streak', streakRouter);
app.use('/api', streakRouter);

// Mount schedules
app.use('/api/schedules', schedulesRouter);
app.use('/api', schedulesRouter);

// Mount AI
app.use('/api/admin/ai', aiRouter);
app.use('/api/ai', aiRouter);
app.use('/api', aiRouter);

// Middleware xử lý lỗi toàn cục
app.use((err, req, res, next) => {
  console.error('🔥 Server Error Handler:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Lỗi máy chủ nội bộ',
  });
});

// Khởi động Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Tuna Server đang chạy mượt mà tại port ${PORT}`);
});