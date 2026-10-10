// routes/documents.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Tự động kiểm tra và tạo cột user_id nếu database chưa có
(async () => {
  try {
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
  } catch (err) {
    console.warn("Lỗi tự động kiểm tra bảng user_documents:", err.message);
  }
})();

// Trích xuất Email / Định danh động từ Header (x-user-id) hoặc Query/Body
const extractUserEmail = (req) => {
  return String(
    req.headers['x-user-id'] || 
    req.user?.email || 
    req.query.userId || 
    req.body?.userId || 
    ''
  ).trim();
};

// 1. LẤY DANH SÁCH TÀI LIỆU CỦA ĐÚNG TÀI KHOẢN ĐĂNG NHẬP
router.get('/', async (req, res) => {
  const userEmail = extractUserEmail(req);

  // Nếu chưa đăng nhập hoặc là guest_user thì không trả về tài liệu riêng của người khác
  if (!userEmail || userEmail === 'guest_user' || userEmail === 'anonymous') {
    return res.json({ success: true, data: [] });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, size, content, download_url AS "downloadUrl", 
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as date 
       FROM user_documents 
       WHERE LOWER(user_id) = LOWER($1)
       ORDER BY created_at DESC`,
      [userEmail]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Lỗi lấy tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. LƯU TÀI LIỆU VÀO CSDL GẮN CHẶT VỚI EMAIL CỦA TÀI KHOẢN
router.post('/', async (req, res) => {
  const userEmail = extractUserEmail(req);
  const { id, name, size, content, downloadUrl } = req.body;

  try {
    if (!id || !name || !content) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bắt buộc (id, name, content)' });
    }

    if (!userEmail || userEmail === 'guest_user') {
      return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập trước khi tải tài liệu!' });
    }

    const cleanContent = String(content).replace(/\0/g, '');
    const cleanName = String(name).replace(/\0/g, '');

    await pool.query(
      `INSERT INTO user_documents (id, user_id, name, size, content, download_url) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (id) DO UPDATE SET 
          user_id = EXCLUDED.user_id,
          name = EXCLUDED.name, 
          content = EXCLUDED.content,
          size = EXCLUDED.size,
          download_url = EXCLUDED.download_url`,
      [String(id), userEmail.toLowerCase(), cleanName, String(size || ''), cleanContent, downloadUrl || '']
    );

    res.json({ success: true, message: 'Đã lưu tài liệu thành công!' });
  } catch (error) {
    console.error("Lỗi lưu tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. XÓA TÀI LIỆU (CHỈ CHÍNH CHỦ MỚI CÓ QUYỀN XÓA)
router.delete('/:id', async (req, res) => {
  const userEmail = extractUserEmail(req);
  try {
    await pool.query(
      `DELETE FROM user_documents WHERE id = $1 AND LOWER(user_id) = LOWER($2)`,
      [req.params.id, userEmail]
    );
    res.json({ success: true, message: 'Đã xóa tài liệu!' });
  } catch (error) {
    console.error("Lỗi xóa tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;