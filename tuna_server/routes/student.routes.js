// routes/student.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. LIÊN KẾT & CẬP NHẬT HỒ SƠ SINH VIÊN (Không bắt buộc mã lớp)
router.post('/link', async (req, res) => {
  const { zaloId, name, studentCode, className, totalCredits, faculty } = req.body;

  if (!studentCode || !name) {
    return res.status(400).json({ success: false, message: 'Thiếu MSSV hoặc Họ tên sinh viên.' });
  }

  const cleanStudentCode = studentCode.trim().toUpperCase();
  const cleanZaloId = String(zaloId || `ctut_${cleanStudentCode.toLowerCase()}`).trim();
  const cleanName = name.trim();
  const cleanFaculty = faculty?.trim() || 'Hệ Thống Thông Tin';

  try {
    const existingCheck = await pool.query(
      `SELECT id, zalo_id FROM users WHERE student_code = $1 LIMIT 1`,
      [cleanStudentCode]
    );

    if (existingCheck.rows.length > 0 && existingCheck.rows[0].zalo_id && existingCheck.rows[0].zalo_id !== cleanZaloId) {
      return res.status(409).json({
        success: false,
        message: `Mã số sinh viên "${cleanStudentCode}" đã được liên kết với một tài khoản khác!`
      });
    }

    const updateRes = await pool.query(
      `INSERT INTO users (zalo_id, student_code, name, class_name, total_credits, faculty, is_verified, verification_status, role)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'approved', 'student')
       ON CONFLICT (student_code) DO UPDATE 
       SET name = EXCLUDED.name,
           faculty = EXCLUDED.faculty,
           class_name = COALESCE(EXCLUDED.class_name, users.class_name),
           total_credits = COALESCE(EXCLUDED.total_credits, users.total_credits),
           zalo_id = COALESCE(users.zalo_id, EXCLUDED.zalo_id),
           is_verified = TRUE,
           verification_status = 'approved'
       RETURNING id, name, student_code, class_name, faculty, is_verified, verification_status`,
      [
        cleanZaloId,
        cleanStudentCode,
        cleanName,
        className?.trim() || null,
        Number(totalCredits) || 0,
        cleanFaculty
      ]
    );

    res.json({
      success: true,
      message: 'Cập nhật hồ sơ sinh viên thành công!',
      data: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Lỗi student/link:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. LẤY HỒ SƠ VÀ THỐNG KÊ (STREAK, XP, RANK)
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu userId' });
    }

    const cleanId = String(userId).trim();

    // 1. Lấy thông tin tài khoản
    const userRes = await pool.query(
      `SELECT id, name, student_code, class_name, faculty, role, is_verified, verification_status 
       FROM users 
       WHERE student_code = $1 OR zalo_id = $1 OR id::TEXT = $1 LIMIT 1`,
      [cleanId]
    );

    const user = userRes.rows[0] || null;

    // 2. Lấy số ngày Streak và điểm XP tích lũy
    const targetUserId = user?.student_code || cleanId;
    const streakRes = await pool.query(
      `SELECT current_streak, xp_points FROM user_streaks WHERE user_id = $1 LIMIT 1`,
      [targetUserId]
    );
    const streak = streakRes.rows[0]?.current_streak || 0;
    const xp = streakRes.rows[0]?.xp_points || 0;

    // 3. Tính xếp hạng toàn hệ thống
    const rankRes = await pool.query(
      `SELECT COUNT(*) + 1 AS rank 
       FROM user_streaks 
       WHERE xp_points > $1 OR (xp_points = $1 AND current_streak > $2)`,
      [xp, streak]
    );
    const rank = parseInt(rankRes.rows[0]?.rank || 1, 10);

    return res.json({
      success: true,
      data: {
        user,
        stats: {
          streak,
          xp,
          rank: rank > 0 ? rank : 1
        }
      }
    });
  } catch (err) {
    console.error('Lỗi lấy hồ sơ sinh viên:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. TỔNG HỢP THÔNG BÁO CHO MINI APP
router.get('/notifications', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu userId hợp lệ' });
    }

    const notifications = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    // Kiểm tra Streak ngày hôm nay
    const streakRes = await pool.query(
      `SELECT current_streak, xp_points, last_active_date 
       FROM user_streaks WHERE user_id = $1 LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const streakData = streakRes.rows[0];
    const isDoneStreak = streakData?.last_active_date &&
      new Date(streakData.last_active_date).toISOString().slice(0, 10) === todayStr;

    if (!isDoneStreak) {
      notifications.push({
        id: `noti_streak_alert_${todayStr}`,
        type: 'streak',
        title: 'Chưa giữ chuỗi Streak hôm nay! 🔥',
        desc: `Chuỗi hiện tại là ${streakData?.current_streak || 0} ngày. Hoàn thành 1 bài trắc nghiệm để nhận +20 XP!`,
        time: 'Hôm nay',
        isRead: false,
        targetTab: 'tasks',
        icon: 'bi-fire text-amber-500 bg-amber-50 border-amber-200',
      });
    } else {
      notifications.push({
        id: `noti_streak_done_${todayStr}`,
        type: 'streak',
        title: 'Đã hoàn thành mục tiêu ngày 🚀',
        desc: `Bạn đã giữ vững chuỗi ${streakData.current_streak} ngày liên tiếp (+20 XP tích lũy).`,
        time: 'Hôm nay',
        isRead: true,
        targetTab: 'streak',
        icon: 'bi-trophy-fill text-emerald-600 bg-emerald-50 border-emerald-200',
      });
    }

    // Học liệu mới
    const libraryRes = await pool.query(
      `SELECT id, title, subject_name AS subject, TO_CHAR(created_at, 'DD/MM') as formatted_date 
       FROM admin_library_resources 
       WHERE is_published = true 
       ORDER BY created_at DESC LIMIT 2`
    ).catch(() => ({ rows: [] }));

    libraryRes.rows.forEach((doc) => {
      notifications.push({
        id: `noti_lib_${doc.id}`,
        type: 'library',
        title: `Học liệu mới: ${doc.subject}`,
        desc: `Tài liệu vừa cập nhật: "${doc.title}". Bấm để xem hoặc lưu về máy.`,
        time: doc.formatted_date || 'Gần đây',
        isRead: false,
        targetTab: 'library',
        icon: 'bi-journal-bookmark-fill text-blue-600 bg-blue-50 border-blue-200',
      });
    });

    res.json({ success: true, data: notifications });
  } catch (err) {
    console.error('Lỗi lấy thông báo sinh viên:', err);
    res.status(500).json({ success: false, message: err.message, data: [] });
  }
});

module.exports = router;