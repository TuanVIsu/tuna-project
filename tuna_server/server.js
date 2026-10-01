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

// Danh sách tên miền được phép truy cập (Render Admin, Zalo Mini App, Localhost)
const allowedOrigins = [
  'https://tuna-admin.onrender.com',
  'https://h5.zdn.vn',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

// Hàm kiểm tra nguồn gốc truy cập hợp lệ
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Cho phép native app, curl, server-to-server
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.zdn.vn') || origin.endsWith('.zalo.me')) return true;
  return false;
};

// 1. Socket.IO với CORS Whitelist
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS for Socket.IO'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
});

app.set('io', io);

// 2. Cấu hình CORS an toàn cho Express
const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'bypass-tunnel-reminder', 'x-requested-with'],
  credentials: true,
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check route cho Render
app.get('/', (req, res) => {
  res.json({ success: true, message: '🚀 TUNA Backend is running smoothly on Render!' });
});

// Route xác thực quyền sở hữu domain của Zalo Developers
app.get('/zalo_verifierP-IV4eNt3abC-gXHi-qJRsJ-jbY8Y6m1E34s.html', (req, res) => {
  res.send('zalo-platform-site-verification: P-IV4eNt3abC-gXHi-qJRsJ-jbY8Y6m1E34s.html');
});

// Tạo và phục vụ thư mục uploads tĩnh
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Khởi tạo kết nối PostgreSQL & schema
require('./config/db');

// KÍCH HOẠT SOCKET CHAT REALTIME
require('./sockets/chat.socket')(io);

// Đăng ký toàn bộ các module Routes
const aiRouter = require('./routes/ai.routes');
const schedulesRouter = require('./routes/schedules.routes');
const streakRouter = require('./routes/streak.routes');

app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/student', require('./routes/student.routes'));
app.use('/api/documents', require('./routes/documents.routes'));
app.use('/api/tasks', require('./routes/tasks.routes'));
app.use('/api/library', require('./routes/library.routes'));
app.use('/api/exams', require('./routes/exams.routes'));
app.use('/api/community', require('./routes/community.routes'));
app.use('/api/admin/community', require('./routes/community.routes'));
app.use('/api/admin/users', require('./routes/users.routes'));
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

// Khởi động HTTP & Socket Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Tuna Server đang chạy mượt mà tại port ${PORT}`);
});