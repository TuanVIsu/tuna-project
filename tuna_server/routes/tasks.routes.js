// routes/tasks.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper: Phân giải user_id (INTEGER) từ thông tin request
const resolveUserId = async (req) => {
  if (req.user?.id) return req.user.id;
  const rawId = String(
    req.headers['x-user-id'] || 
    req.query.userId || 
    req.query.email || 
    req.body?.userId || 
    req.body?.email || 
    ''
  ).trim();

  if (!rawId || rawId === 'guest_user') return null;
  if (/^\d+$/.test(rawId)) return parseInt(rawId, 10);

  const uRes = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR student_code = $1 OR zalo_id = $1 LIMIT 1`,
    [rawId]
  ).catch(() => ({ rows: [] }));

  return uRes.rows[0]?.id || null;
};

// 1. LẤY DANH SÁCH LỊCH SỬ TÁC VỤ
router.get('/', async (req, res) => {
  const userId = await resolveUserId(req);
  try {
    let query = `
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
        COALESCE(hidden_in_history, false) AS "hiddenInHistory",
        created_at AS "createdAt",
        TO_CHAR(created_at, 'HH24:MI') AS "time"
      FROM ai_tasks
    `;
    const params = [];
    if (userId) {
      params.push(userId);
      query += ` WHERE user_id = $1 OR user_id IS NULL`;
    } else {
      query += ` WHERE user_id IS NULL`;
    }
    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params).catch(() => ({ rows: [] }));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Lỗi GET /api/tasks:', err.message);
    res.json({ success: true, data: [] });
  }
});

// 2. LƯU HOẶC CẬP NHẬT TÁC VỤ AI
router.post('/', async (req, res) => {
  const userId = await resolveUserId(req);
  const {
    id, featureId, docName, status, resultData,
    config, errorMessage, isSaved, hiddenInHistory
  } = req.body;

  try {
    const taskId = String(id || `task_${Date.now()}`);

    const query = `
      INSERT INTO ai_tasks (
        id, user_id, feature_id, doc_name, status, result_data,
        config, error_message, is_saved, hidden_in_history, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        result_data = COALESCE(EXCLUDED.result_data, ai_tasks.result_data),
        config = COALESCE(EXCLUDED.config, ai_tasks.config),
        error_message = COALESCE(EXCLUDED.error_message, ai_tasks.error_message),
        is_saved = COALESCE(EXCLUDED.is_saved, ai_tasks.is_saved),
        hidden_in_history = COALESCE(EXCLUDED.hidden_in_history, ai_tasks.hidden_in_history)
      RETURNING *
    `;

    const values = [
      taskId,
      userId,
      featureId || 'quiz',
      docName || 'Tài liệu học tập',
      status || 'done',
      typeof resultData === 'object' ? JSON.stringify(resultData) : resultData,
      typeof config === 'object' ? JSON.stringify(config) : config,
      errorMessage || '',
      Boolean(isSaved),
      Boolean(hiddenInHistory)
    ];

    const result = await pool.query(query, values);
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

// 4. XÓA TOÀN BỘ LỊCH SỬ
router.delete('/', async (req, res) => {
  const userId = await resolveUserId(req);
  try {
    if (userId) {
      await pool.query(`DELETE FROM ai_tasks WHERE user_id = $1`, [userId]);
    } else {
      await pool.query(`DELETE FROM ai_tasks WHERE user_id IS NULL`);
    }
    res.json({ success: true, message: 'Đã dọn dẹp toàn bộ lịch sử tác vụ!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;