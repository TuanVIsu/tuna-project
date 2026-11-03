// routes/streak.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper: Phân giải chính xác id nguyên số của user
const resolveDbUserId = async (rawId) => {
  if (!rawId || rawId === 'undefined' || rawId === 'null') return null;
  const cleanId = String(rawId).trim();
  if (/^\d+$/.test(cleanId)) return parseInt(cleanId, 10);
  try {
    const res = await pool.query(
      `SELECT id FROM users 
       WHERE student_code = $1 OR zalo_id = $1 OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [cleanId]
    );
    if (res.rows.length > 0) return res.rows[0].id;
  } catch (err) {
    console.warn("Lỗi resolveDbUserId:", err.message);
  }
  return null;
};

// 1. GET /api/streak/:userId - LẤY THÔNG TIN STREAK VÀ LỊCH SỬ HỌC 14 NGÀY
router.get('/:userId', async (req, res) => {
  try {
    const finalUserId = await resolveDbUserId(req.params.userId);

    if (!finalUserId) {
      return res.json({
        success: true,
        current_streak: 0,
        longest_streak: 0,
        xp_points: 0,
        streak_freeze: 0,
        activeDays: []
      });
    }

    // Tự động kiểm tra nếu bỏ lỡ quá 1 ngày thì reset streak về 0 trong DB
    await pool.query(
      `UPDATE users 
       SET current_streak = 0 
       WHERE id = $1 
         AND last_active_date IS NOT NULL 
         AND (CURRENT_DATE - last_active_date) > 1`,
      [finalUserId]
    ).catch(() => {});

    const [userRes, logsRes] = await Promise.all([
      pool.query(
        `SELECT id, current_streak, longest_streak, xp_points, streak_freeze_count, 
                TO_CHAR(last_active_date, 'YYYY-MM-DD') AS last_active_date
         FROM users 
         WHERE id = $1`,
        [finalUserId]
      ),
      pool.query(
        `SELECT TO_CHAR(activity_date, 'YYYY-MM-DD') AS act_date 
         FROM streak_logs 
         WHERE user_id = $1 
           AND activity_date >= CURRENT_DATE - INTERVAL '14 days'
         ORDER BY activity_date ASC`,
        [finalUserId]
      ).catch(() => ({ rows: [] }))
    ]);

    const s = userRes.rows[0] || {
      current_streak: 0,
      longest_streak: 0,
      xp_points: 0,
      streak_freeze_count: 0
    };

    const activeDays = logsRes.rows.map((r) => r.act_date);

    res.json({
      success: true,
      user_id: finalUserId,
      current_streak: Number(s.current_streak) || 0,
      longest_streak: Number(s.longest_streak) || Number(s.current_streak) || 0,
      xp_points: Number(s.xp_points) || 0,
      streak_freeze: Number(s.streak_freeze_count) || 0,
      last_completed_date: s.last_active_date,
      activeDays
    });
  } catch (err) {
    console.error("Lỗi GET /api/streak/:userId:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. POST /api/streak/check-in - ĐIỂM DANH, CỘNG XP VÀ TÍNH CHUỖI STREAK CHUẨN XÁC
router.post('/check-in', async (req, res) => {
  const { userId, xpBonus = 10 } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin userId' });
  }

  try {
    const finalUserId = await resolveDbUserId(userId);
    if (!finalUserId) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
    }

    const addedXp = Math.max(Number(xpBonus) || 10, 0);

    // Ghi nhật ký vào streak_logs
    await pool.query(
      `INSERT INTO streak_logs (user_id, activity_date, xp_earned, created_at)
       VALUES ($1, CURRENT_DATE, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, activity_date) 
       DO UPDATE SET xp_earned = streak_logs.xp_earned + EXCLUDED.xp_earned`,
      [finalUserId, addedXp]
    ).catch(() => {});

    // Tính toán chuỗi streak chính xác bằng phép trừ ngày trong SQL (chống lệch Timezone)
    const currentRes = await pool.query(
      `SELECT current_streak, longest_streak, xp_points,
              CASE 
                WHEN last_active_date IS NULL THEN -1
                ELSE (CURRENT_DATE - last_active_date)
              END AS days_diff
       FROM users 
       WHERE id = $1`,
      [finalUserId]
    );

    if (currentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
    }

    const row = currentRes.rows[0];
    const daysDiff = parseInt(row.days_diff, 10);
    let curStreak = Number(row.current_streak) || 0;
    let nextStreak = curStreak;

    if (daysDiff === 0) {
      // Đã học hôm nay rồi -> Giữ nguyên chuỗi, nếu trước đó là 0 thì lên 1
      nextStreak = Math.max(curStreak, 1);
    } else if (daysDiff === 1) {
      // Học ngày liền kề -> Tăng chuỗi thêm 1
      nextStreak = curStreak + 1;
    } else {
      // Bỏ lỡ từ 2 ngày trở lên hoặc mới bắt đầu -> Bắt đầu lại chuỗi 1 ngày
      nextStreak = 1;
    }

    const nextLongest = Math.max(Number(row.longest_streak) || 0, nextStreak);
    const nextXp = (Number(row.xp_points) || 0) + addedXp;

    await pool.query(
      `UPDATE users 
       SET current_streak = $1, 
           longest_streak = $2, 
           xp_points = $3, 
           last_active_date = CURRENT_DATE
       WHERE id = $4`,
      [nextStreak, nextLongest, nextXp, finalUserId]
    );

    res.json({
      success: true,
      message: `Điểm danh thành công! Nhận +${addedXp} XP!`,
      current_streak: nextStreak,
      longest_streak: nextLongest,
      xp_points: nextXp
    });
  } catch (err) {
    console.error("Lỗi POST /api/streak/check-in:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GET /api/leaderboard - BẢNG XẾP HẠNG TOP SINH VIÊN (LỌC CHUẨN, ĐẦY ĐỦ THÔNG TIN)
router.get(['/leaderboard', '/top/ranks'], async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id AS user_id,
        COALESCE(u.name, 'Sinh viên TUNA') AS user_name,
        COALESCE(u.student_code, '') AS student_code,
        u.avatar,
        COALESCE(u.class_name, 'Chưa xếp lớp') AS class_name,
        COALESCE(u.xp_points, 0) AS xp,
        COALESCE(u.current_streak, 0) AS streak,
        COALESCE(u.longest_streak, 0) AS longest_streak
      FROM users u
      WHERE u.role = 'student' 
        AND COALESCE(u.is_active, true) = TRUE
        AND (COALESCE(u.xp_points, 0) > 0 OR COALESCE(u.current_streak, 0) > 0)
      ORDER BY COALESCE(u.xp_points, 0) DESC, COALESCE(u.current_streak, 0) DESC, u.id ASC
      LIMIT 50
    `;
    const { rows } = await pool.query(query);

    res.json({ success: true, leaderboard: rows });
  } catch (err) {
    console.error("Lỗi GET /api/leaderboard:", err);
    res.status(500).json({ success: false, error: err.message, leaderboard: [] });
  }
});

module.exports = router;