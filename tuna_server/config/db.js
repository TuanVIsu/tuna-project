// config/db.js
const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
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

module.exports = pool;
