// routes/streak.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. API BẢNG XẾP HẠNG THỰC TẾ TỪ CSDL
const getLeaderboardHandler = async (req, res) => {
  try {
    const query = `
      SELECT 
        s.user_id,
        COALESCE(u.name, 'Sinh viên ' || SUBSTRING(s.user_id FROM 1 FOR 6)) AS user_name,
        COALESCE(s.current_streak, 0) AS streak,
        COALESCE(s.xp_points, 0) AS xp
      FROM user_streaks s
      LEFT JOIN users u ON (
        s.user_id = u.student_code 
        OR s.user_id = u.zalo_id 
        OR s.user_id = u.id::TEXT
      )
      ORDER BY s.xp_points DESC, s.current_streak DESC
      LIMIT 25;
    `;
    const { rows } = await pool.query(query);
    return res.json({ success: true, leaderboard: rows });
  } catch (err) {
    console.error("Lỗi truy vấn Leaderboard từ DB:", err.message);
    return res.status(500).json({ success: false, message: err.message, leaderboard: [] });
  }
};

router.get('/leaderboard', getLeaderboardHandler);
router.get('/streak/leaderboard', getLeaderboardHandler);

// 2. API LẤY CHI TIẾT STREAK TỪ CSDL
const getStreakDetailHandler = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu userId' });
    }

    let userRes = await pool.query(
      `SELECT current_streak, longest_streak, xp_points, streak_freeze_count, last_active_date 
       FROM user_streaks WHERE user_id = $1`,
      [userId]
    );

    // Tự khởi tạo trong DB nếu là sinh viên mới
    if (userRes.rows.length === 0) {
      await pool.query(
        `INSERT INTO user_streaks (user_id, current_streak, longest_streak, xp_points, last_active_date)
         VALUES ($1, 0, 0, 0, NULL) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      userRes = await pool.query(`SELECT * FROM user_streaks WHERE user_id = $1`, [userId]);
    }

    // Lấy 7 ngày học tập gần nhất từ bảng streak_logs
    const logsRes = await pool.query(
      `SELECT TO_CHAR(activity_date, 'YYYY-MM-DD') AS act_date 
       FROM streak_logs 
       WHERE user_id = $1 AND activity_date >= CURRENT_DATE - INTERVAL '6 days'
       ORDER BY activity_date ASC`,
      [userId]
    );

    return res.json({
      success: true,
      current_streak: userRes.rows[0]?.current_streak || 0,
      longest_streak: userRes.rows[0]?.longest_streak || 0,
      xp_points: userRes.rows[0]?.xp_points || 0,
      streak_freeze: userRes.rows[0]?.streak_freeze_count || 1,
      activeDays: logsRes.rows.map(r => r.act_date),
    });
  } catch (err) {
    console.error("Lỗi lấy chi tiết streak từ DB:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.get('/:userId', getStreakDetailHandler);
router.get('/streak/:userId', getStreakDetailHandler);

// 3. API CHECK-IN & GHI NHẬN XP
const checkInHandler = async (req, res) => {
  try {
    const { userId, xpBonus = 20 } = req.body;
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu userId' });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Ghi nhận nhật ký vào bảng streak_logs
    await pool.query(
      `INSERT INTO streak_logs (user_id, activity_date, xp_earned) 
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, activity_date) DO NOTHING`,
      [userId, today, xpBonus]
    );

    // Tính toán chuỗi liên tục
    const checkUser = await pool.query(`SELECT * FROM user_streaks WHERE user_id = $1`, [userId]);

    let newStreak = 1;
    let newLongest = 1;

    if (checkUser.rows.length > 0) {
      const u = checkUser.rows[0];
      const lastDate = u.last_active_date ? new Date(u.last_active_date).toISOString().slice(0, 10) : null;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      if (lastDate === today) {
        newStreak = u.current_streak || 1;
      } else if (lastDate === yesterdayStr) {
        newStreak = (u.current_streak || 0) + 1;
      } else {
        newStreak = 1;
      }

      newLongest = Math.max(newStreak, u.longest_streak || 0);

      await pool.query(
        `UPDATE user_streaks 
         SET current_streak = $1, longest_streak = $2, xp_points = COALESCE(xp_points, 0) + $3, last_active_date = $4, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $5`,
        [newStreak, newLongest, xpBonus, today, userId]
      );
    } else {
      await pool.query(
        `INSERT INTO user_streaks (user_id, current_streak, longest_streak, xp_points, last_active_date)
         VALUES ($1, 1, 1, $2, $3)`,
        [userId, xpBonus, today]
      );
    }

    const updated = await pool.query(`SELECT * FROM user_streaks WHERE user_id = $1`, [userId]);

    return res.json({
      success: true,
      current_streak: updated.rows[0]?.current_streak || 1,
      xp_points: updated.rows[0]?.xp_points || xpBonus,
    });
  } catch (err) {
    console.error("Lỗi ghi nhận check-in:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post('/check-in', checkInHandler);
router.post('/streak/check-in', checkInHandler);

module.exports = router;