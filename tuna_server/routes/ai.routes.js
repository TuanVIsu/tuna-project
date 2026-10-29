// routes/ai.routes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { generateContentWithFallback } = require('../utils/gemini');

// Helper: Phân giải user_id (INTEGER) từ request, giữ nguyên fallback linh hoạt
const resolveUserId = async (req) => {
  if (req.user?.id) return req.user.id;
  const rawId = String(
    req.headers['x-user-id'] ||
    req.body?.userId ||
    req.query?.userId ||
    req.body?.email ||
    req.user?.email ||
    ''
  ).trim();

  if (!rawId || rawId === 'guest_user') return null;
  if (/^\d+$/.test(rawId)) return parseInt(rawId, 10);

  const userRes = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR student_code = $1 OR zalo_id = $1 LIMIT 1`,
    [rawId]
  ).catch(() => ({ rows: [] }));

  return userRes.rows[0]?.id || null;
};

// Helper: Tự động khởi tạo hoặc lấy cấu hình AI từ CSDL
const getOrCreateAiSettings = async () => {
  try {
    const settingsRes = await pool.query(
      `SELECT id, daily_token_limit_per_user, enable_ai_global, cache_ttl_hours, max_questions_per_gen 
       FROM system_ai_settings 
       ORDER BY id DESC LIMIT 1`
    );
    if (settingsRes.rows.length > 0) {
      return settingsRes.rows[0];
    }

    const insertRes = await pool.query(
      `INSERT INTO system_ai_settings (enable_ai_global, daily_token_limit_per_user, cache_ttl_hours, max_questions_per_gen)
       VALUES (TRUE, 15000, 24, 5)
       RETURNING id, daily_token_limit_per_user, enable_ai_global, cache_ttl_hours, max_questions_per_gen`
    );
    return insertRes.rows[0];
  } catch (err) {
    console.error("Lỗi khởi tạo cấu hình AI:", err.message);
    return {
      id: 1,
      daily_token_limit_per_user: 15000,
      enable_ai_global: true,
      cache_ttl_hours: 24,
      max_questions_per_gen: 5,
    };
  }
};

// Helper: Kiểm tra Gateway & Hạn mức token
const checkUserTokenLimit = async (userId) => {
  try {
    const settings = await getOrCreateAiSettings();

    if (!settings.enable_ai_global) {
      return { 
        allowed: false, 
        reason: 'Gateway Gemini AI đang tạm dừng bởi Quản trị viên để bảo trì hệ thống!' 
      };
    }

    if (!userId) {
      return { allowed: true, settings, usedToday: 0 };
    }

    const todayUsageRes = await pool.query(
      `SELECT COALESCE(SUM(total_tokens), 0)::BIGINT AS used_today 
       FROM ai_token_logs 
       WHERE user_id = $1 
         AND created_at >= CURRENT_DATE`,
      [userId]
    );

    const usedToday = parseInt(todayUsageRes.rows[0]?.used_today || 0, 10);
    const limit = parseInt(settings.daily_token_limit_per_user || 15000, 10);

    if (usedToday >= limit) {
      return { 
        allowed: false, 
        reason: `Bạn đã sử dụng hết định mức AI trong ngày (${usedToday.toLocaleString()} / ${limit.toLocaleString()} tokens). Vui lòng quay lại vào ngày mai!` 
      };
    }

    return { allowed: true, settings, usedToday };
  } catch (err) {
    console.error("Lỗi kiểm tra hạn mức AI:", err.message);
    return { allowed: true, settings: { cache_ttl_hours: 24, max_questions_per_gen: 5 } };
  }
};

// =============================================================================
// 1. APIS QUẢN TRỊ ADMIN (AdminDashboard & ManageAI)
// =============================================================================

router.get(['/stats', '/admin/stats', '/admin/ai/stats'], async (req, res) => {
  try {
    const settings = await getOrCreateAiSettings();

    const [statsRes, todayStatsRes, featuresRes, topUsersRes, recentTasksRes, cacheCountRes] = await Promise.all([
      pool.query(`
        SELECT 
          COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
          COALESCE(SUM(prompt_tokens), 0)::BIGINT AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0)::BIGINT AS completion_tokens,
          COALESCE(SUM(cost_usd), 0)::NUMERIC(10, 4) AS total_cost_usd,
          COUNT(*)::INT AS total_requests
        FROM ai_token_logs
      `),
      pool.query(`
        SELECT 
          COALESCE(SUM(total_tokens), 0)::BIGINT AS daily_tokens,
          COALESCE(SUM(cost_usd), 0)::NUMERIC(10, 4) AS daily_cost,
          COUNT(*)::INT AS daily_requests
        FROM ai_token_logs
        WHERE created_at >= CURRENT_DATE
      `),
      pool.query(`
        SELECT 
          feature_type,
          COUNT(*)::INT AS count,
          COALESCE(SUM(total_tokens), 0)::BIGINT AS tokens,
          COALESCE(SUM(cost_usd), 0)::NUMERIC(10, 4) AS cost
        FROM ai_token_logs
        GROUP BY feature_type
        ORDER BY tokens DESC
      `),
      pool.query(`
        SELECT 
          l.user_id,
          COALESCE(u.name, 'Sinh viên #' || l.user_id) AS user_name,
          COALESCE(u.student_code, '') AS student_code,
          COALESCE(u.class_name, 'Khoa CNTT') AS class_name,
          COUNT(*)::INT AS requests,
          COALESCE(SUM(l.total_tokens), 0)::BIGINT AS total_tokens,
          COALESCE(SUM(l.cost_usd), 0)::NUMERIC(10, 4) AS total_cost
        FROM ai_token_logs l
        LEFT JOIN users u ON l.user_id = u.id
        GROUP BY l.user_id, u.name, u.student_code, u.class_name
        ORDER BY total_tokens DESC
        LIMIT 6
      `),
      pool.query(`
        SELECT 
          id, 
          feature_id AS "featureId", 
          doc_name AS "docName", 
          status, 
          error_message AS "errorMessage",
          TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS "createdAt"
        FROM ai_tasks
        ORDER BY created_at DESC
        LIMIT 8
      `).catch(() => ({ rows: [] })),
      pool.query(`SELECT COUNT(*)::INT AS total FROM ai_tasks WHERE content_hash IS NOT NULL`).catch(() => ({ rows: [{ total: 0 }] }))
    ]);

    const todayStats = todayStatsRes.rows[0] || { daily_tokens: 0, daily_cost: 0, daily_requests: 0 };

    res.json({
      success: true,
      settings,
      stats: statsRes.rows[0],
      today: todayStats,
      features: featuresRes.rows,
      topUsers: topUsersRes.rows,
      recentTasks: recentTasksRes.rows,
      cachedTotal: cacheCountRes.rows[0]?.total || 0,
    });
  } catch (err) {
    console.error("Lỗi lấy dữ liệu thống kê AI:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(['/toggle', '/admin/toggle-ai', '/admin/ai/toggle'], async (req, res) => {
  const { enabled } = req.body;
  try {
    const isEnabled = Boolean(enabled);
    const settings = await getOrCreateAiSettings();

    await pool.query(
      `UPDATE system_ai_settings 
       SET enable_ai_global = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [isEnabled, settings.id]
    );

    res.json({
      success: true,
      enabled: isEnabled,
      message: isEnabled ? 'Đã kích hoạt Gateway Gemini AI!' : 'Đã tạm dừng Gateway Gemini AI!',
    });
  } catch (err) {
    console.error("Lỗi toggle AI:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put(['/settings', '/admin/settings', '/admin/ai/settings'], async (req, res) => {
  try {
    const { daily_token_limit_per_user, max_questions_per_gen, enable_ai_global, cache_ttl_hours } = req.body;
    const settings = await getOrCreateAiSettings();

    await pool.query(
      `UPDATE system_ai_settings
       SET daily_token_limit_per_user = $1,
           max_questions_per_gen = $2,
           enable_ai_global = $3,
           cache_ttl_hours = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        Number(daily_token_limit_per_user) || 15000,
        Number(max_questions_per_gen) || 5,
        enable_ai_global !== false,
        Number(cache_ttl_hours) || 24,
        settings.id
      ]
    );

    res.json({ success: true, message: 'Đã cập nhật chính sách hạn mức AI thành công!' });
  } catch (err) {
    console.error("Lỗi cập nhật settings AI:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(['/clear-cache', '/admin/clear-cache', '/admin/ai/clear-cache'], async (req, res) => {
  try {
    const delRes = await pool.query(`UPDATE ai_tasks SET content_hash = NULL WHERE content_hash IS NOT NULL`);
    res.json({ success: true, message: `Đã dọn dẹp ${delRes.rowCount || 0} bản ghi bộ nhớ đệm AI!` });
  } catch (err) {
    console.error("Lỗi xóa cache:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. APIS SINH NỘI DUNG VỚI CACHE TRỰC TIẾP TRÊN AI_TASKS
// =============================================================================

router.post('/generate', async (req, res) => {
  const { prompt, isJson, featureType = 'chat_assistant', docName = 'Yêu cầu trực tiếp' } = req.body;
  const userId = await resolveUserId(req);

  try {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({ success: false, error: limitCheck.reason });
    }

    const ttlHours = limitCheck.settings?.cache_ttl_hours || 24;
    const contentHash = crypto.createHash('sha256').update((prompt || '').trim()).digest('hex');

    // Kiểm tra cache từ bảng ai_tasks
    const cacheRes = await pool.query(
      `SELECT result_data AS payload 
       FROM ai_tasks 
       WHERE content_hash = $1 
         AND feature_id = $2
         AND created_at >= NOW() - INTERVAL '1 hour' * $3 
       LIMIT 1`,
      [contentHash, featureType, ttlHours]
    ).catch(() => ({ rows: [] }));

    if (cacheRes.rows.length > 0) {
      const cachedPayload = cacheRes.rows[0].payload;
      const textOutput = typeof cachedPayload === 'string' ? cachedPayload : JSON.stringify(cachedPayload);

      return res.json({ 
        success: true, 
        text: textOutput,
        cached: true 
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, error: 'Chưa cấu hình GEMINI_API_KEY!' });
    }

    const config = { temperature: 0.2, maxOutputTokens: 8192 };
    if (isJson) config.responseMimeType = 'application/json';

    const text = await generateContentWithFallback(prompt, config);

    const promptTokensEst = Math.round((prompt || '').length / 4);
    const compTokensEst = Math.round((text || '').length / 4);
    const totalTokensEst = promptTokensEst + compTokensEst;
    const costUsd = Number(((totalTokensEst / 1000000) * 0.35).toFixed(6));

    if (userId) {
      await pool.query(
        `INSERT INTO ai_token_logs (user_id, feature_type, prompt_tokens, completion_tokens, total_tokens, cost_usd)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, featureType, promptTokensEst, compTokensEst, totalTokensEst, costUsd]
      ).catch(() => {});
    }

    let payloadToSave = text;
    if (isJson) {
      try { payloadToSave = JSON.parse(text); } catch (e) { payloadToSave = text; }
    }

    await pool.query(
      `INSERT INTO ai_tasks (id, user_id, feature_id, content_hash, doc_name, status, result_data, created_at)
       VALUES ($1, $2, $3, $4, $5, 'done', $6, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET content_hash = EXCLUDED.content_hash, result_data = EXCLUDED.result_data`,
      [
        `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userId,
        featureType,
        contentHash,
        docName,
        JSON.stringify(payloadToSave)
      ]
    ).catch(() => {});

    res.json({ success: true, text, cached: false });
  } catch (error) {
    console.error('❌ Lỗi Gemini API:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /daily-quiz/generate - Sinh bài tập động theo môn học kết hợp CSDL & Gemini
router.post(['/daily-quiz/generate', '/ai/daily-quiz/generate'], async (req, res) => {
  let { subject, targetGoal = 'KhaGioi', dailyPace = 15 } = req.body;
  const userId = await resolveUserId(req);

  if (!subject || subject === 'undefined' || subject.trim() === '') {
    subject = 'Hệ cơ sở dữ liệu đa phương tiện';
  }

  try {
    const limitCheck = await checkUserTokenLimit(userId);
    const maxQuestions = limitCheck.settings?.max_questions_per_gen || 5;
    const numQuestions = Math.min(dailyPace >= 30 ? 5 : 4, maxQuestions);
    const difficulty = targetGoal === 'HocBong' ? 'Nâng cao' : 'Căn bản';

    let questions = [];
    let flashcards = [];

    // TẦNG 1: ƯU TIÊN KIỂM TRA BỘ NHỚ CACHE 24H TRONG AI_TASKS
    const cacheKey = `daily_${subject}_${difficulty}_${numQuestions}`;
    const contentHash = crypto.createHash('sha256').update(cacheKey).digest('hex');
    const ttlHours = limitCheck.settings?.cache_ttl_hours || 24;

    const cacheRes = await pool.query(
      `SELECT result_data AS payload 
       FROM ai_tasks 
       WHERE content_hash = $1 
         AND feature_id = 'daily_quiz'
         AND created_at >= NOW() - INTERVAL '1 hour' * $2 
       LIMIT 1`,
      [contentHash, ttlHours]
    ).catch(() => ({ rows: [] }));

    if (cacheRes.rows.length > 0) {
      const data = typeof cacheRes.rows[0].payload === 'string' 
        ? JSON.parse(cacheRes.rows[0].payload) 
        : cacheRes.rows[0].payload;

      return res.json({
        success: true,
        source: 'cache_24h',
        subject,
        questions: data.questions || [],
        flashcards: data.flashcards || [],
      });
    }

    // TẦNG 2: KIỂM TRA NGÂN HÀNG CÂU HỎI TẬP TRUNG (bảng questions)
    const dbQuiz = await pool.query(
      `SELECT question, options, answer, explain 
       FROM questions 
       WHERE LOWER(subject) ILIKE LOWER($1) 
       ORDER BY RANDOM() LIMIT $2`,
      [`%${subject}%`, numQuestions]
    ).catch(() => ({ rows: [] }));

    if (dbQuiz.rows && dbQuiz.rows.length >= numQuestions) {
      questions = dbQuiz.rows.map(q => ({
        question: q.question,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        answer: q.answer,
        explain: q.explain
      }));
    }

    const dbFlash = await pool.query(
      `SELECT flashcard_data->>'front' AS front, flashcard_data->>'back' AS back 
       FROM questions
       WHERE LOWER(subject) ILIKE LOWER($1) 
         AND flashcard_data IS NOT NULL
       ORDER BY RANDOM() LIMIT 4`,
      [`%${subject}%`]
    ).catch(() => ({ rows: [] }));

    if (dbFlash.rows && dbFlash.rows.length >= 2) {
      flashcards = dbFlash.rows;
    }

    if (questions.length >= numQuestions && flashcards.length >= 2) {
      return res.json({
        success: true,
        source: 'database_bank',
        subject,
        questions,
        flashcards,
      });
    }

    // TẦNG 3: GỌI GEMINI NẾU CSDL THIẾU
    if (limitCheck.allowed && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Bạn là giảng viên đại học. Hãy tạo đúng ${numQuestions} câu hỏi trắc nghiệm 4 lựa chọn (A, B, C, D) và 4 thẻ ghi nhớ (flashcards) cho môn học "${subject}" ở mức độ [${difficulty}].
YÊU CẦU: Trả về duy nhất một chuỗi JSON hợp lệ không dùng markdown code block:
{
  "questions": [
    {
      "question": "Nội dung câu hỏi?",
      "options": [{"key": "A", "text": "Lựa chọn A"}, {"key": "B", "text": "Lựa chọn B"}, {"key": "C", "text": "Lựa chọn C"}, {"key": "D", "text": "Lựa chọn D"}],
      "answer": "A",
      "explain": "Giải thích chi tiết"
    }
  ],
  "flashcards": [
    {
      "front": "Thuật ngữ chính",
      "back": "Định nghĩa hoặc giải thích chi tiết"
    }
  ]
}`;

        const textOutput = await generateContentWithFallback(prompt, { responseMimeType: 'application/json' });
        const cleanJson = textOutput.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson || '{}');

        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          questions = parsed.questions;
          flashcards = parsed.flashcards || [];

          // Nạp vào bảng questions dùng chung
          for (const q of questions) {
            pool.query(
              `INSERT INTO questions (subject, difficulty, question, options, answer, explain, is_verified, usage_count)
               VALUES ($1, $2, $3, $4, $5, $6, TRUE, 1)`,
              [subject, difficulty, q.question, JSON.stringify(q.options), (q.answer || 'A').charAt(0).toUpperCase(), q.explain || '']
            ).catch(() => {});
          }

          // Lưu cache vào ai_tasks
          pool.query(
            `INSERT INTO ai_tasks (id, user_id, feature_id, content_hash, doc_name, status, result_data, created_at)
             VALUES ($1, $2, 'daily_quiz', $3, $4, 'done', $5, CURRENT_TIMESTAMP)`,
            [
              `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              userId,
              contentHash,
              subject,
              JSON.stringify({ questions, flashcards })
            ]
          ).catch(() => {});

          if (userId) {
            const totalTokensEst = Math.round((prompt.length + textOutput.length) / 4);
            const costUsd = Number(((totalTokensEst / 1000000) * 0.35).toFixed(6));
            pool.query(
              `INSERT INTO ai_token_logs (user_id, feature_type, prompt_tokens, completion_tokens, total_tokens, cost_usd)
               VALUES ($1, 'daily_quiz', $2, $3, $4, $5)`,
              [userId, Math.round(prompt.length / 4), Math.round(textOutput.length / 4), totalTokensEst, costUsd]
            ).catch(() => {});
          }

          return res.json({
            success: true,
            source: 'gemini_ai',
            subject,
            questions,
            flashcards,
          });
        }
      } catch (aiErr) {
        console.warn("Lỗi gọi Gemini, fallback sang CSDL:", aiErr.message);
      }
    }

    // TẦNG 4: NẾU GEMINI THẤT BẠI, LẤY TỪ QUESTIONS HIỆN CÓ
    const fallbackDb = await pool.query(
      `SELECT question, options, answer, explain 
       FROM questions 
       ORDER BY RANDOM() LIMIT $1`,
      [numQuestions]
    ).catch(() => ({ rows: [] }));

    if (fallbackDb.rows.length > 0) {
      questions = fallbackDb.rows.map(q => ({
        question: q.question,
        options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
        answer: q.answer,
        explain: q.explain
      }));

      flashcards = [
        { front: `Thuật ngữ ${subject}`, back: `Nguyên lý và cấu trúc dữ liệu cơ bản của môn ${subject}.` },
        { front: `Chỉ mục trong ${subject}`, back: `Phương pháp tối ưu hóa truy vấn dữ liệu hiệu năng cao.` }
      ];

      return res.json({
        success: true,
        source: 'database_fallback',
        subject,
        questions,
        flashcards,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Không tìm thấy câu hỏi trong CSDL và không thể kết nối tới dịch vụ AI.'
    });

  } catch (err) {
    console.error("Lỗi controller daily-quiz:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
