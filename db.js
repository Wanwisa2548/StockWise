require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    useUTC: false          // ให้เวลาเป็นเวลาไทย ไม่แปลงเป็น UTC
  }
};

const poolPromise = new sql.ConnectionPool(config).connect();
// Keep the HTTP server available to report a connection failure through the API.
// This handler does not replace the rejected promise or inject demo data.
poolPromise.catch(err => console.error('เชื่อมต่อ SQL Server ไม่สำเร็จ:', err.code || 'CONNECTION_ERROR'));
module.exports = { sql, poolPromise };
