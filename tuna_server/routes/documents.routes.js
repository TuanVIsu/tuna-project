// routes/documents.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
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

router.post('/', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM user_documents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;