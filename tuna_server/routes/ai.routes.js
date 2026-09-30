// routes/ai.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { generateContentWithFallback } = require('../utils/gemini');

// Helper: Kiểm tra hạn mức token trong ngày của một user
const checkUserTokenLimit = async (userId) => {
  try {
    const settingsRes = await pool.query(
      `SELECT daily_token_limit_per_user, enable_ai_global FROM system_ai_settings ORDER BY id DESC LIMIT 1`
    );
    const settings = settingsRes.rows[0] || { daily_token_limit_per_user: 15000, enable_ai_global: true };

    if (!settings.enable_ai_global) {
      return { allowed: false, reason: 'Hệ thống AI đang tạm thời khóa bởi Quản trị viên!' };
    }

    const todayUsageRes = await pool.query(
      `SELECT COALESCE(SUM(total_tokens), 0)::BIGINT AS used_today 
       FROM ai_token_logs 
       WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
      [userId]
    );

    const usedToday = parseInt(todayUsageRes.rows[0]?.used_today || 0);
    const limit = parseInt(settings.daily_token_limit_per_user || 15000);

    if (usedToday >= limit) {
      return { 
        allowed: false, 
        reason: `Bạn đã sử dụng hết định mức AI trong ngày (${usedToday.toLocaleString()} / ${limit.toLocaleString()} tokens). Vui lòng quay lại vào ngày mai!` 
      };
    }

    return { allowed: true, settings, usedToday };
  } catch (err) {
    console.error("Lỗi kiểm tra hạn mức AI:", err);
    return { allowed: true }; // Dự phòng không chặn nếu lỗi DB
  }
};

// =============================================================================
// 1. APIS QUẢN TRỊ ADMIN (ManageAI.jsx)
// =============================================================================

// GET /api/admin/ai/stats hoặc /api/ai/stats
router.get('/stats', async (req, res) => {
  try {
    const [settingsRes, statsRes, featuresRes, topUsersRes, recentTasksRes, cacheCountRes] = await Promise.all([
      // 1. Cấu hình AI
      pool.query(`SELECT * FROM system_ai_settings ORDER BY id DESC LIMIT 1`),
      // 2. Thống kê chung
      pool.query(`
        SELECT 
          COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
          COALESCE(SUM(prompt_tokens), 0)::BIGINT AS prompt_tokens,
          COALESCE(SUM(completion_tokens), 0)::BIGINT AS completion_tokens,
          COALESCE(SUM(cost_usd), 0)::NUMERIC(10, 4) AS total_cost_usd,
          COUNT(*)::INT AS total_requests
        FROM ai_token_logs
      `),
      // 3. Phân bổ tính năng
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
      // 4. Top sinh viên dùng nhiều token
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
        LEFT JOIN users u ON l.user_id = u.student_code OR l.user_id = u.zalo_id
        GROUP BY l.user_id, u.name, u.student_code, u.class_name
        ORDER BY total_tokens DESC
        LIMIT 6
      `),
      // 5. Nhật ký tác vụ từ ai_tasks
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
      `),
      // 6. Đếm bộ nhớ cache
      pool.query(`SELECT COUNT(*)::INT AS total FROM ai_cached_outputs`).catch(() => ({ rows: [{ total: 0 }] }))
    ]);

    const settings = settingsRes.rows[0] || {
      daily_token_limit_per_user: 15000,
      max_questions_per_gen: 5,
      enable_ai_global: true,
      cache_ttl_hours: 24,
    };

    res.json({
      success: true,
      settings,
      stats: statsRes.rows[0],
      features: featuresRes.rows,
      topUsers: topUsersRes.rows,
      recentTasks: recentTasksRes.rows,
      cachedTotal: cacheCountRes.rows[0]?.total || 0
    });
  } catch (err) {
    console.error("Lỗi lấy dữ liệu thống kê AI:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/ai/settings - Lưu cấu hình vào CSDL
router.put('/settings', async (req, res) => {
  try {
    const { daily_token_limit_per_user, max_questions_per_gen, enable_ai_global, cache_ttl_hours } = req.body;

    const checkExists = await pool.query(`SELECT id FROM system_ai_settings LIMIT 1`);
    if (checkExists.rows.length === 0) {
      await pool.query(
        `INSERT INTO system_ai_settings (daily_token_limit_per_user, max_questions_per_gen, enable_ai_global, cache_ttl_hours)
         VALUES ($1, $2, $3, $4)`,
        [daily_token_limit_per_user, max_questions_per_gen, enable_ai_global, cache_ttl_hours]
      );
    } else {
      await pool.query(
        `UPDATE system_ai_settings
         SET daily_token_limit_per_user = $1,
             max_questions_per_gen = $2,
             enable_ai_global = $3,
             cache_ttl_hours = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [daily_token_limit_per_user, max_questions_per_gen, enable_ai_global, cache_ttl_hours, checkExists.rows[0].id]
      );
    }

    // Ghi nhận vào audit log
    await pool.query(
      `INSERT INTO admin_audit_logs (actor_id, actor_name, actor_role, action, target, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['admin_root', 'Quản Trị Viên', 'super_admin', 'CẬP NHẬT CẤU HÌNH AI', 'system_ai_settings', `Cập nhật hạn mức ${daily_token_limit_per_user} tokens/ngày, Trạng thái: ${enable_ai_global ? 'Bật' : 'Tắt'}`]
    ).catch(() => {});

    res.json({ success: true, message: 'Đã cập nhật chính sách hạn mức AI vào CSDL thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/ai/clear-cache - Làm sạch bộ nhớ đệm
router.post('/clear-cache', async (req, res) => {
  try {
    const delRes = await pool.query(`DELETE FROM ai_cached_outputs`);
    
    // Ghi audit log
    await pool.query(
      `INSERT INTO admin_audit_logs (actor_id, actor_name, actor_role, action, target, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['admin_root', 'Quản Trị Viên', 'super_admin', 'XÓA CACHE AI', 'ai_cached_outputs', `Đã dọn sạch ${delRes.rowCount || 0} bản ghi bộ nhớ đệm.`]
    ).catch(() => {});

    res.json({ success: true, message: `Đã dọn dẹp ${delRes.rowCount || 0} bản ghi bộ nhớ đệm AI!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. APIS SINH DỮ LIỆU & TOKEN GATEWAY (Kết nối CSDL kiểm tra hạn mức)
// =============================================================================

router.post('/generate', async (req, res) => {
  const { prompt, isJson, userId = 'anonymous', featureType = 'test_api' } = req.body;
  try {
    // 1. Kiểm tra hạn mức người dùng từ CSDL
    const limitCheck = await checkUserTokenLimit(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({ success: false, error: limitCheck.reason });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, error: 'Chưa cấu hình GEMINI_API_KEY trong file .env!' });
    }

    const config = { temperature: 0.2, maxOutputTokens: 8192 };
    if (isJson) config.responseMimeType = 'application/json';

    const text = await generateContentWithFallback(prompt, config);

    // Tính toán và ghi nhận chi phí token thực tế
    const promptTokensEst = Math.round((prompt || '').length / 4);
    const compTokensEst = Math.round((text || '').length / 4);
    const totalTokensEst = promptTokensEst + compTokensEst;
    const costUsd = Number(((totalTokensEst / 1000000) * 0.35).toFixed(6));

    await pool.query(
      `INSERT INTO ai_token_logs (user_id, feature_type, prompt_tokens, completion_tokens, total_tokens, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, featureType, promptTokensEst, compTokensEst, totalTokensEst, costUsd]
    ).catch(() => {});

    // Ghi tác vụ hoàn thành vào ai_tasks
    await pool.query(
      `INSERT INTO ai_tasks (id, feature_id, doc_name, status, result_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [`task_${Date.now()}`, featureType, 'Yêu cầu trực tiếp', 'done', JSON.stringify({ total_tokens: totalTokensEst })]
    ).catch(() => {});

    res.json({ success: true, text });
  } catch (error) {
    console.error('❌ Lỗi Gemini API:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
// BỔ SUNG VÀO routes/ai.routes.js (Trước module.exports = router)

router.post(['/daily-quiz/generate', '/ai/daily-quiz/generate'], async (req, res) => {
  let { subject, targetGoal = 'KhaGioi', dailyPace = 15, userId = 'B2300001' } = req.body;

  // Xử lý fallback nếu môn học bị undefined
  if (!subject || subject === 'undefined' || subject.trim() === '') {
    subject = 'Cơ sở dữ liệu căn bản';
  }

  try {
    // 1. Kiểm tra trạng thái AI Gateway từ CSDL
    const sysSettings = await pool.query(
      `SELECT max_questions_per_gen, enable_ai_global FROM system_ai_settings ORDER BY id DESC LIMIT 1`
    ).catch(() => ({ rows: [] }));

    if (sysSettings.rows.length > 0 && !sysSettings.rows[0].enable_ai_global) {
      return res.status(403).json({ success: false, error: 'Hệ thống AI đang tạm đóng để bảo trì ngân sách!' });
    }

    const maxQuestions = sysSettings.rows[0]?.max_questions_per_gen || 5;
    const numQuestions = Math.min(dailyPace >= 30 ? 5 : 3, maxQuestions);
    const difficulty = targetGoal === 'HocBong' ? 'Nâng cao' : 'Căn bản';

    // 2. Thử truy vấn câu hỏi có sẵn từ question_bank
    const dbQuiz = await pool.query(
      `SELECT question, options, answer, explain 
       FROM question_bank 
       WHERE subject ILIKE $1 
       ORDER BY RANDOM() LIMIT $2`,
      [`%${subject}%`, numQuestions]
    ).catch(() => ({ rows: [] }));

    if (dbQuiz.rows && dbQuiz.rows.length >= numQuestions) {
      return res.json({
        success: true,
        source: 'database',
        subject,
        questions: dbQuiz.rows,
        flashcards: [
          { front: `Thuật ngữ: ${subject}`, back: `Khái niệm và ứng dụng thực tiễn của ${subject}.` }
        ],
      });
    }

    // 3. Nếu thiếu câu hỏi, gọi Gemini AI sinh đề và trả về JSON thuần
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

    // Lưu vào question_bank để tái sử dụng
    const generatedQuestions = parsed.questions || [];
    if (Array.isArray(generatedQuestions) && generatedQuestions.length > 0) {
      for (const q of generatedQuestions) {
        await pool.query(
          `INSERT INTO question_bank (subject, difficulty, question, options, answer, explain, usage_count)
           VALUES ($1, $2, $3, $4, $5, $6, 1)`,
          [subject, difficulty, q.question, JSON.stringify(q.options), (q.answer || 'A').charAt(0).toUpperCase(), q.explain || '']
        ).catch(() => {});
      }
    }

    res.json({
      success: true,
      source: 'gemini-ai',
      subject,
      questions: generatedQuestions,
      flashcards: parsed.flashcards || [],
    });
  } catch (err) {
    console.error("Lỗi daily-quiz:", err.message);
    // Dự phòng offline khi mất mạng hoặc nghẽn API để UI luôn hoạt động
    res.json({
      success: true,
      source: 'fallback-offline',
      subject,
      questions: [
        {
          question: `Nội dung cốt lõi của học phần ${subject} là gì?`,
          options: [
            "A. Nắm vững nguyên lý và phương pháp thực hành chuẩn",
            "B. Chỉ học lý thuyết trừu tượng",
            "C. Cài đặt các ứng dụng không liên quan",
            "D. Không có cấu trúc cố định"
          ],
          answer: "A",
          explain: "Học phần trang bị kiến thức nền tảng và phương pháp thực hành chuyên sâu."
        }
      ],
      flashcards: [
        { front: `Định nghĩa học phần ${subject}`, back: `Cấu trúc và nguyên lý vận hành chuẩn mực.` }
      ]
    });
  }
});
module.exports = router;