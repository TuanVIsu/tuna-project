// sockets/chat.socket.js
const pool = require('../config/db');

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
          const checkRes = await pool.query(
            `SELECT is_locked, lock_until, lock_reason 
             FROM users 
             WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($2))
             ORDER BY id DESC LIMIT 1`,
            [userId, userName || '']
          );

          if (checkRes.rows.length > 0) {
            const u = checkRes.rows[0];
            if (u.is_locked) {
              if (u.lock_until && new Date() > new Date(u.lock_until)) {
                await pool.query(
                  `UPDATE users SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL WHERE id = $1`,
                  [u.id]
                );
                socket.emit('user_unlocked', { userId, isLocked: false });
              } else {
                socket.emit('user_locked', {
                  userId,
                  isLocked: true,
                  lockUntil: u.lock_until,
                  reason: u.lock_reason || 'Tài khoản đang bị tạm khóa quyền nhắn tin',
                  durationText: u.lock_until ? new Date(u.lock_until).toLocaleString('vi-VN') : 'Vĩnh viễn',
                });
              }
            } else {
              socket.emit('user_unlocked', { userId, isLocked: false });
            }
          }
        } catch (e) {
          console.error("Lỗi kiểm tra join_room:", e.message);
        }
      }
    });

    socket.on('leave_room', (payload) => {
      const category = typeof payload === 'string' ? payload : (payload?.category || 'all');
      socket.leave(category);
    });

    // 2. Nhận và phát tin nhắn (Lưu đầy đủ replyTo vào CSDL)
    socket.on('send_message', async (data) => {
      const { category = 'all', userId, userName, avatar, content, imageUrl, replyTo, isAnonymous } = data;
      if ((!content || !content.trim()) && !imageUrl) return;

      try {
        const checkRes = await pool.query(
          `SELECT id, is_locked, lock_until, lock_reason 
           FROM users 
           WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(email) = LOWER($1) OR LOWER(TRIM(name)) = LOWER(TRIM($2))
           ORDER BY id DESC LIMIT 1`,
          [userId, userName || '']
        );

        if (checkRes.rows.length > 0 && checkRes.rows[0].is_locked) {
          const u = checkRes.rows[0];
          if (u.lock_until && new Date() > new Date(u.lock_until)) {
            await pool.query(`UPDATE users SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL WHERE id = $1`, [u.id]);
            socket.emit('user_unlocked', { userId, isLocked: false });
          } else {
            return socket.emit('user_locked', {
              userId,
              isLocked: true,
              lockUntil: u.lock_until,
              reason: u.lock_reason || 'Tài khoản của bạn đang bị khóa quyền nhắn tin!',
              durationText: u.lock_until ? new Date(u.lock_until).toLocaleString('vi-VN') : 'Vĩnh viễn',
            });
          }
        }

        const displayName = isAnonymous ? (userName || 'Sinh viên ẩn danh') : userName;
        const targetCategory = category || 'all';
        const replyJson = replyTo ? JSON.stringify(replyTo) : null;

        let savedMsg = null;
        try {
          const insertQuery = `
            INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url, reply_to, is_ai, is_recalled)
            VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, FALSE)
            RETURNING id, category, user_id, user_name, avatar, content, image_url, is_ai,
                      reply_to AS "replyTo", is_recalled, created_at,
                      TO_CHAR(created_at, 'HH24:MI') as time,
                      TO_CHAR(created_at, 'YYYY-MM-DD') as date;
          `;
          const res = await pool.query(insertQuery, [
            targetCategory, userId, displayName, avatar || '', (content || '').trim(), imageUrl || null, replyJson
          ]);
          savedMsg = res.rows[0];
        } catch (insertErr) {
          const fallbackQuery = `
            INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, category, user_id, user_name, avatar, content, image_url, created_at,
                      TO_CHAR(created_at, 'HH24:MI') as time,
                      TO_CHAR(created_at, 'YYYY-MM-DD') as date;
          `;
          const res2 = await pool.query(fallbackQuery, [
            targetCategory, userId, displayName, avatar || '', (content || '').trim(), imageUrl || null
          ]);
          savedMsg = { ...res2.rows[0], replyTo };
        }

        io.emit('receive_message', savedMsg);
        io.emit('admin_new_message', savedMsg);
      } catch (err) {
        console.error('❌ Lỗi socket send_message:', err);
      }
    });

    // 3. Tín hiệu đang soạn tin
    socket.on('typing', ({ category = 'all', userName, userId }) => {
      socket.to(category).emit('user_typing', { userName, userId, category });
      if (category !== 'all') socket.to('all').emit('user_typing', { userName, userId, category });
    });

    socket.on('stop_typing', ({ category = 'all', userId }) => {
      socket.to(category).emit('user_stop_typing', { userId, category });
      if (category !== 'all') socket.to('all').emit('user_stop_typing', { userId, category });
    });

    // 4. Thu hồi tin nhắn realtime (Kiểm tra đúng 60 phút)
    socket.on('recall_message', async ({ messageId, userId }) => {
      try {
        const checkRes = await pool.query(
          `SELECT id, user_id, created_at FROM community_messages WHERE id = $1`,
          [Number(messageId)]
        );
        if (checkRes.rows.length === 0) return;
        const msg = checkRes.rows[0];

        if (String(msg.user_id) === String(userId)) {
          const diffMinutes = (Date.now() - new Date(msg.created_at).getTime()) / (1000 * 60);
          if (diffMinutes <= 60) {
            await pool.query(
              `UPDATE community_messages 
               SET content = 'Tin nhắn đã được thu hồi', image_url = NULL, is_recalled = TRUE 
               WHERE id = $1`,
              [Number(messageId)]
            ).catch(async () => {
              await pool.query(
                `UPDATE community_messages SET content = 'Tin nhắn đã được thu hồi', image_url = NULL WHERE id = $1`,
                [Number(messageId)]
              );
            });

            io.emit('message_recalled', { messageId: Number(messageId) });
          }
        }
      } catch (e) {
        console.error("Lỗi socket recall_message:", e.message);
      }
    });
  });
};