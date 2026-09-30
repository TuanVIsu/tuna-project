// tuna_server/routes/student.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. LIÊN KẾT TÀI KHOẢN SINH VIÊN VỚI ZALO ID
router.post('/link', async (req, res) => {
  const { zaloId, name, studentCode, className, totalCredits, faculty } = req.body;

  if (!studentCode || !zaloId) {
    return res.status(400).json({ success: false, message: 'Thiếu MSSV hoặc Zalo ID.' });
  }

  const cleanStudentCode = studentCode.trim();
  const cleanZaloId = String(zaloId).trim();
  const cleanName = name?.trim() || 'Sinh viên';

  try {
    const existingCheck = await pool.query(
      `SELECT id, zalo_id FROM users WHERE student_code = $1 LIMIT 1`,
      [cleanStudentCode]
    );

    if (existingCheck.rows.length > 0 && existingCheck.rows[0].zalo_id !== cleanZaloId) {
      return res.status(409).json({
        success: false,
        message: `Mã số sinh viên "${cleanStudentCode}" đã được liên kết với một tài khoản Zalo khác!`
      });
    }

    const updateRes = await pool.query(
      `UPDATE users 
       SET name = $1, student_code = $2, class_name = $3, total_credits = $4, faculty = $5,
           is_verified = false, verification_status = 'pending'
       WHERE zalo_id = $6
       RETURNING id, name, student_code, class_name, faculty, verification_status`,
      [
        cleanName,
        cleanStudentCode,
        className?.trim() || 'HTTT2311',
        Number(totalCredits) || 0,
        faculty?.trim() || 'Hệ Thống Thông Tin',
        cleanZaloId
      ]
    );

    res.json({
      success: true,
      message: 'Hồ sơ đã được gửi! Vui lòng chờ Giảng viên / Ban cán sự lớp phê duyệt.',
      data: updateRes.rows[0]
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Mã số sinh viên đã tồn tại!' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. TỔNG HỢP TOÀN BỘ THÔNG BÁO THỰC TẾ CHO SINH VIÊN
router.get('/notifications', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu userId hợp lệ' });
    }

    const notifications = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    // [LUỒNG 1: CỘNG ĐỒNG & CHAT - PHẠT & CẢNH BÁO TỪ ADMIN]
    const userStatusRes = await pool.query(
      `SELECT is_locked, lock_until, lock_reason, warning_count 
       FROM community_users_status WHERE user_id = $1 LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    if (userStatusRes.rows.length > 0) {
      const cStatus = userStatusRes.rows[0];
      if (cStatus.is_locked) {
        notifications.push({
          id: `noti_chat_locked_${userId}`,
          type: 'chat',
          title: 'Tài khoản bị tạm khóa chat 🔒',
          desc: `Lý do: "${cStatus.lock_reason || 'Vi phạm điều khoản cộng đồng'}". Nhấp để xem chi tiết.`,
          time: 'Gần đây',
          isRead: false,
          targetTab: 'community',
          icon: 'bi-slash-circle-fill text-rose-600 bg-rose-50 border-rose-200',
        });
      } else if (cStatus.warning_count > 0) {
        notifications.push({
          id: `noti_chat_warn_${userId}_${cStatus.warning_count}`,
          type: 'chat',
          title: `Cảnh báo vi phạm thảo luận (${cStatus.warning_count})`,
          desc: 'Vui lòng giữ văn hóa ứng xử phù hợp khi giao tiếp trên các kênh học tập.',
          time: 'Gần đây',
          isRead: false,
          targetTab: 'community',
          icon: 'bi-exclamation-triangle-fill text-amber-600 bg-amber-50 border-amber-200',
        });
      }
    }

    // [LUỒNG 2: TÀI KHOẢN & PHÊ DUYỆT LỚP HỌC]
    const userRes = await pool.query(
      `SELECT name, is_verified, class_name, verification_status 
       FROM users 
       WHERE student_code = $1 OR zalo_id = $1 OR id::TEXT = $1 LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    if (userRes.rows.length > 0) {
      const u = userRes.rows[0];
      if (u.verification_status === 'rejected') {
        notifications.push({
          id: `noti_acc_rejected_${userId}`,
          type: 'account',
          title: 'Yêu cầu vào lớp bị từ chối ❌',
          desc: 'Ban cán sự đã từ chối yêu cầu tham gia lớp. Vui lòng kiểm tra lại thông tin hồ sơ.',
          time: 'Hôm nay',
          isRead: false,
          targetTab: 'profile',
          icon: 'bi-x-circle-fill text-rose-600 bg-rose-50 border-rose-200',
        });
      } else if (u.is_verified || u.verification_status === 'approved') {
        notifications.push({
          id: `noti_acc_approved_${userId}`,
          type: 'account',
          title: 'Hồ sơ lớp học đã được duyệt ✓',
          desc: `Bạn đã tham gia lớp ${u.class_name || 'chuyên ngành'}. Thời khóa biểu chính thức đã sẵn sàng.`,
          time: 'Đã duyệt',
          isRead: true,
          targetTab: 'schedule',
          icon: 'bi-patch-check-fill text-emerald-600 bg-emerald-50 border-emerald-200',
        });
      } else {
        notifications.push({
          id: `noti_acc_pending_${userId}`,
          type: 'account',
          title: 'Đang chờ duyệt vào lớp ⏳',
          desc: 'Yêu cầu của bạn đang chờ Ban cán sự phê duyệt để xem lịch học đầy đủ.',
          time: 'Đang xử lý',
          isRead: false,
          targetTab: 'home',
          icon: 'bi-hourglass-split text-amber-600 bg-amber-50 border-amber-200',
        });
      }
    }

    // [LUỒNG 3: THỜI KHÓA BIỂU & LỊCH THI HÔM NAY]
    const todaySchedulesRes = await pool.query(
      `SELECT title, time_slot, room, category, start_period, end_period 
       FROM schedules 
       WHERE (student_code = $1 OR zalo_id = $1 OR class_id IN (SELECT class_id FROM users WHERE student_code = $1 OR zalo_id = $1)) 
         AND date = $2 
       ORDER BY start_period ASC LIMIT 2`,
      [userId, todayStr]
    ).catch(() => ({ rows: [] }));

    if (todaySchedulesRes.rows.length > 0) {
      todaySchedulesRes.rows.forEach((s, idx) => {
        const isExam = s.category === 'Lịch thi' || s.category === 'exam';
        notifications.push({
          id: `noti_schedule_today_${idx}`,
          type: 'schedule',
          title: isExam ? `Nhắc nhở: Lịch thi hôm nay!` : `Tiết học hôm nay: ${s.title}`,
          desc: `${s.time_slot || 'Theo ca học'} • Phòng: ${s.room || 'C201'} (Tiết ${s.start_period || 1} - ${s.end_period || 3})`,
          time: 'Hôm nay',
          isRead: false,
          targetTab: 'schedule',
          icon: isExam
            ? 'bi-award-fill text-purple-600 bg-purple-50 border-purple-200'
            : 'bi-calendar-check-fill text-blue-600 bg-blue-50 border-blue-200',
        });
      });
    }

    // [LUỒNG 4: CHUỖI STREAK & NHIỆM VỤ HÀNG NGÀY]
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

    // [LUỒNG 5: HỌC LIỆU / ĐỀ THI MỚI NHẤT TRONG THƯ VIỆN]
    const libraryRes = await pool.query(
      `SELECT id, title, subject, TO_CHAR(created_at, 'DD/MM') as formatted_date 
       FROM library 
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
// GET /api/student/profile/:userId
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'Thiếu userId' });
    }

    // 1. Lấy thông tin user
    const userRes = await pool.query(
      `SELECT id, name, student_code, class_name, faculty, role, is_verified, verification_status 
       FROM users 
       WHERE student_code = $1 OR zalo_id = $1 OR id::TEXT = $1 LIMIT 1`,
      [userId]
    );

    const user = userRes.rows[0] || null;

    // 2. Lấy dữ liệu Streak & Điểm XP
    const streakRes = await pool.query(
      `SELECT current_streak, xp_points FROM user_streaks WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const streak = streakRes.rows[0]?.current_streak || 0;
    const xp = streakRes.rows[0]?.xp_points || 0;

    // 3. Tính toán thứ hạng (Rank) thực tế từ bảng user_streaks
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
module.exports = router;