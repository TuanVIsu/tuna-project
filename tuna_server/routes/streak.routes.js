// routes/streak.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Helper: Phân giải định danh người dùng chính xác trong CSDL
const resolveDbUserId = async (rawId) => {
  if (!rawId || rawId === 'undefined') return null;
  try {
    const cleanId = String(rawId).trim();
    const res = await pool.query(
      `SELECT student_code, zalo_id, id::TEXT as id_str 
       FROM users 
       WHERE student_code = $1 OR zalo_id = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1)
       LIMIT 1`,
      [cleanId]
    );

    if (res.rows.length > 0) {
      return res.rows[0].student_code || res.rows[0].zalo_id || res.rows[0].id_str;
    }
  } catch (err) {
    console.warn("Lỗi resolveDbUserId:", err.message);
  }
  return String(rawId).trim();
};

// =============================================================================
// 1. GET /api/streak/:userId - LẤY DỮ LIỆU STREAK VÀ NHẬT KÝ HOẠT ĐỘNG
// =============================================================================
router.get('/:userId', async (req, res) => {
  try {
    const rawUserId = req.params.userId;
    const finalUserId = await resolveDbUserId(rawUserId);

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

    const streakRes = await pool.query(
      `SELECT current_streak, longest_streak, xp_points, streak_freeze_count, last_completed_date
       FROM user_streaks 
       WHERE user_id = $1`,
      [finalUserId]
    );

    const logsRes = await pool.query(
      `SELECT TO_CHAR(activity_date, 'YYYY-MM-DD') AS act_date 
       FROM streak_logs 
       WHERE user_id = $1 
         AND activity_date >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY activity_date ASC`,
      [finalUserId]
    ).catch(() => ({ rows: [] }));

    const s = streakRes.rows[0] || {
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
      last_completed_date: s.last_completed_date,
      activeDays
    });
  } catch (err) {
    console.error("Lỗi GET /api/streak/:userId:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =============================================================================
// 2. POST /api/streak/check-in - ĐIỂM DANH, CỘNG ĐIỂM XP VÀ GHI LOG
// =============================================================================
router.post('/check-in', async (req, res) => {
  const { userId, xpBonus = 10 } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin userId' });
  }

  try {
    const finalUserId = await resolveDbUserId(userId);
    const addedXp = Math.max(Number(xpBonus) || 10, 0);

    // Ghi nhật ký vào streak_logs
    await pool.query(
      `INSERT INTO streak_logs (user_id, activity_date, xp_earned, created_at)
       VALUES ($1, CURRENT_DATE, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, activity_date) 
       DO UPDATE SET xp_earned = streak_logs.xp_earned + EXCLUDED.xp_earned`,
      [finalUserId, addedXp]
    ).catch(() => {});

    // Tính toán lại chuỗi streak
    const currentRes = await pool.query(
      `SELECT current_streak, longest_streak, xp_points, last_completed_date 
       FROM user_streaks 
       WHERE user_id = $1`,
      [finalUserId]
    );

    let nextStreak = 1;
    let nextLongest = 1;
    let nextXp = addedXp;

    if (currentRes.rows.length > 0) {
      const row = currentRes.rows[0];
      const lastDate = row.last_completed_date ? new Date(row.last_completed_date) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let diffDays = -1;
      if (lastDate) {
        lastDate.setHours(0, 0, 0, 0);
        diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));
      }

      if (diffDays === 0) {
        nextStreak = Number(row.current_streak) || 1;
      } else if (diffDays === 1) {
        nextStreak = (Number(row.current_streak) || 0) + 1;
      } else {
        nextStreak = 1;
      }

      nextLongest = Math.max(Number(row.longest_streak) || 0, nextStreak);
      nextXp = (Number(row.xp_points) || 0) + addedXp;

      await pool.query(
        `UPDATE user_streaks 
         SET current_streak = $1, 
             longest_streak = $2, 
             xp_points = $3, 
             last_completed_date = CURRENT_DATE,
             last_active_date = CURRENT_DATE,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4`,
        [nextStreak, nextLongest, nextXp, finalUserId]
      );
    } else {
      await pool.query(
        `INSERT INTO user_streaks (user_id, current_streak, longest_streak, xp_points, last_completed_date, last_active_date, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE, CURRENT_TIMESTAMP)`,
        [nextStreak, nextLongest, nextXp, finalUserId]
      );
    }

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

// =============================================================================
// 3. GET /api/leaderboard - BẢNG XẾP HẠNG THÀNH TÍCH ĐẦY ĐỦ
// =============================================================================
router.get(['/leaderboard', '/top/ranks'], async (req, res) => {
  try {
    const query = `
      SELECT 
        s.user_id,
        COALESCE(u.name, s.user_id, 'Sinh viên TUNA') AS user_name,
        COALESCE(s.xp_points, 0) AS xp,
        COALESCE(s.current_streak, 0) AS streak,
        COALESCE(s.longest_streak, 0) AS longest_streak
      FROM user_streaks s
      LEFT JOIN users u ON (
        s.user_id = u.student_code 
        OR s.user_id = u.zalo_id 
        OR s.user_id = u.id::TEXT
        OR LOWER(u.email) = LOWER(s.user_id)
      )
      WHERE COALESCE(s.xp_points, 0) > 0 OR u.name IS NOT NULL
      ORDER BY COALESCE(s.xp_points, 0) DESC, COALESCE(s.current_streak, 0) DESC
      LIMIT 30
    `;
    let { rows } = await pool.query(query);

    // Chuẩn hóa loại bỏ trùng lặp nếu có sự phân mảnh định danh
    const uniqueMap = new Map();
    rows.forEach((r) => {
      const key = String(r.user_name || r.user_id).trim().toLowerCase();
      if (!uniqueMap.has(key) || uniqueMap.get(key).xp < r.xp) {
        uniqueMap.set(key, r);
      }
    });

    const finalLeaderboard = Array.from(uniqueMap.values())
      .sort((a, b) => b.xp - a.xp || b.streak - a.streak);

    res.json({ success: true, leaderboard: finalLeaderboard });
  } catch (err) {
    console.error("Lỗi GET /api/leaderboard:", err);
    res.status(500).json({ success: false, error: err.message, leaderboard: [] });
  }
});

module.exports = router;