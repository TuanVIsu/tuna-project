// routes/tasks.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Trích xuất Email động từ Header (x-user-id) hoặc Query/Body
const extractUserEmail = (req) => {
  return String(
    req.headers['x-user-id'] || 
    req.user?.email || 
    req.query.userId || 
    req.query.email || 
    req.body?.userId || 
    req.body?.email || 
    'guest_user'
  ).trim();
};

// 1. LẤY DANH SÁCH LỊCH SỬ TÁC VỤ CỦA TÀI KHOẢN EMAIL
router.get('/', async (req, res) => {
  const userEmail = extractUserEmail(req);
  try {
    const query = `
      SELECT 
        id, 
        user_id AS "userId",
        feature_id AS "featureId", 
        doc_name AS "docName", 
        status, 
        result_data AS "resultData",
        config,
        error_message AS "errorMessage",
        COALESCE(is_saved, false) AS "isSaved",
        COALESCE(is_doc_saved, false) AS "isDocSaved",
        COALESCE(hidden_in_history, false) AS "hiddenInHistory",
        created_at AS "createdAt",
        TO_CHAR(created_at, 'HH24:MI') AS "time"
      FROM ai_tasks
      WHERE user_id = $1 OR user_id = 'guest_user'
      ORDER BY created_at DESC
    `;
    const { rows } = await pool.query(query, [userEmail]).catch(() => ({ rows: [] }));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi GET /api/tasks:', err.message);
    res.json({ success: true, data: [] });
  }
});

// 2. LƯU HOẶC CẬP NHẬT TÁC VỤ AI
router.post('/', async (req, res) => {
  const userEmail = extractUserEmail(req);
  const {
    id, featureId, docName, status, resultData,
    config, errorMessage, isSaved, isDocSaved, hiddenInHistory
  } = req.body;

  try {
    const taskId = String(id || `task_${Date.now()}`);

    const query = `
      INSERT INTO ai_tasks (
        id, user_id, feature_id, doc_name, status, result_data,
        config, error_message, is_saved, is_doc_saved, hidden_in_history, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        result_data = COALESCE(EXCLUDED.result_data, ai_tasks.result_data),
        config = COALESCE(EXCLUDED.config, ai_tasks.config),
        error_message = COALESCE(EXCLUDED.error_message, ai_tasks.error_message),
        is_saved = COALESCE(EXCLUDED.is_saved, ai_tasks.is_saved),
        is_doc_saved = COALESCE(EXCLUDED.is_doc_saved, ai_tasks.is_doc_saved),
        hidden_in_history = COALESCE(EXCLUDED.hidden_in_history, ai_tasks.hidden_in_history)
      RETURNING *
    `;

    const values = [
      taskId,
      userEmail,
      featureId || 'quiz',
      docName || 'Tài liệu học tập',
      status || 'done',
      typeof resultData === 'object' ? JSON.stringify(resultData) : resultData,
      typeof config === 'object' ? JSON.stringify(config) : config,
      errorMessage || '',
      Boolean(isSaved),
      Boolean(isDocSaved),
      Boolean(hiddenInHistory)
    ];

    const result = await pool.query(query, values).catch(async () => {
      // Fallback nếu schema cũ chưa có cột user_id
      return await pool.query(
        `INSERT INTO ai_tasks (id, feature_id, doc_name, status, result_data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, result_data = EXCLUDED.result_data
         RETURNING *`,
        [taskId, featureId, docName, status, typeof resultData === 'object' ? JSON.stringify(resultData) : resultData]
      );
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /api/tasks:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. XÓA TÁC VỤ KHỎI LỊCH SỬ
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM ai_tasks WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa tác vụ thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. XÓA TOÀN BỘ LỊCH SỬ CỦA TÀI KHOẢN
router.delete('/', async (req, res) => {
  const userEmail = extractUserEmail(req);
  try {
    await pool.query(`DELETE FROM ai_tasks WHERE user_id = $1`, [userEmail]).catch(async () => {
      await pool.query(`DELETE FROM ai_tasks`);
    });
    res.json({ success: true, message: 'Đã dọn dẹp toàn bộ lịch sử tác vụ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;