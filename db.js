/**
 * =====================================================================================
 * HỆ THỐNG QUẢN LÝ BỆNH VIỆN VÀ ĐẶT LỊCH KHÁM THÔNG MINH - ĐỒ ÁN CHUYÊN NGÀNH (NHÓM 12)
 * =====================================================================================
 * 
 * 📁 TÊN FILE: db.js
 * 🎯 MỤC ĐÍCH: Khởi tạo và quản lý Pool kết nối tới Cơ sở dữ liệu MySQL (qua thư viện mysql2/promise).
 * 🗄️ CƠ SỞ DỮ LIỆU: `quanlybenhvien`
 * 
 * ⚙️ THÔNG SỐ KẾT NỐI (XAMPP DEFAULT):
 *    - Host: localhost (127.0.0.1)
 *    - Port: 3306
 *    - User: root
 *    - Password: "" (Mặc định trong XAMPP để trống)
 *    - Charset: utf8mb4 (Hỗ trợ tiếng Việt có dấu đầy đủ)
 * =====================================================================================
 */

const mysql = require('mysql2/promise');

// Khởi tạo Connection Pool tới MySQL trong XAMPP
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

/**
 * Kiểm tra kết nối tới cơ sở dữ liệu ngay khi khởi động Server
 */
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
