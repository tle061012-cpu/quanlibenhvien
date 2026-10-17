const mysql = require('mysql2/promise');

// Khởi tạo Pool kết nối tới MySQL trong XAMPP
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', // Mặc định trong XAMPP là để trống
    database: 'quanlybenhvien',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4'
});

// Kiểm tra kết nối khi khởi động
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Đã kết nối thành công tới MySQL Database: quanlybenhvien');
        connection.release();
    } catch (err) {
        console.error('❌ Lỗi kết nối MySQL:', err.message);
    }
}

testConnection();

module.exports = pool;
