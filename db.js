// db.js
const { Pool } = require('pg');

// 使用 Heroku 提供的环境变量 DATABASE_URL
// 如果在本地开发，则使用默认的本地连接字符串
const connectionString = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mydatabase';

const pool = new Pool({
  connectionString: connectionString,
  // 额外配置：对于 Heroku Postgres，需要禁用 SSL
  // 在本地开发时，不需要这个
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};