// routes/ai.routes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { generateContentWithFallback } = require('../utils/gemini');

// Đường dẫn service Python SWRR trên Render
const WRR_SERVICE_URL = process.env.WRR_SERVICE_URL || 'https://tuna-wrr-service.onrender.com';

// Helper trích xuất User ID thực tế từ Header / Body / Query
const extractUserId = (req) => {
  return String(
    req.headers['x-user-id'] ||
    req.body?.userId ||
    req.query?.userId ||
    req.user?.email ||
    req.user?.id ||
    req.body?.email ||
    'guest_user'
  ).trim();
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

    // Nếu chưa có dòng nào, tự động tạo cấu hình mặc định ban đầu
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

// Helper: Kiểm tra Gateway bật/tắt & Hạn mức token trong ngày
const checkUserTokenLimit = async (userId) => {
  try {
    const settings = await getOrCreateAiSettings();

    if (!settings.enable_ai_global) {
      return { 
        allowed: false, 
        reason: 'Gateway Gemini AI đang tạm dừng bởi Quản trị viên để bảo trì hệ thống!' 
      };
    }

    const todayUsageRes = await pool.query(
      `SELECT COALESCE(SUM(total_tokens), 0)::BIGINT AS used_today 
       FROM ai_token_logs 
       WHERE (LOWER(user_id) = LOWER($1) OR user_id = $1) 
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

// GET: Lấy thống kê sử dụng AI cho Admin Dashboard (Hỗ trợ đa endpoint)
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
          COALESCE(u.name, 'Sinh viên ' || l.user_id) AS user_name,
          COALESCE(u.student_code, l.user_id) AS student_code,
          COALESCE(u.class_name, 'Khoa CNTT') AS class_name,
          COUNT(*)::INT AS requests,
          COALESCE(SUM(l.total_tokens), 0)::BIGINT AS total_tokens,
          COALESCE(SUM(l.cost_usd), 0)::NUMERIC(10, 4) AS total_cost
        FROM ai_token_logs l
        LEFT JOIN users u ON l.user_id = u.student_code OR l.user_id = u.zalo_id OR LOWER(l.user_id) = LOWER(u.email)
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
      pool.query(`SELECT COUNT(*)::INT AS total FROM ai_cached_outputs`).catch(() => ({ rows: [{ total: 0 }] }))
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

// POST: Bật / Tắt Gateway AI (Xử lý dứt điểm lỗi "Không thể chuyển trạng thái AI")
// routes/ai.routes.js
// Đoạn route toggle & settings:

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

// PUT: Lưu cấu hình hạn mức vào CSDL (Hỗ trợ đa endpoint)
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

    await pool.query(
      `INSERT INTO admin_audit_logs (actor_name, actor_role, action, details)
       VALUES ($1, $2, $3, $4)`,
      [
        'Quản trị viên', 
        'super_admin', 
        'CẬP NHẬT CẤU HÌNH AI', 
        `Hạn mức: ${daily_token_limit_per_user} tokens/ngày, TTL Cache: ${cache_ttl_hours}h`
      ]
    ).catch(() => {});

    res.json({ success: true, message: 'Đã cập nhật chính sách hạn mức AI thành công!' });
  } catch (err) {
    console.error("Lỗi cập nhật settings AI:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST: Làm sạch bộ nhớ đệm
router.post(['/clear-cache', '/admin/clear-cache', '/admin/ai/clear-cache'], async (req, res) => {
  try {
    const delRes = await pool.query(`DELETE FROM ai_cached_outputs`);
    
    await pool.query(
      `INSERT INTO admin_audit_logs (actor_name, actor_role, action, details)
       VALUES ($1, $2, $3, $4)`,
      ['Quản trị viên', 'super_admin', 'XÓA CACHE AI', `Đã dọn sạch ${delRes.rowCount || 0} bản ghi bộ nhớ đệm.`]
    ).catch(() => {});

    res.json({ success: true, message: `Đã dọn dẹp ${delRes.rowCount || 0} bản ghi bộ nhớ đệm AI!` });
  } catch (err) {
    console.error("Lỗi xóa cache:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. APIS SINH NỘI DUNG VỚI CACHE 24H & GHI NHẬN TOKEN
// =============================================================================

// POST /api/ai/generate - Sinh nội dung trực tiếp qua Gemini (Có Cache & ghi Task)
router.post('/generate', async (req, res) => {
  const { prompt, isJson, featureType = 'chat_assistant', docName = 'Yêu cầu trực tiếp' } = req.body;
  const userId = extractUserId(req);

  try {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({ success: false, error: limitCheck.reason });
    }

    const ttlHours = limitCheck.settings?.cache_ttl_hours || 24;
    const promptHash = crypto.createHash('md5').update((prompt || '').trim()).digest('hex');

    // 1. KIỂM TRA BỘ ĐỆM CACHE 24H
    const cacheRes = await pool.query(
      `SELECT output_text 
       FROM ai_cached_outputs 
       WHERE prompt_hash = $1 
         AND created_at >= NOW() - INTERVAL '1 hour' * $2 
       LIMIT 1`,
      [promptHash, ttlHours]
    ).catch(() => ({ rows: [] }));

    if (cacheRes.rows.length > 0) {
      // Ghi task hoàn tất từ cache
      await pool.query(
        `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
         VALUES ($1, $2, 'done', 'Phản hồi từ Cache 24h', CURRENT_TIMESTAMP)`,
        [featureType, docName]
      ).catch(() => {});

      return res.json({ 
        success: true, 
        text: cacheRes.rows[0].output_text,
        cached: true 
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, error: 'Chưa cấu hình GEMINI_API_KEY!' });
    }

    const config = { temperature: 0.2, maxOutputTokens: 8192 };
    if (isJson) config.responseMimeType = 'application/json';

    // 2. GỌI GEMINI NẾU KHÔNG CÓ TRONG CACHE
    const text = await generateContentWithFallback(prompt, config);

    const promptTokensEst = Math.round((prompt || '').length / 4);
    const compTokensEst = Math.round((text || '').length / 4);
    const totalTokensEst = promptTokensEst + compTokensEst;
    const costUsd = Number(((totalTokensEst / 1000000) * 0.35).toFixed(6));

    // 3. LƯU BẢN GHI TOKEN VÀ CACHE VÀO CSDL
    await pool.query(
      `INSERT INTO ai_token_logs (user_id, feature_type, prompt_tokens, completion_tokens, total_tokens, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, featureType, promptTokensEst, compTokensEst, totalTokensEst, costUsd]
    ).catch(() => {});

    await pool.query(
      `INSERT INTO ai_cached_outputs (prompt_hash, prompt_text, output_text, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (prompt_hash) DO UPDATE SET output_text = EXCLUDED.output_text, created_at = CURRENT_TIMESTAMP`,
      [promptHash, prompt, text]
    ).catch(() => {});

    // 4. GHI NHẬN VÀO BẢNG AI_TASKS ĐỂ DASHBOARD HIỂN THỊ
    await pool.query(
      `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
       VALUES ($1, $2, 'done', 'Xử lý thành công', CURRENT_TIMESTAMP)`,
      [featureType, docName]
    ).catch(() => {});

    res.json({ success: true, text, cached: false });
  } catch (error) {
    console.error('❌ Lỗi Gemini API:', error.message);

    await pool.query(
      `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
       VALUES ($1, $2, 'error', $3, CURRENT_TIMESTAMP)`,
      [featureType, docName, error.message]
    ).catch(() => {});

    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/daily-quiz/generate - Tạo câu hỏi trắc nghiệm & flashcard
router.post(['/daily-quiz/generate', '/ai/daily-quiz/generate'], async (req, res) => {
  let { subject, targetGoal = 'KhaGioi', dailyPace = 15 } = req.body;
  const userId = extractUserId(req);

  if (!subject || subject === 'undefined' || subject.trim() === '') {
    subject = 'Cơ sở dữ liệu căn bản';
  }

  try {
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({ success: false, error: limitCheck.reason });
    }

    const maxQuestions = limitCheck.settings?.max_questions_per_gen || 5;
    const numQuestions = Math.min(dailyPace >= 30 ? 5 : 3, maxQuestions);
    const difficulty = targetGoal === 'HocBong' ? 'Nâng cao' : 'Căn bản';

    // 1. ƯU TIÊN LẤY TỪ NGÂN HÀNG CÂU HỎI TRONG CSDL (Zero Token Cost)
    const dbQuiz = await pool.query(
      `SELECT question, options, answer, explain 
       FROM question_bank 
       WHERE subject ILIKE $1 
       ORDER BY RANDOM() LIMIT $2`,
      [`%${subject}%`, numQuestions]
    ).catch(() => ({ rows: [] }));

    if (dbQuiz.rows && dbQuiz.rows.length >= numQuestions) {
      await pool.query(
        `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
         VALUES ('daily_quiz', $1, 'done', 'Lấy từ Ngân hàng câu hỏi (Zero Token)', CURRENT_TIMESTAMP)`,
        [subject]
      ).catch(() => {});

      return res.json({
        success: true,
        source: 'database_bank',
        subject,
        questions: dbQuiz.rows.map(q => ({
          ...q,
          options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
        })),
        flashcards: [
          { front: `Thuật ngữ: ${subject}`, back: `Định nghĩa và nguyên lý cốt lõi của ${subject}.` }
        ],
      });
    }

    // 2. KIỂM TRA BỘ ĐỆM CACHE 24H
    const cacheKey = `quiz_${subject}_${difficulty}_${numQuestions}`;
    const cacheHash = crypto.createHash('md5').update(cacheKey).digest('hex');
    const ttlHours = limitCheck.settings?.cache_ttl_hours || 24;

    const cacheRes = await pool.query(
      `SELECT output_text FROM ai_cached_outputs 
       WHERE prompt_hash = $1 AND created_at >= NOW() - INTERVAL '1 hour' * $2 LIMIT 1`,
      [cacheHash, ttlHours]
    ).catch(() => ({ rows: [] }));

    if (cacheRes.rows.length > 0) {
      const parsedCache = JSON.parse(cacheRes.rows[0].output_text || '{}');

      await pool.query(
        `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
         VALUES ('daily_quiz', $1, 'done', 'Phản hồi từ Cache 24h', CURRENT_TIMESTAMP)`,
        [subject]
      ).catch(() => {});

      return res.json({
        success: true,
        source: 'cache_24h',
        subject,
        questions: parsedCache.questions || [],
        flashcards: parsedCache.flashcards || [],
      });
    }

    // 3. GỌI GEMINI NẾU CSDL VÀ CACHE ĐỀU CHƯA CÓ
    const prompt = `Bạn là giảng viên đại học. Hãy tạo đúng ${numQuestions} câu hỏi trắc nghiệm và 2 thẻ ghi nhớ (flashcards) cho môn học "${subject}" ở mức độ [${difficulty}].
YÊU CẦU: Trả về duy nhất một chuỗi JSON hợp lệ không có markdown:
{
  "questions": [
    {
      "question": "Nội dung câu hỏi?",
      "options": ["A. Lựa chọn 1", "B. Lựa chọn 2", "C. Lựa chọn 3", "D. Lựa chọn 4"],
      "answer": "A",
      "explain": "Giải thích chi tiết"
    }
  ],
  "flashcards": [
    {
      "front": "Thuật ngữ chính",
      "back": "Ý nghĩa thuật ngữ"
    }
  ]
}`;

    const textOutput = await generateContentWithFallback(prompt, { responseMimeType: 'application/json' });
    const cleanJson = textOutput.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanJson || '{}');

    const generatedQuestions = parsed.questions || [];
    const generatedFlashcards = parsed.flashcards || [];

    // Lưu vào ngân hàng câu hỏi để tái sử dụng
    for (const q of generatedQuestions) {
      await pool.query(
        `INSERT INTO question_bank (subject, difficulty, question, options, answer, explain, usage_count)
         VALUES ($1, $2, $3, $4, $5, $6, 1)`,
        [subject, difficulty, q.question, JSON.stringify(q.options), (q.answer || 'A').charAt(0).toUpperCase(), q.explain || '']
      ).catch(() => {});
    }

    // Ghi cache 24h
    await pool.query(
      `INSERT INTO ai_cached_outputs (prompt_hash, prompt_text, output_text, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (prompt_hash) DO UPDATE SET output_text = EXCLUDED.output_text, created_at = CURRENT_TIMESTAMP`,
      [cacheHash, cacheKey, JSON.stringify({ questions: generatedQuestions, flashcards: generatedFlashcards })]
    ).catch(() => {});

    // Ghi token logs
    const totalTokensEst = Math.round((prompt.length + textOutput.length) / 4);
    const costUsd = Number(((totalTokensEst / 1000000) * 0.35).toFixed(6));
    await pool.query(
      `INSERT INTO ai_token_logs (user_id, feature_type, prompt_tokens, completion_tokens, total_tokens, cost_usd)
       VALUES ($1, 'daily_quiz', $2, $3, $4, $5)`,
      [userId, Math.round(prompt.length / 4), Math.round(textOutput.length / 4), totalTokensEst, costUsd]
    ).catch(() => {});

    // Ghi task thành công
    await pool.query(
      `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
       VALUES ('daily_quiz', $1, 'done', 'Sinh mới thành công từ Gemini AI', CURRENT_TIMESTAMP)`,
      [subject]
    ).catch(() => {});

    res.json({
      success: true,
      source: 'gemini_ai',
      subject,
      questions: generatedQuestions,
      flashcards: generatedFlashcards,
    });
  } catch (err) {
    console.error("Lỗi daily-quiz:", err.message);

    await pool.query(
      `INSERT INTO ai_tasks (feature_id, doc_name, status, error_message, created_at)
       VALUES ('daily_quiz', $1, 'error', $2, CURRENT_TIMESTAMP)`,
      [subject, err.message]
    ).catch(() => {});

    res.status(500).json({
      success: false,
      error: `Không thể tạo bài tập: ${err.message}`
    });
  }
});

module.exports = router;