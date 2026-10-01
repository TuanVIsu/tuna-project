// tuna_server/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

// Khởi tạo app và server trước khi dùng
const app = express();
const server = http.createServer(app);

// 1. Socket.IO với CORS mở
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
});

// Chia sẻ instance io cho toàn bộ Express router
app.set('io', io);

// 2. Cấu hình CORS chi tiết cho Express
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'bypass-tunnel-reminder', 'x-requested-with'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check route cho Render
app.get('/', (req, res) => {
  res.json({ success: true, message: '🚀 TUNA Backend is running smoothly on Render!' });
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