// routes/community.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

// =============================================================================
// 1. DÀNH CHO APP SINH VIÊN (ChatSection.jsx)
// =============================================================================

// GET /api/community/messages/:category - Lấy lịch sử tin nhắn (kèm reply & trạng thái thu hồi)
router.get('/messages/:category', async (req, res) => {
  try {
    const { category } = req.params;

    // Đảm bảo bảng có đủ các cột cần thiết cho tính năng mới
    await pool.query(`
      ALTER TABLE community_messages 
      ADD COLUMN IF NOT EXISTS reply_to JSONB,
      ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT FALSE;
    `).catch(() => {});

    const query = `
      SELECT 
        id, 
        category, 
        user_id, 
        user_name, 
        avatar, 
        content, 
        image_url, 
        is_ai,
        reply_to AS "replyTo",
        COALESCE(is_recalled, false) AS "is_recalled",
        created_at,
        TO_CHAR(created_at, 'HH24:MI') AS time,
        TO_CHAR(created_at, 'YYYY-MM-DD') AS date
      FROM community_messages
      WHERE category = $1 OR $1 = 'all'
      ORDER BY created_at ASC
      LIMIT 120
    `;
    const { rows } = await pool.query(query, [category || 'all']);
    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error("Lỗi nạp tin nhắn phòng chat:", err);
    res.status(500).json({ success: false, error: err.message, messages: [] });
  }
});

// POST /api/community/messages - Gửi tin nhắn qua HTTP POST (Hỗ trợ Reply & Ảnh)
router.post('/messages', async (req, res) => {
  try {
    const { category = 'all', userId, userName, avatar, content, imageUrl, replyTo, isAnonymous } = req.body;
    if ((!content || !content.trim()) && !imageUrl) {
      return res.status(400).json({ success: false, message: 'Nội dung không được để trống' });
    }

    // Kiểm tra trạng thái khóa tài khoản
    const checkRes = await pool.query(
      `SELECT id, is_locked, lock_until, lock_reason 
       FROM users 
       WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))
       ORDER BY id DESC LIMIT 1`,
      [userId, userName || '']
    );

    if (checkRes.rows.length > 0 && checkRes.rows[0].is_locked) {
      const u = checkRes.rows[0];
      if (!u.lock_until || new Date(u.lock_until) > new Date()) {
        return res.status(403).json({ success: false, isLocked: true, message: u.lock_reason || 'Tài khoản đang bị khóa!' });
      }
    }

    const displayName = isAnonymous ? (userName || 'Sinh viên ẩn danh') : userName;
    const replyJson = replyTo ? JSON.stringify(replyTo) : null;

    let savedMsg = null;
    try {
      const insertRes = await pool.query(`
        INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url, reply_to, is_ai, is_recalled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, FALSE)
        RETURNING id, category, user_id, user_name, avatar, content, image_url, is_ai,
                  reply_to AS "replyTo", is_recalled, created_at,
                  TO_CHAR(created_at, 'HH24:MI') as time,
                  TO_CHAR(created_at, 'YYYY-MM-DD') as date
      `, [category, userId, displayName, avatar || '', (content || '').trim(), imageUrl || null, replyJson]);
      savedMsg = insertRes.rows[0];
    } catch (e) {
      // Fallback cho schema chưa migrate
      const insertRes2 = await pool.query(`
        INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, category, user_id, user_name, avatar, content, image_url, created_at,
                  TO_CHAR(created_at, 'HH24:MI') as time,
                  TO_CHAR(created_at, 'YYYY-MM-DD') as date
      `, [category, userId, displayName, avatar || '', (content || '').trim(), imageUrl || null]);
      savedMsg = { ...insertRes2.rows[0], replyTo };
    }

    // Phát socket realtime
    const io = req.app.get('io');
    if (io) {
      io.emit('receive_message', savedMsg);
      io.emit('admin_new_message', savedMsg);
    }

    res.json({ success: true, message: savedMsg });
  } catch (err) {
    console.error("Lỗi gửi tin nhắn HTTP:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/community/messages/recall - Thu hồi tin nhắn trong vòng 60 phút
router.post('/messages/recall', async (req, res) => {
  try {
    const { messageId, userId } = req.body;
    if (!messageId || !userId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tin nhắn hoặc người gửi!' });
    }

    const checkRes = await pool.query(
      `SELECT id, user_id, created_at, content FROM community_messages WHERE id = $1`,
      [Number(messageId)]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tin nhắn không tồn tại hoặc đã bị xóa!' });
    }

    const msg = checkRes.rows[0];

    // Chỉ chủ tin nhắn mới được thu hồi
    if (String(msg.user_id) !== String(userId)) {
      return res.status(403).json({ success: false, message: 'Bạn chỉ có thể thu hồi tin nhắn của chính mình!' });
    }

    // Kiểm tra giới hạn 60 phút
    const msgTime = new Date(msg.created_at).getTime();
    const diffMinutes = (Date.now() - msgTime) / (1000 * 60);

    if (diffMinutes > 60) {
      return res.status(400).json({
        success: false,
        message: 'Đã quá 60 phút kể từ khi gửi, không thể thu hồi tin nhắn này!'
      });
    }

    // Cập nhật nội dung thu hồi
    await pool.query(
      `UPDATE community_messages 
       SET content = 'Tin nhắn đã được thu hồi', image_url = NULL, is_recalled = TRUE 
       WHERE id = $1`,
      [Number(messageId)]
    ).catch(async () => {
      await pool.query(
        `UPDATE community_messages 
         SET content = 'Tin nhắn đã được thu hồi', image_url = NULL 
         WHERE id = $1`,
        [Number(messageId)]
      );
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('message_recalled', { messageId: Number(messageId) });
    }

    res.json({ success: true, message: 'Thu hồi tin nhắn thành công!' });
  } catch (err) {
    console.error("Lỗi thu hồi tin nhắn:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/community/user-status/:userId - Kiểm tra trạng thái khóa của người dùng
router.get('/user-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      `SELECT is_locked, lock_until, lock_reason, warning_count, last_warning_reason
       FROM users 
       WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1)
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, isLocked: false, warningCount: 0 });
    }

    const u = rows[0];
    const isLocked = u.is_locked && (!u.lock_until || new Date(u.lock_until) > new Date());

    res.json({
      success: true,
      isLocked,
      lockUntil: u.lock_until,
      lockReason: u.lock_reason,
      durationText: u.lock_until ? new Date(u.lock_until).toLocaleString('vi-VN') : 'Vĩnh viễn',
      warningCount: u.warning_count || 0,
      lastWarningReason: u.last_warning_reason
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/community/categories - Danh sách chuyên mục thảo luận
router.get('/categories', async (req, res) => {
  try {
    const majorsRes = await pool.query(`SELECT major_code, major_name FROM faculty_majors ORDER BY id ASC`).catch(() => ({ rows: [] }));
    const usedCatRes = await pool.query(`SELECT DISTINCT category FROM community_messages WHERE category IS NOT NULL AND category <> '' AND category <> 'all'`).catch(() => ({ rows: [] }));

    const colorPalette = [
      "bg-primary-subtle text-primary", "bg-info-subtle text-info-emphasis",
      "bg-success-subtle text-success", "bg-warning-subtle text-warning-emphasis",
      "bg-danger-subtle text-danger", "bg-purple-subtle text-purple"
    ];

    const categories = [
      { id: "all", label: "Tất cả chuyên mục", color: "bg-light text-dark border fw-bold" },
      { id: "cntt_general", label: "Khoa CNTT (Chung)", color: "bg-primary-subtle text-primary" }
    ];

    majorsRes.rows.forEach((m, idx) => {
      const codeKey = m.major_code.toLowerCase();
      if (!categories.some(c => c.id === codeKey)) {
        categories.push({ id: codeKey, label: m.major_name, color: colorPalette[idx % colorPalette.length] });
      }
    });

    usedCatRes.rows.forEach((r, idx) => {
      if (!categories.some(c => c.id === r.category)) {
        categories.push({ id: r.category, label: r.category.toUpperCase(), color: colorPalette[(idx + majorsRes.rows.length) % colorPalette.length] });
      }
    });

    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 2. DÀNH CHO ADMIN KIỂM DUYỆT (ManageCommunity.jsx)
// =============================================================================
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const { category, search, hasImage, isAi, penaltyStatus } = req.query;
    
    let query = `
      SELECT 
        m.id, 
        m.category, 
        m.user_id, 
        m.user_name, 
        m.avatar, 
        m.content, 
        m.image_url, 
        m.is_ai,
        m.reply_to AS "replyTo",
        COALESCE(m.is_recalled, false) AS "is_recalled",
        TO_CHAR(m.created_at, 'DD/MM/YYYY HH24:MI:SS') AS "createdAt",
        TO_CHAR(m.created_at, 'HH24:MI') AS time,
        COALESCE(u.warning_count, 0) AS warning_count,
        CASE 
          WHEN u.is_locked = TRUE AND (u.lock_until IS NULL OR u.lock_until > CURRENT_TIMESTAMP) THEN TRUE
          ELSE FALSE
        END AS is_currently_locked,
        TO_CHAR(u.lock_until, 'HH24:MI DD/MM/YYYY') AS lock_until_formatted,
        u.lock_reason
      FROM community_messages m
      LEFT JOIN users u ON (
        m.user_id = u.zalo_id 
        OR m.user_id = u.student_code 
        OR m.user_id = u.id::TEXT
        OR LOWER(u.email) = LOWER(m.user_id)
        OR LOWER(TRIM(m.user_name)) = LOWER(TRIM(u.name))
      )
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND m.category = $${params.length}`;
    }
    if (hasImage === 'true') {
      query += ` AND m.image_url IS NOT NULL AND m.image_url <> ''`;
    }
    if (isAi === 'true') {
      query += ` AND m.is_ai = TRUE`;
    } else if (isAi === 'false') {
      query += ` AND (m.is_ai IS NULL OR m.is_ai = FALSE)`;
    }
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      query += ` AND (LOWER(m.content) ILIKE $${params.length} OR LOWER(m.user_name) ILIKE $${params.length} OR LOWER(m.user_id) ILIKE $${params.length})`;
    }
    if (penaltyStatus === 'locked') {
      query += ` AND u.is_locked = TRUE AND (u.lock_until IS NULL OR u.lock_until > CURRENT_TIMESTAMP)`;
    } else if (penaltyStatus === 'warned') {
      query += ` AND COALESCE(u.warning_count, 0) > 0 AND (u.is_locked = FALSE OR u.is_locked IS NULL)`;
    }

    query += ` ORDER BY m.created_at DESC LIMIT 200`;
    const { rows } = await pool.query(query, params);

    const statsRes = await pool.query(`
      SELECT 
        COUNT(*)::INT AS total,
        COUNT(CASE WHEN image_url IS NOT NULL AND image_url <> '' THEN 1 END)::INT AS with_image,
        COUNT(CASE WHEN is_ai = TRUE THEN 1 END)::INT AS ai_replies
      FROM community_messages
    `);

    res.json({
      success: true,
      messages: rows,
      stats: statsRes.rows[0],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/messages/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM community_messages WHERE id = $1`, [id]);
    const io = req.app.get('io');
    if (io) io.emit('message_deleted', Number(id));
    res.json({ success: true, message: 'Đã xóa tin nhắn!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/messages/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách ID không hợp lệ' });
    }
    await pool.query(`DELETE FROM community_messages WHERE id = ANY($1::int[])`, [ids]);
    const io = req.app.get('io');
    if (io) ids.forEach((id) => io.emit('message_deleted', Number(id)));
    res.json({ success: true, message: `Đã xóa ${ids.length} tin nhắn!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/user/warn', authenticateToken, async (req, res) => {
  try {
    const { userId, userName = 'Sinh viên', reason } = req.body;
    if (!userId || !reason) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng hoặc lý do' });
    }

    let uCheck = await pool.query(
      `SELECT id FROM users WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
      [userId, userName]
    );

    let targetId = null;
    if (uCheck.rows.length === 0) {
      const ins = await pool.query(
        `INSERT INTO users (zalo_id, name, role, warning_count, last_warning_reason) VALUES ($1, $2, 'student', 1, $3) RETURNING id`,
        [userId, userName, reason]
      );
      targetId = ins.rows[0].id;
    } else {
      targetId = uCheck.rows[0].id;
      await pool.query(`UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warning_reason = $1 WHERE id = $2`, [reason, targetId]);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('user_warned', { userId, userName, reason });
      io.emit(`user_warning_${userId}`, { userId, userName, reason });
    }
    res.json({ success: true, message: `Đã gửi cảnh báo thành công!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/user/lock', authenticateToken, async (req, res) => {
  try {
    const { userId, userName = 'Sinh viên', duration, reason } = req.body;
    if (!userId || !duration || !reason) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ thông tin thời hạn và lý do' });
    }

    let lockUntil = null;
    let durationText = 'Vĩnh viễn';

    if (duration === '1h' || duration === 'lock_1h') {
      lockUntil = new Date(Date.now() + 60 * 60 * 1000);
      durationText = '1 Giờ';
    } else if (duration === '24h' || duration === 'lock_24h') {
      lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      durationText = '24 Giờ';
    }

    let uCheck = await pool.query(
      `SELECT id FROM users WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
      [userId, userName]
    );

    let targetId = null;
    if (uCheck.rows.length === 0) {
      const ins = await pool.query(
        `INSERT INTO users (zalo_id, name, role, is_locked, lock_until, lock_reason) VALUES ($1, $2, 'student', TRUE, $3, $4) RETURNING id`,
        [userId, userName, lockUntil, reason]
      );
      targetId = ins.rows[0].id;
    } else {
      targetId = uCheck.rows[0].id;
      await pool.query(`UPDATE users SET is_locked = TRUE, lock_until = $1, lock_reason = $2 WHERE id = $3`, [lockUntil, reason, targetId]);
    }

    await pool.query(`
      INSERT INTO admin_audit_logs (actor_id, actor_name, actor_role, action, target, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user?.username || 'admin_root',
      req.user?.full_name || 'Ban Quản Trị',
      req.user?.role || 'super_admin',
      'KHÓA TÀI KHOẢN',
      `${userName} (${userId})`,
      `Thời hạn: ${durationText} | Lý do: ${reason}`
    ]).catch(() => {});

    const io = req.app.get('io');
    if (io) {
      const lockPayload = { userId, userName, isLocked: true, lockUntil, reason, durationText };
      io.emit('user_locked', lockPayload);
      io.emit(`user_locked_${userId}`, lockPayload);
    }
    res.json({ success: true, message: `Đã khóa tài khoản (${durationText}) thành công!`, lockUntil });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/user/unlock', authenticateToken, async (req, res) => {
  try {
    const { userId, userName = 'Sinh viên', reason } = req.body;
    await pool.query(
      `UPDATE users 
       SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL, warning_count = 0
       WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
      [userId, userName]
    );

    await pool.query(`
      INSERT INTO admin_audit_logs (actor_id, actor_name, actor_role, action, target, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user?.username || 'admin_root',
      req.user?.full_name || 'Ban Quản Trị',
      req.user?.role || 'super_admin',
      'MỞ KHÓA TÀI KHOẢN',
      `${userName} (${userId})`,
      reason || 'Admin ân xá gỡ phạt'
    ]).catch(() => {});

    const io = req.app.get('io');
    if (io) {
      const unlockPayload = { userId, userName, isLocked: false };
      io.emit('user_unlocked', unlockPayload);
      io.emit(`user_unlocked_${userId}`, unlockPayload);
    }
    res.json({ success: true, message: `Đã mở khóa tài khoản thành công!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;