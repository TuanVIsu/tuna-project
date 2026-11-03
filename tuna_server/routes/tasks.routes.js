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

// Helper: Chuẩn hóa parse an toàn dữ liệu JSON
const safeParseJson = (val) => {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return val;
  }
};

// =============================================================================
// 1. LẤY DANH SÁCH LỊCH SỬ TÁC VỤ & BÀI TẬP ĐÃ LƯU
// =============================================================================
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
        COALESCE(is_daily, false) AS "isDaily",
        daily_date AS "dailyDate",
        created_at AS "createdAt",
        TO_CHAR(created_at, 'HH24:MI DD/MM') AS "time"
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

    // Chuẩn hóa parse lại resultData và config trước khi trả về Frontend
    const formatted = rows.map((r) => ({
      ...r,
      resultData: safeParseJson(r.resultData),
      config: safeParseJson(r.config),
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error('Lỗi GET /api/tasks:', err.message);
    res.json({ success: true, data: [] });
  }
});

// =============================================================================
// 2. LƯU HOẶC CẬP NHẬT TÁC VỤ AI (TỰ ĐỘNG BỒI ĐẮP VÀO BẢNG QUESTIONS DÙNG CHUNG)
// =============================================================================
router.post('/', async (req, res) => {
  const userId = await resolveUserId(req);
  const {
    id, featureId, docName, status, resultData,
    config, errorMessage, isSaved, hiddenInHistory,
    isDaily, dailyDate
  } = req.body;

  try {
    const taskId = String(id || `task_${Date.now()}`);
    const parsedResult = safeParseJson(resultData);
    const parsedConfig = safeParseJson(config);

    const query = `
      INSERT INTO ai_tasks (
        id, user_id, feature_id, doc_name, status, result_data,
        config, error_message, is_saved, hidden_in_history,
        is_daily, daily_date, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        result_data = COALESCE(EXCLUDED.result_data, ai_tasks.result_data),
        config = COALESCE(EXCLUDED.config, ai_tasks.config),
        error_message = COALESCE(EXCLUDED.error_message, ai_tasks.error_message),
        is_saved = COALESCE(EXCLUDED.is_saved, ai_tasks.is_saved),
        hidden_in_history = COALESCE(EXCLUDED.hidden_in_history, ai_tasks.hidden_in_history),
        is_daily = COALESCE(EXCLUDED.is_daily, ai_tasks.is_daily),
        daily_date = COALESCE(EXCLUDED.daily_date, ai_tasks.daily_date)
      RETURNING *
    `;

    const values = [
      taskId,
      userId,
      featureId || 'quiz',
      docName || 'Tài liệu học tập',
      status || 'done',
      parsedResult ? JSON.stringify(parsedResult) : null,
      parsedConfig ? JSON.stringify(parsedConfig) : null,
      errorMessage || '',
      Boolean(isSaved),
      Boolean(hiddenInHistory),
      Boolean(isDaily),
      dailyDate || null
    ];

    const result = await pool.query(query, values);

    // =========================================================================
    // ĐÓNG GÓP TỰ ĐỘNG VÀO NGÂN HÀNG CÂU HỎI CHUNG (BẢNG questions)
    // Khi một bài trắc nghiệm được tạo hoàn tất, tự động bồi đắp vào ngân hàng chung
    // để các sinh viên khác học cùng môn có thể rút về ngay mà không tốn token Gemini.
    // =========================================================================
    if ((featureId === 'quiz' || featureId === 'daily_quiz') && Array.isArray(parsedResult) && parsedResult.length > 0) {
      const subjectClean = (docName || '')
        .replace(/^\[Hôm nay\]\s*|^\[Trắc nghiệm\]\s*|\.pdf|\.docx|\.doc/gi, '')
        .trim();

      if (subjectClean && subjectClean.length > 2) {
        const difficulty = parsedConfig?.difficulty || 'Căn bản';

        for (const q of parsedResult) {
          if (q.question && Array.isArray(q.options) && q.answer) {
            pool.query(
              `INSERT INTO public.questions (subject, difficulty, question, options, answer, explain, is_verified, usage_count)
               VALUES ($1, $2, $3, $4, $5, $6, TRUE, 1)
               ON CONFLICT (subject, question) DO UPDATE 
               SET usage_count = questions.usage_count + 1`,
              [
                subjectClean,
                difficulty,
                q.question.trim(),
                JSON.stringify(q.options),
                String(q.answer).trim().charAt(0).toUpperCase(),
                q.explain || ''
              ]
            ).catch(() => {});
          }
        }
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Lỗi POST /api/tasks:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 3. XÓA TÁC VỤ ĐƠN LẺ KHỎI LỊCH SỬ
// =============================================================================
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM ai_tasks WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Đã xóa tác vụ thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 4. DỌN DẸP LỊCH SỬ (CHỈ XÓA BẢN NHÁP, BẢO TOÀN CÁC BÀI TẬP ĐÃ LƯU)
// =============================================================================
router.delete('/', async (req, res) => {
  const userId = await resolveUserId(req);
  try {
    // Chỉ xóa các tác vụ tạm/lịch sử xem, KHÔNG xóa bài tập sinh viên đã bấm "Lưu bài" (is_saved = true)
    if (userId) {
      await pool.query(
        `DELETE FROM ai_tasks 
         WHERE user_id = $1 
           AND (is_saved = FALSE OR is_saved IS NULL)
           AND (is_daily = FALSE OR is_daily IS NULL)`,
        [userId]
      );
    } else {
      await pool.query(
        `DELETE FROM ai_tasks 
         WHERE user_id IS NULL 
           AND (is_saved = FALSE OR is_saved IS NULL)
           AND (is_daily = FALSE OR is_daily IS NULL)`
      );
    }
    res.json({ success: true, message: 'Đã dọn dẹp lịch sử, các bài tập đã lưu vẫn được bảo vệ nguyên vẹn!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;