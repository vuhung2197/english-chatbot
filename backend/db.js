const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'user1',
  password: process.env.DB_PASSWORD || '/cM0FdI3qz4yq55T',
  database: process.env.DB_DATABASE || 'chatbot',
  port: 3306,
  charset: 'utf8mb4'
});
module.exports = pool;
