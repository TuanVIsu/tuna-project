// sockets/chat.socket.js
const pool = require('../config/db');

// Helper: Phân giải user_id (INTEGER) chính xác từ định danh
const resolveUserId = async (rawId) => {
  if (!rawId || rawId === 'guest_user') return null;
  const cleanId = String(rawId).trim();
  if (/^\d+$/.test(cleanId)) return parseInt(cleanId, 10);

  const uRes = await pool.query(
    `SELECT id FROM users 
     WHERE zalo_id = $1 OR student_code = $1 OR LOWER(email) = LOWER($1)
     ORDER BY id DESC LIMIT 1`,
    [cleanId]
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

      if (userId) {
        try {
          const numericUserId = await resolveUserId(userId);
          if (numericUserId) {
            const checkRes = await pool.query(
              `SELECT id, is_locked, lock_until, lock_reason, warning_reason, warning_count 
               FROM users WHERE id = $1`,
              [numericUserId]
            );

            if (checkRes.rows.length > 0) {
              const u = checkRes.rows[0];
              if (u.warning_reason && u.warning_count > 0) {
                socket.emit('admin_warning_received', {
                  userId: String(userId),
                  warningCount: u.warning_count,
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

    // 2. Sự kiện Admin gửi cảnh báo qua Socket
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
        let numericUserId = await resolveUserId(userId);

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
          `SELECT id, is_locked, lock_until, lock_reason, student_code, class_name, warning_count FROM users WHERE id = $1`,
          [numericUserId]
        );

        const uInfo = checkRes.rows[0] || {};
        if (uInfo.is_locked) {
          if (uInfo.lock_until && new Date() > new Date(uInfo.lock_until)) {
            await pool.query(`UPDATE users SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL WHERE id = $1`, [uInfo.id]);
            socket.emit('user_unlocked', { userId: String(userId), isLocked: false });
          } else {
            return socket.emit('user_locked', {
              userId: String(userId),
              isLocked: true,
              lockUntil: uInfo.lock_until,
              reason: uInfo.lock_reason || 'Tài khoản của bạn đang bị khóa quyền nhắn tin!',
              durationText: uInfo.lock_until ? new Date(uInfo.lock_until).toLocaleString('vi-VN') : 'Vĩnh viễn',
            });
          }
        }

        const displayName = isAnonymous ? 'Sinh viên ẩn danh' : (userName || 'Sinh viên');
        const targetCategory = category || 'all';
        const replyJson = replyTo ? (typeof replyTo === 'string' ? replyTo : JSON.stringify(replyTo)) : null;

        const insertQuery = `
          INSERT INTO community_messages (category, user_id, content, image_url, reply_to, is_ai, is_recalled)
          VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)
          RETURNING id, category, user_id, content, image_url, is_ai,
                    reply_to AS "replyTo", is_recalled, created_at,
                    TO_CHAR(created_at, 'HH24:MI') as time,
                    TO_CHAR(created_at, 'YYYY-MM-DD') as date,
                    TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI:SS') as "createdAt";
        `;
        const res = await pool.query(insertQuery, [
          targetCategory, numericUserId, (content || '').trim(), imageUrl || null, replyJson
        ]);

        const savedMsg = {
          ...res.rows[0],
          user_id: numericUserId,
          client_user_id: userId,
          user_name: displayName,
          student_code: uInfo.student_code || null,
          class_name: uInfo.class_name || null,
          warning_count: uInfo.warning_count || 0,
          is_currently_locked: false,
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