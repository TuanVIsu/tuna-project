// routes/documents.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper: Phân giải user_id (INTEGER) từ header/token/query
const resolveUserId = async (req) => {
  if (req.user?.id) return req.user.id;
  const rawId = String(
    req.headers['x-user-id'] || 
    req.query.userId || 
    req.body?.userId || 
    ''
  ).trim();

  if (!rawId || rawId === 'guest_user' || rawId === 'anonymous') return null;
  if (/^\d+$/.test(rawId)) return parseInt(rawId, 10);

  const uRes = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR student_code = $1 OR zalo_id = $1 LIMIT 1`,
    [rawId]
  ).catch(() => ({ rows: [] }));

  return uRes.rows[0]?.id || null;
};

// 1. LẤY DANH SÁCH TÀI LIỆU
router.get('/', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.json({ success: true, data: [] });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, size, content, download_url AS "downloadUrl", 
              TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') as date 
       FROM user_documents 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Lỗi lấy tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. LƯU TÀI LIỆU VÀO CSDL (user_id INTEGER)
router.post('/', async (req, res) => {
  const userId = await resolveUserId(req);
  const { id, name, size, content, downloadUrl } = req.body;

  try {
    if (!id || !name || !content) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bắt buộc (id, name, content)' });
    }

    if (!userId) {
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
      [String(id), userId, cleanName, String(size || ''), cleanContent, downloadUrl || '']
    );

    res.json({ success: true, message: 'Đã lưu tài liệu thành công!' });
  } catch (error) {
    console.error("Lỗi lưu tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. XÓA TÀI LIỆU
router.delete('/:id', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
  }

  try {
    await pool.query(
      `DELETE FROM user_documents WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    res.json({ success: true, message: 'Đã xóa tài liệu!' });
  } catch (error) {
    console.error("Lỗi xóa tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
