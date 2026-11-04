// routes/documents.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper: Phân giải user_id (INTEGER) từ header / token / query / body
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

// =============================================================================
// 1. LẤY DANH SÁCH TÀI LIỆU
// =============================================================================
router.get('/', async (req, res) => {
  const userId = await resolveUserId(req);
  if (!userId) {
    return res.json({ success: true, data: [] });
  }

  try {
    const { rows } = await pool.query(
      `SELECT 
         id, 
         name, 
         size, 
         content, 
         COALESCE(subject, '') AS subject,
         COALESCE(type, 'DOCUMENT') AS type,
         download_url AS "downloadUrl", 
         TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS date 
       FROM user_documents 
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Lỗi lấy danh sách tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 2. LƯU HOẶC CẬP NHẬT TÀI LIỆU (Hỗ trợ subject & type cho thư viện AI)
// =============================================================================
router.post('/', async (req, res) => {
  const userId = await resolveUserId(req);
  const { id, name, size, content, downloadUrl, subject, type } = req.body;

  try {
    if (!id || !name || !content) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bắt buộc (id, name, content)' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập trước khi tải tài liệu!' });
    }

    // Loại bỏ ký tự null byte để tránh crash PostgreSQL text engine
    const cleanContent = String(content).replace(/\0/g, '');
    const cleanName = String(name).replace(/\0/g, '');

    // Tự động phân giải subject nếu frontend chưa truyền
    let cleanSubject = subject ? String(subject).trim() : '';
    if (!cleanSubject) {
      cleanSubject = cleanName
        .replace(/^\[Tóm tắt\]\s*|^\[Bản dịch\]\s*/i, '')
        .replace(/\.[a-zA-Z0-9]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();
    }

    // Tự động phân giải type (PDF, DOCX, TXT, AI_SUMMARY...)
    let cleanType = type ? String(type).trim().toUpperCase() : '';
    if (!cleanType) {
      if (cleanName.startsWith('[Tóm tắt]') || cleanName.startsWith('[Bản dịch]')) {
        cleanType = 'AI_SUMMARY';
      } else {
        const ext = cleanName.split('.').pop();
        cleanType = ext ? ext.toUpperCase() : 'DOCUMENT';
      }
    }

    await pool.query(
      `INSERT INTO user_documents (
         id, user_id, name, size, content, download_url, subject, type, created_at
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP) 
       ON CONFLICT (id) DO UPDATE SET 
          user_id = EXCLUDED.user_id,
          name = EXCLUDED.name, 
          content = EXCLUDED.content,
          size = EXCLUDED.size,
          download_url = EXCLUDED.download_url,
          subject = COALESCE(EXCLUDED.subject, user_documents.subject),
          type = COALESCE(EXCLUDED.type, user_documents.type)`,
      [
        String(id), 
        userId, 
        cleanName, 
        String(size || ''), 
        cleanContent, 
        downloadUrl || '',
        cleanSubject,
        cleanType
      ]
    );

    res.json({ success: true, message: 'Đã lưu tài liệu thành công!' });
  } catch (error) {
    console.error("Lỗi lưu tài liệu:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// 3. XÓA TÀI LIỆU
// =============================================================================
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