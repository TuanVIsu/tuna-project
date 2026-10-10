// routes/documents.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Trích xuất Email động từ Header hoặc Query/Body
const extractUserEmail = (req) => {
  return String(
    req.headers['x-user-id'] || 
    req.user?.email || 
    req.query.userId || 
    req.body?.userId || 
    'guest_user'
  ).trim();
};

// 1. LẤY DANH SÁCH TÀI LIỆU CỦA NGƯỜI DÙNG
router.get('/', async (req, res) => {
  const userEmail = extractUserEmail(req);
  try {
    // Đảm bảo bảng có cột user_id
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_documents (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) DEFAULT 'guest_user',
        name VARCHAR(255) NOT NULL,
        size VARCHAR(50),
        content TEXT,
        download_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    const { rows } = await pool.query(
      `SELECT id, name, size, content, download_url AS "downloadUrl", 
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as date 
       FROM user_documents 
       WHERE user_id = $1 OR user_id = 'guest_user'
       ORDER BY created_at DESC`,
      [userEmail]
    ).catch(async () => {
      // Fallback nếu schema cũ chưa thêm cột user_id
      return await pool.query(
        `SELECT id, name, size, content, download_url AS "downloadUrl", 
                TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as date 
         FROM user_documents ORDER BY created_at DESC`
      );
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. LƯU TÀI LIỆU VÀO CSDL THEO EMAIL
router.post('/', async (req, res) => {
  const userEmail = extractUserEmail(req);
  const { id, name, size, content, downloadUrl } = req.body;

  try {
    if (!id || !name || !content) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bắt buộc (id, name, content)' });
    }

    const cleanContent = String(content).replace(/\0/g, '');
    const cleanName = String(name).replace(/\0/g, '');

    await pool.query(
      `INSERT INTO user_documents (id, user_id, name, size, content, download_url) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, 
          content = EXCLUDED.content,
          size = EXCLUDED.size,
          download_url = EXCLUDED.download_url`,
      [String(id), userEmail, cleanName, String(size || ''), cleanContent, downloadUrl || '']
    ).catch(async () => {
      // Fallback cho schema chưa có user_id
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
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. XÓA TÀI LIỆU
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;