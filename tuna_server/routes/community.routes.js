// routes/community.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateToken } = require('../middlewares/auth');

// 1. DÀNH CHO APP SINH VIÊN (ChatSection.jsx)
router.get('/messages/:category', async (req, res) => {
  try {
    const { category } = req.params;
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
        TO_CHAR(created_at, 'HH24:MI') AS time,
        TO_CHAR(created_at, 'YYYY-MM-DD') AS date
      FROM community_messages
      WHERE category = $1
      ORDER BY created_at ASC
      LIMIT 100
    `;
    const { rows } = await pool.query(query, [category || 'all']);
    res.json({ success: true, messages: rows });
  } catch (err) {
    console.error("Lỗi nạp tin nhắn phòng chat:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. LẤY CHUYÊN MỤC TỪ BẢNG faculty_majors VÀ TIN NHẮN THỰC TẾ
router.get('/categories', async (req, res) => {
  try {
    const majorsRes = await pool.query(`
      SELECT major_code, major_name 
      FROM faculty_majors 
      ORDER BY id ASC
    `).catch(() => ({ rows: [] }));

    const usedCatRes = await pool.query(`
      SELECT DISTINCT category 
      FROM community_messages 
      WHERE category IS NOT NULL AND category <> '' AND category <> 'all'
    `).catch(() => ({ rows: [] }));

    const colorPalette = [
      "bg-primary-subtle text-primary",
      "bg-info-subtle text-info-emphasis",
      "bg-success-subtle text-success",
      "bg-warning-subtle text-warning-emphasis",
      "bg-danger-subtle text-danger",
      "bg-purple-subtle text-purple"
    ];

    const categories = [
      { id: "all", label: "Tất cả chuyên mục", color: "bg-light text-dark border fw-bold" },
      { id: "cntt_general", label: "Khoa CNTT (Chung)", color: "bg-primary-subtle text-primary" }
    ];

    majorsRes.rows.forEach((m, idx) => {
      const codeKey = m.major_code.toLowerCase();
      if (!categories.some(c => c.id === codeKey)) {
        categories.push({
          id: codeKey,
          label: m.major_name,
          color: colorPalette[idx % colorPalette.length]
        });
      }
    });

    usedCatRes.rows.forEach((r, idx) => {
      if (!categories.some(c => c.id === r.category)) {
        categories.push({
          id: r.category,
          label: r.category.toUpperCase(),
          color: colorPalette[(idx + majorsRes.rows.length) % colorPalette.length]
        });
      }
    });

    res.json({ success: true, categories });
  } catch (err) {
    console.error("Lỗi lấy danh mục chuyên mục:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. KIỂM TRA TRẠNG THÁI KHÓA CỦA NGƯỜI DÙNG HIỆN TẠI
router.get('/user-status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      `SELECT is_locked, lock_until, lock_reason, warning_count, last_warning_reason
       FROM users 
       WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1
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

// 4. DÀNH CHO ADMIN KIỂM DUYỆT TIN NHẮN (ManageCommunity.jsx)
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

    const penaltyStatsRes = await pool.query(`
      SELECT COUNT(DISTINCT id)::INT AS total_locked
      FROM users 
      WHERE is_locked = TRUE AND (lock_until IS NULL OR lock_until > CURRENT_TIMESTAMP)
    `).catch(() => ({ rows: [{ total_locked: 0 }] }));

    const warningStatsRes = await pool.query(`
      SELECT COUNT(DISTINCT id)::INT AS total_warned
      FROM users 
      WHERE warning_count > 0 AND (is_locked = FALSE OR is_locked IS NULL)
    `).catch(() => ({ rows: [{ total_warned: 0 }] }));

    res.json({
      success: true,
      messages: rows,
      stats: {
        ...statsRes.rows[0],
        total_locked: penaltyStatsRes.rows[0]?.total_locked || 0,
        total_warned: warningStatsRes.rows[0]?.total_warned || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. XÓA TIN NHẮN
router.delete('/messages/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM community_messages WHERE id = $1`, [id]);

    const io = req.app.get('io');
    if (io) io.emit('message_deleted', Number(id));

    res.json({ success: true, message: 'Đã xóa tin nhắn vi phạm!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. XÓA HÀNG LOẠT
router.post('/messages/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách ID không hợp lệ' });
    }

    await pool.query(`DELETE FROM community_messages WHERE id = ANY($1::int[])`, [ids]);

    const io = req.app.get('io');
    if (io) ids.forEach((id) => io.emit('message_deleted', Number(id)));

    res.json({ success: true, message: `Đã xóa ${ids.length} tin nhắn vi phạm!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. GỬI CẢNH BÁO
router.post('/user/warn', authenticateToken, async (req, res) => {
  try {
    const { userId, userName = 'Sinh viên', reason } = req.body;
    if (!userId || !reason) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin người dùng hoặc lý do' });
    }

    let uCheck = await pool.query(
      `SELECT id FROM users WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
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

// 8. KHÓA TÀI KHOẢN (DUY NHẤT 1 HÀM)
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
      `SELECT id FROM users WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
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

// 9. MỞ KHÓA TÀI KHOẢN & GỠ CẢNH BÁO
router.post('/user/unlock', authenticateToken, async (req, res) => {
  try {
    const { userId, userName = 'Sinh viên', reason } = req.body;
    await pool.query(
      `UPDATE users 
       SET is_locked = FALSE,
           lock_until = NULL,
           lock_reason = NULL,
           warning_count = 0
       WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
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

    res.json({ success: true, message: `Đã mở khóa và gỡ toàn bộ cảnh báo cho ${userName}!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// routes/community.routes.js
// API Gửi tin nhắn qua HTTP POST (Bảo đảm luôn lưu vào CSDL)
router.post('/messages', async (req, res) => {
  try {
    const { category = 'all', userId, userName, avatar, content, imageUrl, isAnonymous } = req.body;
    if ((!content || !content.trim()) && !imageUrl) {
      return res.status(400).json({ success: false, message: 'Nội dung không được để trống' });
    }

    // Kiểm tra khóa
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

    let savedMsg = null;
    try {
      const insertRes = await pool.query(`
        INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url, is_ai)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE)
        RETURNING id, category, user_id, user_name, avatar, content, image_url, is_ai,
                  TO_CHAR(created_at, 'HH24:MI') as time,
                  TO_CHAR(created_at, 'YYYY-MM-DD') as date
      `, [category, userId, displayName, avatar || '', (content || '').trim(), imageUrl || null]);
      savedMsg = insertRes.rows[0];
    } catch (e) {
      const insertRes2 = await pool.query(`
        INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, category, user_id, user_name, avatar, content, image_url,
                  TO_CHAR(created_at, 'HH24:MI') as time,
                  TO_CHAR(created_at, 'YYYY-MM-DD') as date
      `, [category, userId, displayName, avatar || '', (content || '').trim(), imageUrl || null]);
      savedMsg = insertRes2.rows[0];
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
module.exports = router;