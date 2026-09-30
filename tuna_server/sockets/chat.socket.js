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
             WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))
             ORDER BY id DESC LIMIT 1`,
            [userId, userName || '']
          );

          if (checkRes.rows.length > 0) {
            const u = checkRes.rows[0];
            if (u.is_locked) {
              if (u.lock_until && new Date() > new Date(u.lock_until)) {
                await pool.query(
                  `UPDATE users SET is_locked = FALSE, lock_until = NULL, lock_reason = NULL 
                   WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))`,
                  [userId, userName || '']
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

    // 2. Nhận tin nhắn và LƯU TRỰC TIẾP VÀO POSTGRESQL
    socket.on('send_message', async (data) => {
      const { category = 'all', userId, userName, avatar, content, imageUrl, isAnonymous } = data;
      if ((!content || !content.trim()) && !imageUrl) return;

      try {
        // Kiểm tra xem tài khoản có đang bị khóa hay không
        const checkRes = await pool.query(
          `SELECT id, is_locked, lock_until, lock_reason 
           FROM users 
           WHERE zalo_id = $1 OR student_code = $1 OR id::TEXT = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($2))
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

        // THỰC HIỆN LƯU VÀO CSDL
        let savedMsg = null;
        try {
          const insertQuery = `
            INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url, is_ai)
            VALUES ($1, $2, $3, $4, $5, $6, FALSE)
            RETURNING id, category, user_id, user_name, avatar, content, image_url, is_ai,
                      TO_CHAR(created_at, 'HH24:MI') as time,
                      TO_CHAR(created_at, 'YYYY-MM-DD') as date;
          `;
          const res = await pool.query(insertQuery, [
            targetCategory,
            userId,
            displayName,
            avatar || '',
            (content || '').trim(),
            imageUrl || null,
          ]);
          savedMsg = res.rows[0];
        } catch (insertErr) {
          // Fallback nếu bảng chưa có cột is_ai
          console.warn("Thử insert fallback không có is_ai:", insertErr.message);
          const fallbackQuery = `
            INSERT INTO community_messages (category, user_id, user_name, avatar, content, image_url)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, category, user_id, user_name, avatar, content, image_url,
                      TO_CHAR(created_at, 'HH24:MI') as time,
                      TO_CHAR(created_at, 'YYYY-MM-DD') as date;
          `;
          const res2 = await pool.query(fallbackQuery, [
            targetCategory,
            userId,
            displayName,
            avatar || '',
            (content || '').trim(),
            imageUrl || null,
          ]);
          savedMsg = res2.rows[0];
        }

        console.log("✅ ĐÃ LƯU TIN NHẮN VÀO CSDL THÀNH CÔNG:", savedMsg?.id, savedMsg?.content);

        // Phát tin nhắn chính thức đã lưu tới các client
        io.emit('receive_message', savedMsg);
        io.emit('admin_new_message', savedMsg);
      } catch (err) {
        console.error('❌ LỖI NGHIÊM TRỌNG KHI LƯU TIN NHẮN:', err);
      }
    });
    // Thêm vào trong io.on('connection', (socket) => { ... }) của sockets/chat.socket.js

    // 1. Nhận tín hiệu đang gõ
    socket.on('typing', ({ category = 'all', userName, userId }) => {
      socket.to(category).emit('user_typing', { userName, userId, category });
      if (category !== 'all') {
        socket.to('all').emit('user_typing', { userName, userId, category });
      }
    });

    // 2. Nhận tín hiệu dừng gõ
    socket.on('stop_typing', ({ category = 'all', userId }) => {
      socket.to(category).emit('user_stop_typing', { userId, category });
      if (category !== 'all') {
        socket.to('all').emit('user_stop_typing', { userId, category });
      }
    });
  });
};