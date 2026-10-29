// sockets/chat.socket.js
const pool = require('../config/db');

// Helper: Phân giải user_id (INTEGER) từ định danh
const resolveUserId = async (rawId, name = '') => {
  if (!rawId || rawId === 'guest_user') return null;
  if (/^\d+$/.test(String(rawId))) return parseInt(rawId, 10);

  const uRes = await pool.query(
    `SELECT id FROM users 
     WHERE zalo_id = $1 OR student_code = $1 OR LOWER(email) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($2))
     ORDER BY id DESC LIMIT 1`,
    [String(rawId), name]
  ).catch(() => ({ rows: [] }));

  return uRes.rows[0]?.id || null;
};

module.exports = (io) => {
  io.on('connection', (socket) => {
    // 1. Tham gia phòng
    socket.on('join_room', async (payload) => {
      const category = typeof payload === 'string' ? payload : (payload?.category || 'all');
      socket.join(category);
      socket.join('all');

      const userId = typeof payload === 'object' ? payload.userId : null;
      const userName = typeof payload === 'object' ? payload.userName : null;

      if (userId || userName) {
        try {
          const numericUserId = await resolveUserId(userId, userName);
          if (numericUserId) {
            const checkRes = await pool.query(
              `SELECT id, is_locked, lock_until, lock_reason, warning_reason 
               FROM users 
               WHERE id = $1`,
              [numericUserId]
            );

            if (checkRes.rows.length > 0) {
              const u = checkRes.rows[0];
              if (u.warning_reason) {
                socket.emit('admin_warning_received', {
                  userId: String(userId),
                  reason: u.warning_reason,
                  warnedBy: 'Ban Quản Trị'
                });
              }

              if (u.is_locked) {
                if (u.lock_until && new Date() > new Date(u.lock_until)) {
                  await pool.query(
                    `UPDATE users SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL WHERE id = $1`,
                    [u.id]
                  );
                  socket.emit('user_unlocked', { userId: String(userId), isLocked: false });
                } else {
                  socket.emit('user_locked', {
                    userId: String(userId),
                    isLocked: true,
                    lockUntil: u.lock_until,
                    reason: u.lock_reason || 'Tài khoản đang bị tạm khóa quyền nhắn tin',
                    durationText: u.lock_until ? new Date(u.lock_until).toLocaleString('vi-VN') : 'Vĩnh viễn',
                  });
                }
              } else {
                socket.emit('user_unlocked', { userId: String(userId), isLocked: false });
              }
            }
          }
        } catch (e) {
          console.error("Lỗi kiểm tra join_room:", e.message);
        }
      }
    });

    // 2. Sự kiện Admin gửi cảnh báo
    socket.on('admin_warn_user', async ({ targetUserId, reason, adminName }) => {
      try {
        const numericUserId = await resolveUserId(targetUserId);
        if (numericUserId) {
          await pool.query(
            `UPDATE users 
             SET warning_reason = $1, last_warning_reason = $1, warning_count = COALESCE(warning_count, 0) + 1 
             WHERE id = $2`,
            [reason, numericUserId]
          ).catch(() => {});
        }

        io.emit('admin_warning_received', {
          userId: String(targetUserId),
          reason: reason || 'Vi phạm nội quy thảo luận cộng đồng',
          warnedBy: adminName || 'Ban Quản Trị',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error("Lỗi socket admin_warn_user:", err.message);
      }
    });

    socket.on('leave_room', (payload) => {
      const category = typeof payload === 'string' ? payload : (payload?.category || 'all');
      socket.leave(category);
    });

    // 3. Nhận và phát tin nhắn
    socket.on('send_message', async (data) => {
      const { category = 'all', userId, userName, avatar, content, imageUrl, replyTo, isAnonymous } = data;
      if ((!content || !content.trim()) && !imageUrl) return;

      try {
        let numericUserId = await resolveUserId(userId, userName);

        if (!numericUserId) {
          const insUser = await pool.query(
            `INSERT INTO users (zalo_id, name, avatar, role)
             VALUES ($1, $2, $3, 'student')
             ON CONFLICT (zalo_id) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [String(userId || 'zalo_' + Date.now()), userName || 'Sinh viên', avatar || '']
          );
          numericUserId = insUser.rows[0].id;
        }

        // Kiểm tra trạng thái khóa tài khoản
        const checkRes = await pool.query(
          `SELECT id, is_locked, lock_until, lock_reason FROM users WHERE id = $1`,
          [numericUserId]
        );

        if (checkRes.rows.length > 0 && checkRes.rows[0].is_locked) {
          const u = checkRes.rows[0];
          if (u.lock_until && new Date() > new Date(u.lock_until)) {
            await pool.query(`UPDATE users SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL WHERE id = $1`, [u.id]);
            socket.emit('user_unlocked', { userId: String(userId), isLocked: false });
          } else {
            return socket.emit('user_locked', {
              userId: String(userId),
              isLocked: true,
              lockUntil: u.lock_until,
              reason: u.lock_reason || 'Tài khoản của bạn đang bị khóa quyền nhắn tin!',
              durationText: u.lock_until ? new Date(u.lock_until).toLocaleString('vi-VN') : 'Vĩnh viễn',
            });
          }
        }

        const displayName = isAnonymous ? 'Sinh viên ẩn danh' : (userName || 'Sinh viên');
        const targetCategory = category || 'all';
        const replyJson = replyTo ? JSON.stringify(replyTo) : null;

        // Lưu vào community_messages với user_id dạng INTEGER
        const insertQuery = `
          INSERT INTO community_messages (category, user_id, content, image_url, reply_to, is_ai, is_recalled)
          VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)
          RETURNING id, category, user_id, content, image_url, is_ai,
                    reply_to AS "replyTo", is_recalled, created_at,
                    TO_CHAR(created_at, 'HH24:MI') as time,
                    TO_CHAR(created_at, 'YYYY-MM-DD') as date;
        `;
        const res = await pool.query(insertQuery, [
          targetCategory, numericUserId, (content || '').trim(), imageUrl || null, replyJson
        ]);

        const savedMsg = {
          ...res.rows[0],
          user_id: userId, // Giữ nguyên userId đầu vào để giao diện client nhận dạng đúng
          user_name: displayName,
          avatar: isAnonymous ? '' : (avatar || '')
        };

        io.emit('receive_message', savedMsg);
        io.emit('admin_new_message', savedMsg);
      } catch (err) {
        console.error('❌ Lỗi socket send_message:', err);
      }
    });

    // 4. Soạn tin
    socket.on('typing', ({ category = 'all', userName, userId }) => {
      socket.to(category).emit('user_typing', { userName, userId, category });
      if (category !== 'all') socket.to('all').emit('user_typing', { userName, userId, category });
    });

    socket.on('stop_typing', ({ category = 'all', userId }) => {
      socket.to(category).emit('user_stop_typing', { userId, category });
      if (category !== 'all') socket.to('all').emit('user_stop_typing', { userId, category });
    });

    // 5. Thu hồi tin nhắn
    socket.on('recall_message', async ({ messageId, userId }) => {
      try {
        const numericUserId = await resolveUserId(userId);
        const checkRes = await pool.query(
          `SELECT id, user_id, created_at FROM community_messages WHERE id = $1`,
          [Number(messageId)]
        );
        if (checkRes.rows.length === 0) return;
        const msg = checkRes.rows[0];

        if (msg.user_id === numericUserId) {
          const diffMinutes = (Date.now() - new Date(msg.created_at).getTime()) / (1000 * 60);
          if (diffMinutes <= 60) {
            await pool.query(
              `UPDATE community_messages 
               SET content = 'Tin nhắn đã được thu hồi', image_url = NULL, is_recalled = TRUE 
               WHERE id = $1`,
              [Number(messageId)]
            );
            io.emit('message_recalled', { messageId: Number(messageId) });
          }
        }
      } catch (e) {
        console.error("Lỗi socket recall_message:", e.message);
      }
    });
  });
};