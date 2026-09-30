// config/db.js
const { Pool } = require('pg');

// Ưu tiên sử dụng DATABASE_URL (chuỗi kết nối Supabase từ Render)
// Nếu chạy local không có DATABASE_URL thì tự động dùng cấu hình lẻ
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Bắt buộc cho Supabase trên Render
      },
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'tuna_project_db',
      password: process.env.DB_PASSWORD,
      port: Number(process.env.DB_PORT) || 5432,
    };

const pool = new Pool(poolConfig);

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Lỗi kết nối PostgreSQL:', err.message);
  } else {
    console.log('✅ Đã kết nối thành công đến PostgreSQL database!');
    release();
  }
});

// Tự động kiểm tra và nâng cấp schema
pool.query(`
  ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS is_doc_saved BOOLEAN DEFAULT false;
  ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS is_daily BOOLEAN DEFAULT false;
  ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS daily_date DATE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE;
  ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS google_id VARCHAR(100);
`).catch((err) => console.error('Lỗi cập nhật schema:', err.message));

module.exports = pool;