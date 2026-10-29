// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/stats', async (req, res) => {
  try {
    const [
      usersCount,
      pendingStudents,
      pendingStaff,
      schedulesCount,
      docsCount,
      videosCount,
      messagesCount,
      aiLogsRes,
      aiSettingsRes,
      auditLogsRes,
      topStreaksRes,
      topResourcesRes
    ] = await Promise.all([
      // 1. Số sinh viên đã duyệt chính thức
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM users 
        WHERE role = 'student' 
          AND (verification_status = 'approved' OR is_verified = true)
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 2. Sinh viên chờ duyệt vào lớp (CHỈ LỌC role = 'student' để tránh nhầm với giảng viên)
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM users 
        WHERE role = 'student' 
          AND (verification_status = 'pending' OR is_verified = false)
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 3. Yêu cầu cấp quyền Giảng viên chờ duyệt (LỌC TRỰC TIẾP từ bảng users: role = 'teacher' pending)
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM users 
        WHERE role = 'teacher' 
          AND verification_status = 'pending'
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 4. Lịch học & thi
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM schedules 
        WHERE schedule_scope = 'academic'
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 5. Tài liệu học tập
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM admin_library_resources 
        WHERE resource_type = 'doc'
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 6. Video bài giảng
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM admin_library_resources 
        WHERE resource_type = 'video'
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 7. Tin nhắn thảo luận
      pool.query(`
        SELECT COUNT(*) AS total 
        FROM community_messages
      `).catch(() => ({ rows: [{ total: 0 }] })),

      // 8. Thống kê sử dụng AI trong ngày từ bảng ai_token_logs
      pool.query(`
        SELECT 
          COALESCE(SUM(total_tokens), 0) AS daily_tokens,
          COALESCE(SUM(cost_usd), 0) AS daily_cost,
          COUNT(*) AS total_requests
        FROM ai_token_logs 
        WHERE created_at >= CURRENT_DATE
      `).catch(() => ({ rows: [{ daily_tokens: 0, daily_cost: 0, total_requests: 0 }] })),

      // 9. Cài đặt AI hệ thống từ bảng system_ai_settings
      pool.query(`
        SELECT daily_token_limit_per_user, enable_ai_global, cache_ttl_hours 
        FROM system_ai_settings 
        LIMIT 1
      `).catch(() => ({ rows: [{ daily_token_limit_per_user: 15000, enable_ai_global: true, cache_ttl_hours: 24 }] })),

      // 10. Nhật ký audit logs từ bảng admin_audit_logs
      pool.query(`
        SELECT id, actor_name, actor_role, action, target, details, created_at 
        FROM admin_audit_logs 
        ORDER BY created_at DESC 
        LIMIT 6
      `).catch(() => ({ rows: [] })),

      // 11. Bảng vàng Streak từ bảng users đã chuẩn hóa
      pool.query(`
        SELECT 
          id AS user_id, 
          current_streak, 
          longest_streak, 
          name AS student_name, 
          COALESCE(class_name, 'Khoa CNTT') AS class_name
        FROM users
        WHERE role = 'student' AND current_streak > 0
        ORDER BY current_streak DESC, longest_streak DESC 
        LIMIT 4
      `).catch(() => ({ rows: [] })),

      // 12. Top học liệu được quan tâm nhất từ bảng admin_library_resources
      pool.query(`
        SELECT id, title, resource_type, file_type, 
               COALESCE(view_count, 0) AS view_count, 
               COALESCE(download_count, 0) AS download_count
        FROM admin_library_resources
        ORDER BY (COALESCE(view_count, 0) + COALESCE(download_count, 0)) DESC, id DESC
        LIMIT 4
      `).catch(() => ({ rows: [] }))
    ]);

    const aiSettings = aiSettingsRes.rows[0] || { daily_token_limit_per_user: 15000, enable_ai_global: true, cache_ttl_hours: 24 };
    const aiUsage = aiLogsRes.rows[0] || { daily_tokens: 0, daily_cost: 0, total_requests: 0 };

    res.json({
      success: true,
      data: {
        totalStudents: parseInt(usersCount.rows[0]?.total || 0),
        pendingStudents: parseInt(pendingStudents.rows[0]?.total || 0),
        pendingStaff: parseInt(pendingStaff.rows[0]?.total || 0),
        totalSchedules: parseInt(schedulesCount.rows[0]?.total || 0),
        totalDocs: parseInt(docsCount.rows[0]?.total || 0),
        totalVideos: parseInt(videosCount.rows[0]?.total || 0),
        totalMessages: parseInt(messagesCount.rows[0]?.total || 0),
        ai: {
          dailyTokens: parseInt(aiUsage.daily_tokens || 0),
          dailyCost: parseFloat(aiUsage.daily_cost || 0),
          totalRequests: parseInt(aiUsage.total_requests || 0),
          tokenLimit: parseInt(aiSettings.daily_token_limit_per_user || 15000),
          enabled: aiSettings.enable_ai_global !== false,
          cacheHours: aiSettings.cache_ttl_hours || 24,
          modelName: 'Gemini 1.5 Flash'
        },
        auditLogs: auditLogsRes.rows,
        topStreaks: topStreaksRes.rows,
        topResources: topResourcesRes.rows
      }
    });
  } catch (error) {
    console.error("Lỗi /admin/stats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Chuyển đổi trạng thái Gateway AI
router.post('/toggle-ai', async (req, res) => {
  try {
    const { enabled } = req.body;
    await pool.query(`UPDATE system_ai_settings SET enable_ai_global = $1, updated_at = CURRENT_TIMESTAMP`, [enabled]);
    
    // Ghi audit log
    await pool.query(`
      INSERT INTO admin_audit_logs (actor_id, actor_name, actor_role, action, target, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [null, 'Quản Trị Viên', 'super_admin', 'GATEWAY_AI_TOGGLE', 'Gemini AI', `Chuyển trạng thái sang ${enabled ? 'Hoạt động' : 'Tạm dừng'}`]).catch(() => {});

    res.json({ success: true, enabled });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;