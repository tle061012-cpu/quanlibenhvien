const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Trạng thái hoạt động của Bác sĩ (in-memory state)
let doctorStatus = "READY"; // READY | PAUSED

// ==========================================
// REST API ĐĂNG NHẬP (AUTH)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập ID/SĐT và mật khẩu!" });
    }

    try {
        const [rows] = await db.query(`
            SELECT Manguoidung as id, Hoten as name, Sodienthoai as phone, Email as email, Vaitro as role, Matkhau as password
            FROM nguoidung
            WHERE (Sodienthoai = ? OR Email = ? OR Manguoidung = ?) AND Matkhau = ?
            LIMIT 1
        `, [identifier.trim(), identifier.trim(), identifier.trim(), password.trim()]);

        if (rows.length === 0) {
            return res.status(401).json({ success: false, message: "Sai tên đăng nhập (ID/SĐT/Email) hoặc mật khẩu!" });
        }

        const user = rows[0];
        res.json({
            success: true,
            message: "Đăng nhập thành công!",
            user: {
                id: user.id,
                name: user.name,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        console.error("Lỗi đăng nhập:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// REST APIs BÁC SĨ (KẾT NỐI MYSQL THẬT)
// ==========================================

// 1. Lấy thông tin Bác sĩ
app.get('/api/doctor/profile', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT b.Mabacsi as id, n.Hoten as name, c.Tenchuyenkhoa as department, 
                   p.Sophong as room, n.Anhdaidien as avatar, b.Trinhdo as title
            FROM bacsi b
            JOIN nguoidung n ON b.Manguoidung = n.Manguoidung
            LEFT JOIN chuyenkhoa c ON b.Machuyenkhoa = c.Machuyenkhoa
            LEFT JOIN phongkham p ON p.Machuyenkhoa = c.Machuyenkhoa
            WHERE b.Mabacsi = 1
            LIMIT 1
        `);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy thông tin bác sĩ" });
        }

        const doc = rows[0];
        res.json({
            id: doc.id,
            name: doc.name,
            department: doc.department || "Khoa Tai Mũi Họng",
            room: doc.room ? `Phòng ${doc.room}` : "Phòng 204",
            avatar: doc.avatar || "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80",
            status: doctorStatus
        });
    } catch (err) {
        console.error("Lỗi lấy thông tin bác sĩ:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Thống kê Dashboard Bác sĩ
app.get('/api/doctor/dashboard-stats', async (req, res) => {
    try {
        const [[{ totalToday }]] = await db.query(
            "SELECT COUNT(*) as totalToday FROM lichhenkham WHERE Ngaykham = CURDATE()"
        );
        const [[{ waitingCount }]] = await db.query(
            "SELECT COUNT(*) as waitingCount FROM hangdoi WHERE Maphong = 1 AND Trangthai = 'DANGCHO'"
        );
        const [[{ doneCount }]] = await db.query(
            "SELECT COUNT(*) as doneCount FROM hangdoi WHERE Maphong = 1 AND Trangthai = 'HOANTHANH'"
        );
        const [[{ skippedCount }]] = await db.query(
            "SELECT COUNT(*) as skippedCount FROM hangdoi WHERE Maphong = 1 AND Trangthai = 'BOLUOT'"
        );

        // Lấy bệnh nhân đang khám hiện tại (nếu có)
        const [consultingRows] = await db.query(`
            SELECT h.Mahangdoi, h.Malichhen, h.Sothutu, h.Trangthai,
                   CONCAT('TMH-0', h.Sothutu) as ticketNumber,
                   n.Hoten as patientName, n.Sodienthoai as phone, l.Khunggio as appointmentTime,
                   DATE_FORMAT(h.Thoigiantao, '%H:%i') as checkinTime, n.Manguoidung as patientId
            FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            WHERE h.Maphong = 1 AND h.Trangthai = 'DANGKHAM'
            LIMIT 1
        `);

        let currentConsulting = null;
        if (consultingRows.length > 0) {
            const p = consultingRows[0];
            
            // Lấy lịch sử khám cũ
            const [historyRows] = await db.query(`
                SELECT k.Chandoan as diagnosis, doc_n.Hoten as doctor, 
                       DATE_FORMAT(k.Ngaykhamxong, '%d/%m/%Y') as date
                FROM ketquakham k
                JOIN bacsi b ON k.Mabacsi = b.Mabacsi
                JOIN nguoidung doc_n ON b.Manguoidung = doc_n.Manguoidung
                WHERE k.Malichhen IN (SELECT Malichhen FROM lichhenkham WHERE Mabenhnhan = ?)
                ORDER BY k.Ngaykhamxong DESC
            `, [p.patientId]);

            // Lấy tài liệu OCR cũ
            const [ocrRows] = await db.query(`
                SELECT Matailieu as id, 'Đơn thuốc cũ' as title, 'Prescription' as type,
                       DATE_FORMAT(Ngaytailen, '%d/%m/%Y') as scannedDate,
                       Duongdananh as previewUrl, Noidungocr as rawOcr
                FROM tailieuocr
                WHERE Mabenhnhan = ?
            `, [p.patientId]);

            const formattedOcr = ocrRows.map(doc => ({
                id: doc.id,
                title: doc.title,
                type: doc.type,
                scannedDate: doc.scannedDate,
                previewUrl: doc.previewUrl,
                extractedFields: {
                    "Trích xuất OCR": doc.rawOcr || "Chưa có nội dung trích xuất"
                }
            }));

            currentConsulting = {
                id: p.Malichhen,
                ticketNumber: p.ticketNumber,
                patientName: p.patientName,
                age: 30,
                gender: "Nam",
                phone: p.phone,
                appointmentTime: p.appointmentTime,
                checkinTime: p.checkinTime,
                reason: "Viêm họng rát, nuốt đau, sốt nhẹ",
                status: "IN_CONSULT",
                history: historyRows,
                ocrDocs: formattedOcr
            };
        }

        res.json({
            totalToday,
            waitingCount,
            doneCount,
            skippedCount,
            currentConsulting
        });
    } catch (err) {
        console.error("Lỗi thống kê dashboard:", err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Lấy danh sách hàng đợi (Queue)
app.get('/api/doctor/queue', async (req, res) => {
    try {
        // Đang khám
        const [consultingRows] = await db.query(`
            SELECT h.Mahangdoi, h.Malichhen, h.Sothutu,
                   CONCAT('TMH-0', h.Sothutu) as ticketNumber,
                   n.Hoten as patientName, n.Sodienthoai as phone, l.Khunggio as appointmentTime,
                   DATE_FORMAT(h.Thoigiantao, '%H:%i') as checkinTime, n.Manguoidung as patientId
            FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            WHERE h.Maphong = 1 AND h.Trangthai = 'DANGKHAM'
            LIMIT 1
        `);

        let inConsult = null;
        if (consultingRows.length > 0) {
            const p = consultingRows[0];
            const [historyRows] = await db.query(`
                SELECT k.Chandoan as diagnosis, doc_n.Hoten as doctor, 
                       DATE_FORMAT(k.Ngaykhamxong, '%d/%m/%Y') as date
                FROM ketquakham k
                JOIN bacsi b ON k.Mabacsi = b.Mabacsi
                JOIN nguoidung doc_n ON b.Manguoidung = doc_n.Manguoidung
                WHERE k.Malichhen IN (SELECT Malichhen FROM lichhenkham WHERE Mabenhnhan = ?)
            `, [p.patientId]);

            const [ocrRows] = await db.query(`
                SELECT Matailieu as id, 'Đơn thuốc cũ' as title, 'Prescription' as type,
                       DATE_FORMAT(Ngaytailen, '%d/%m/%Y') as scannedDate,
                       Duongdananh as previewUrl, Noidungocr as rawOcr
                FROM tailieuocr
                WHERE Mabenhnhan = ?
            `, [p.patientId]);

            inConsult = {
                id: p.Malichhen,
                ticketNumber: p.ticketNumber,
                patientName: p.patientName,
                age: 30,
                gender: "Nam",
                phone: p.phone,
                appointmentTime: p.appointmentTime,
                checkinTime: p.checkinTime,
                reason: "Viêm họng rát, nuốt đau, sốt nhẹ",
                status: "IN_CONSULT",
                history: historyRows,
                ocrDocs: ocrRows.map(doc => ({
                    id: doc.id,
                    title: doc.title,
                    type: doc.type,
                    scannedDate: doc.scannedDate,
                    previewUrl: doc.previewUrl,
                    extractedFields: { "Trích xuất OCR": doc.rawOcr || "Nội dung nhận diện" }
                }))
            };
        }

        // Đang chờ
        const [waitingRows] = await db.query(`
            SELECT h.Mahangdoi as id, CONCAT('TMH-0', h.Sothutu) as ticketNumber,
                   n.Hoten as patientName, n.Sodienthoai as phone, l.Khunggio as appointmentTime,
                   'WAITING' as status
            FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            WHERE h.Maphong = 1 AND h.Trangthai = 'DANGCHO'
            ORDER BY h.Sothutu ASC
        `);

        // Đã hoàn thành
        const [completedRows] = await db.query(`
            SELECT h.Mahangdoi as id, CONCAT('TMH-0', h.Sothutu) as ticketNumber,
                   n.Hoten as patientName, 'DONE' as status
            FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            WHERE h.Maphong = 1 AND h.Trangthai = 'HOANTHANH'
        `);

        res.json({
            inConsult,
            waiting: waitingRows,
            completed: completedRows,
            skipped: []
        });
    } catch (err) {
        console.error("Lỗi lấy danh sách queue:", err);
        res.status(500).json({ error: err.message });
    }
});

// 4. Bác sĩ gọi bệnh nhân tiếp theo (MySQL Update)
app.post('/api/doctor/call-next', async (req, res) => {
    try {
        // Hoàn thành ca hiện tại nếu có
        await db.query(`
            UPDATE hangdoi SET Trangthai = 'HOANTHANH'
            WHERE Maphong = 1 AND Trangthai = 'DANGKHAM'
        `);

        // Lấy bệnh nhân đang chờ đầu tiên
        const [nextList] = await db.query(`
            SELECT h.Mahangdoi, h.Malichhen, h.Sothutu, n.Hoten as patientName
            FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            WHERE h.Maphong = 1 AND h.Trangthai = 'DANGCHO'
            ORDER BY h.Sothutu ASC
            LIMIT 1
        `);

        if (nextList.length === 0) {
            return res.status(404).json({ message: "Không còn bệnh nhân nào trong hàng đợi!" });
        }

        const nextP = nextList[0];
        await db.query("UPDATE hangdoi SET Trangthai = 'DANGKHAM' WHERE Mahangdoi = ?", [nextP.Mahangdoi]);

        res.json({
            message: `Đang gọi bệnh nhân ${nextP.patientName} (STT: TMH-0${nextP.Sothutu}) vào phòng!`,
            ticketNumber: `TMH-0${nextP.Sothutu}`
        });
    } catch (err) {
        console.error("Lỗi gọi bệnh nhân tiếp theo:", err);
        res.status(500).json({ error: err.message });
    }
});

// 5. Bỏ lượt bệnh nhân hiện tại
app.post('/api/doctor/skip-current', async (req, res) => {
    try {
        const [result] = await db.query(`
            UPDATE hangdoi SET Trangthai = 'BOLUOT'
            WHERE Maphong = 1 AND Trangthai = 'DANGKHAM'
        `);

        if (result.affectedRows === 0) {
            return res.status(400).json({ message: "Hiện không có bệnh nhân nào đang ở phòng khám để bỏ lượt!" });
        }

        res.json({ message: "Đã đánh dấu bỏ lượt bệnh nhân hiện tại thành công!" });
    } catch (err) {
        console.error("Lỗi bỏ lượt:", err);
        res.status(500).json({ error: err.message });
    }
});

// 6. Hoàn tất ca khám & Nhập kết quả
app.post('/api/doctor/complete-consultation', async (req, res) => {
    const { patientId, diagnosis, treatmentPlan, notes } = req.body;
    try {
        // Tìm ca đang khám
        const [rows] = await db.query(`
            SELECT Mahangdoi, Malichhen FROM hangdoi
            WHERE Maphong = 1 AND Trangthai = 'DANGKHAM'
            LIMIT 1
        `);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Không tìm thấy phiên khám hợp lệ!" });
        }

        const { Mahangdoi, Malichhen } = rows[0];

        // Lưu vào bảng ketquakham
        await db.query(`
            INSERT INTO ketquakham (Malichhen, Mabacsi, Chandoan, Phuongandieutri, Ghichu)
            VALUES (?, 1, ?, ?, ?)
        `, [Malichhen, diagnosis || "Đã khám bệnh", treatmentPlan || "", notes || ""]);

        // Cập nhật trạng thái sang HOANTHANH
        await db.query("UPDATE hangdoi SET Trangthai = 'HOANTHANH' WHERE Mahangdoi = ?", [Mahangdoi]);
        await db.query("UPDATE lichhenkham SET Trangthai = 'HOANTHANH' WHERE Malichhen = ?", [Malichhen]);

        res.json({ message: "Đã lưu kết quả khám thành công vào MySQL Database!" });
    } catch (err) {
        console.error("Lỗi lưu kết quả khám:", err);
        res.status(500).json({ error: err.message });
    }
});

// 7. Chuyển đổi trạng thái phòng khám
app.post('/api/doctor/toggle-status', (req, res) => {
    doctorStatus = doctorStatus === 'READY' ? 'PAUSED' : 'READY';
    res.json({
        message: `Đã chuyển trạng thái phòng sang: ${doctorStatus === 'READY' ? 'Sẵn sàng đón bệnh' : 'Tạm nghỉ'}`,
        status: doctorStatus
    });
});

// ==========================================
// REST APIs LỄ TÂN (KẾT NỐI MYSQL THẬT)
// ==========================================

// 1. Thống kê tổng quan lễ tân
app.get('/api/reception/overview', async (req, res) => {
    try {
        const [[{ totalAppointments }]] = await db.query(
            "SELECT COUNT(*) as totalAppointments FROM lichhenkham WHERE Ngaykham = CURDATE()"
        );
        const [[{ checkedInCount }]] = await db.query(
            "SELECT COUNT(*) as checkedInCount FROM lichhenkham WHERE Ngaykham = CURDATE() AND Trangthai IN ('DACHECKIN', 'HOANTHANH')"
        );
        const [[{ pendingCheckinCount }]] = await db.query(
            "SELECT COUNT(*) as pendingCheckinCount FROM lichhenkham WHERE Ngaykham = CURDATE() AND Trangthai = 'DAXACNHAN'"
        );

        // Đếm số chờ tại phòng 204
        const [[{ waitingTMH }]] = await db.query(
            "SELECT COUNT(*) as waitingTMH FROM hangdoi WHERE Maphong = 1 AND Trangthai = 'DANGCHO'"
        );
        const [currentTMH] = await db.query(`
            SELECT n.Hoten as patientName FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            WHERE h.Maphong = 1 AND h.Trangthai = 'DANGKHAM'
            LIMIT 1
        `);

        res.json({
            totalAppointments,
            checkedInCount,
            pendingCheckinCount,
            clinics: [
                {
                    name: "Khoa Tai Mũi Họng",
                    room: "Phòng 204",
                    doctor: "BS. CKII Lê Hoàng Minh",
                    waitingCount: waitingTMH,
                    currentPatient: currentTMH.length > 0 ? currentTMH[0].patientName : "Đang trống",
                    status: doctorStatus
                },
                {
                    name: "Khoa Răng Hàm Mặt",
                    room: "Phòng 105",
                    doctor: "BS. Nguyễn Thành Long",
                    waitingCount: 2,
                    currentPatient: "Trương Văn Nam",
                    status: "READY"
                },
                {
                    name: "Khoa Nội Tổng Quát",
                    room: "Phòng 102",
                    doctor: "ThS. BS. Vũ Mai Anh",
                    waitingCount: 3,
                    currentPatient: "Đặng Thị Hoa",
                    status: "READY"
                }
            ]
        });
    } catch (err) {
        console.error("Lỗi lấy tổng quan lễ tân:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Danh sách lịch hẹn
app.get('/api/reception/appointments', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT l.Malichhen as id, l.Maqr as qrToken, n.Hoten as patientName, n.Sodienthoai as phone,
                   l.Khunggio as appointmentTime, c.Tenchuyenkhoa as department, p.Sophong as room,
                   doc_n.Hoten as doctor,
                   IF(l.Trangthai IN ('DACHECKIN', 'HOANTHANH'), 'CHECKED_IN', 'CONFIRMED') as status,
                   30 as age, 'Nam' as gender
            FROM lichhenkham l
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            JOIN bacsi b ON l.Mabacsi = b.Mabacsi
            JOIN nguoidung doc_n ON b.Manguoidung = doc_n.Manguoidung
            LEFT JOIN chuyenkhoa c ON b.Machuyenkhoa = c.Machuyenkhoa
            LEFT JOIN phongkham p ON p.Machuyenkhoa = c.Machuyenkhoa
            WHERE l.Ngaykham = CURDATE()
            ORDER BY l.Khunggio ASC
        `);

        res.json(rows);
    } catch (err) {
        console.error("Lỗi lấy danh sách lịch hẹn:", err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Quét mã QR Check-in (Cập nhật MySQL)
app.post('/api/reception/checkin', async (req, res) => {
    const { qrToken, appointmentId } = req.body;
    try {
        let sql = "SELECT * FROM lichhenkham WHERE ";
        let params = [];
        if (qrToken) {
            sql += "Maqr = ?";
            params.push(qrToken.trim().toUpperCase());
        } else {
            sql += "Malichhen = ?";
            params.push(appointmentId);
        }

        const [rows] = await db.query(sql, params);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: "Không tìm thấy lịch hẹn hoặc mã QR không hợp lệ!" });
        }

        const apt = rows[0];
        if (apt.Trangthai === 'DACHECKIN' || apt.Trangthai === 'HOANTHANH') {
            return res.status(400).json({ success: false, message: "Lịch hẹn này đã được check-in trước đó rồi!" });
        }

        // Lấy số thứ tự lớn nhất hiện tại
        const [[{ maxSTT }]] = await db.query("SELECT COALESCE(MAX(Sothutu), 15) as maxSTT FROM hangdoi WHERE Maphong = 1");
        const nextSTT = maxSTT + 1;
        const ticketNumber = `TMH-0${nextSTT}`;

        // Cập nhật trạng thái lịch hẹn
        await db.query("UPDATE lichhenkham SET Trangthai = 'DACHECKIN' WHERE Malichhen = ?", [apt.Malichhen]);

        // Thêm vào hàng đợi (hangdoi)
        await db.query(`
            INSERT INTO hangdoi (Malichhen, Maphong, Sothutu, Trangthai)
            VALUES (?, 1, ?, 'DANGCHO')
        `, [apt.Malichhen, nextSTT]);

        // Lấy thông tin bệnh nhân
        const [[patient]] = await db.query("SELECT Hoten, Sodienthoai FROM nguoidung WHERE Manguoidung = ?", [apt.Mabenhnhan]);

        // Đếm số người chờ phía trước
        const [[{ peopleAhead }]] = await db.query(
            "SELECT COUNT(*) as peopleAhead FROM hangdoi WHERE Maphong = 1 AND Trangthai = 'DANGCHO' AND Sothutu < ?",
            [nextSTT]
        );

        res.json({
            success: true,
            message: `Check-in thành công cho bệnh nhân ${patient.Hoten}!`,
            ticket: {
                ticketNumber,
                patientName: patient.Hoten,
                phone: patient.Sodienthoai,
                department: "Khoa Tai Mũi Họng",
                room: "Phòng khám 204 - Tầng 2",
                doctor: "BS. CKII Lê Hoàng Minh",
                checkinTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                peopleAhead,
                estimatedWaitMinutes: peopleAhead * 12
            }
        });
    } catch (err) {
        console.error("Lỗi check-in:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. Tiếp nhận khách vãng lai (Lưu MySQL)
app.post('/api/reception/walk-in', async (req, res) => {
    const { patientName, phone, age, gender, reason } = req.body;
    if (!patientName || !phone) {
        return res.status(400).json({ success: false, message: "Vui lòng nhập họ tên và số điện thoại!" });
    }

    try {
        // Tìm hoặc tạo người dùng
        let [[user]] = await db.query("SELECT Manguoidung FROM nguoidung WHERE Sodienthoai = ?", [phone]);
        let userId = user ? user.Manguoidung : null;

        if (!userId) {
            const [insertUser] = await db.query(`
                INSERT INTO nguoidung (Hoten, Sodienthoai, Matkhau, Vaitro)
                VALUES (?, ?, '123456', 'BENHNHAN')
            `, [patientName, phone]);
            userId = insertUser.insertId;
        }

        // Tạo lịch hẹn vãng lai
        const qrCode = `WALK-IN-${Date.now().toString().slice(-6)}`;
        const [insertApt] = await db.query(`
            INSERT INTO lichhenkham (Mabenhnhan, Mabacsi, Ngaykham, Khunggio, Maqr, Trangthai)
            VALUES (?, 1, CURDATE(), 'Vãng lai', ?, 'DACHECKIN')
        `, [userId, qrCode]);

        const aptId = insertApt.insertId;

        // Sinh STT tiếp theo
        const [[{ maxSTT }]] = await db.query("SELECT COALESCE(MAX(Sothutu), 15) as maxSTT FROM hangdoi WHERE Maphong = 1");
        const nextSTT = maxSTT + 1;
        const ticketNumber = `TMH-0${nextSTT}`;

        // Thêm vào hangdoi
        await db.query(`
            INSERT INTO hangdoi (Malichhen, Maphong, Sothutu, Trangthai)
            VALUES (?, 1, ?, 'DANGCHO')
        `, [aptId, nextSTT]);

        const [[{ peopleAhead }]] = await db.query(
            "SELECT COUNT(*) as peopleAhead FROM hangdoi WHERE Maphong = 1 AND Trangthai = 'DANGCHO' AND Sothutu < ?",
            [nextSTT]
        );

        res.json({
            success: true,
            message: `Đã cấp số khám trực tiếp cho bệnh nhân ${patientName}!`,
            ticket: {
                ticketNumber,
                patientName,
                phone,
                department: "Khoa Tai Mũi Họng",
                room: "Phòng khám 204 - Tầng 2",
                doctor: "BS. CKII Lê Hoàng Minh",
                checkinTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                peopleAhead,
                estimatedWaitMinutes: peopleAhead * 12
            }
        });
    } catch (err) {
        console.error("Lỗi tiếp nhận vãng lai:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// REST APIs BỆNH NHÂN (DÀNH CHO ANDROID APP)
// ==========================================

// 1. Danh sách Chuyên khoa & Bác sĩ để chọn đặt lịch
app.get('/api/patient/departments', async (req, res) => {
    try {
        const [depts] = await db.query("SELECT Machuyenkhoa as id, Tenchuyenkhoa as name, Mota as description FROM chuyenkhoa");
        const [doctors] = await db.query(`
            SELECT b.Mabacsi as id, n.Hoten as name, b.Machuyenkhoa as departmentId, 
                   b.Trinhdo as title, p.Sophong as room
            FROM bacsi b
            JOIN nguoidung n ON b.Manguoidung = n.Manguoidung
            LEFT JOIN phongkham p ON p.Machuyenkhoa = b.Machuyenkhoa
        `);

        const result = depts.map(d => ({
            ...d,
            doctors: doctors.filter(doc => doc.departmentId === d.id)
        }));

        res.json(result);
    } catch (err) {
        console.error("Lỗi lấy danh mục chuyên khoa:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Bệnh nhân đặt lịch khám (Tạo Appointment & sinh mã QR)
app.post('/api/patient/book', async (req, res) => {
    const { patientName, phone, doctorId, date, timeSlot, reason } = req.body;
    if (!phone || !doctorId || !date || !timeSlot) {
        return res.status(400).json({ success: false, message: "Vui lòng điền đầy đủ thông tin đặt lịch!" });
    }

    try {
        // Tìm hoặc tạo tài khoản bệnh nhân
        let [[user]] = await db.query("SELECT Manguoidung FROM nguoidung WHERE Sodienthoai = ?", [phone.trim()]);
        let patientId = user ? user.Manguoidung : null;

        if (!patientId) {
            const [insertUser] = await db.query(`
                INSERT INTO nguoidung (Hoten, Sodienthoai, Matkhau, Vaitro)
                VALUES (?, ?, '123456', 'BENHNHAN')
            `, [patientName || "Bệnh nhân", phone.trim()]);
            patientId = insertUser.insertId;
        }

        // Sinh mã QR ngẫu nhiên an toàn
        const qrToken = `QR-MED-${Date.now().toString().slice(-6)}`;

        // Tạo lịch hẹn
        const [insertApt] = await db.query(`
            INSERT INTO lichhenkham (Mabenhnhan, Mabacsi, Ngaykham, Khunggio, Maqr, Trangthai)
            VALUES (?, ?, ?, ?, ?, 'DAXACNHAN')
        `, [patientId, doctorId, date, timeSlot, qrToken]);

        // Lấy thông tin chi tiết trả về
        const [rows] = await db.query(`
            SELECT l.Malichhen as appointmentId, l.Maqr as qrToken, l.Ngaykham as date, l.Khunggio as timeSlot,
                   n.Hoten as patientName, doc_n.Hoten as doctorName, c.Tenchuyenkhoa as department, p.Sophong as room
            FROM lichhenkham l
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            JOIN bacsi b ON l.Mabacsi = b.Mabacsi
            JOIN nguoidung doc_n ON b.Manguoidung = doc_n.Manguoidung
            LEFT JOIN chuyenkhoa c ON b.Machuyenkhoa = c.Machuyenkhoa
            LEFT JOIN phongkham p ON p.Machuyenkhoa = c.Machuyenkhoa
            WHERE l.Malichhen = ?
        `, [insertApt.insertId]);

        res.json({
            success: true,
            message: "Đặt lịch khám thành công!",
            appointment: rows[0]
        });
    } catch (err) {
        console.error("Lỗi đặt lịch:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. Xem danh sách lịch hẹn của bệnh nhân
app.get('/api/patient/appointments/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;
        const [rows] = await db.query(`
            SELECT l.Malichhen as id, l.Maqr as qrToken, DATE_FORMAT(l.Ngaykham, '%d/%m/%Y') as date, 
                   l.Khunggio as timeSlot, l.Trangthai as status,
                   doc_n.Hoten as doctorName, c.Tenchuyenkhoa as department, p.Sophong as room,
                   h.Sothutu as ticketNumber, h.Trangthai as queueStatus
            FROM lichhenkham l
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            JOIN bacsi b ON l.Mabacsi = b.Mabacsi
            JOIN nguoidung doc_n ON b.Manguoidung = doc_n.Manguoidung
            LEFT JOIN chuyenkhoa c ON b.Machuyenkhoa = c.Machuyenkhoa
            LEFT JOIN phongkham p ON p.Machuyenkhoa = c.Machuyenkhoa
            LEFT JOIN hangdoi h ON h.Malichhen = l.Malichhen
            WHERE n.Sodienthoai = ?
            ORDER BY l.Ngaykham DESC, l.Khunggio DESC
        `, [phone]);

        res.json(rows);
    } catch (err) {
        console.error("Lỗi lấy lịch hẹn bệnh nhân:", err);
        res.status(500).json({ error: err.message });
    }
});

// 4. Theo dõi hàng đợi trực tiếp (Live Smart Queue Tracker cho App)
app.get('/api/patient/queue-tracker/:phone', async (req, res) => {
    try {
        const phone = req.params.phone;

        // Tìm ca khám hôm nay của bệnh nhân này
        const [myTicketRows] = await db.query(`
            SELECT h.Mahangdoi, h.Sothutu, h.Trangthai as queueStatus, h.Maphong,
                   l.Khunggio as appointmentTime, l.Maqr as qrToken,
                   c.Tenchuyenkhoa as department, p.Sophong as room, doc_n.Hoten as doctorName
            FROM hangdoi h
            JOIN lichhenkham l ON h.Malichhen = l.Malichhen
            JOIN nguoidung n ON l.Mabenhnhan = n.Manguoidung
            JOIN bacsi b ON l.Mabacsi = b.Mabacsi
            JOIN nguoidung doc_n ON b.Manguoidung = doc_n.Manguoidung
            LEFT JOIN chuyenkhoa c ON b.Machuyenkhoa = c.Machuyenkhoa
            LEFT JOIN phongkham p ON p.Machuyenkhoa = c.Machuyenkhoa
            WHERE n.Sodienthoai = ? AND l.Ngaykham = CURDATE()
            ORDER BY h.Mahangdoi DESC
            LIMIT 1
        `, [phone]);

        if (myTicketRows.length === 0) {
            return res.json({ hasTicket: false, message: "Hôm nay bạn chưa có lượt xếp hàng nào." });
        }

        const myTicket = myTicketRows[0];

        // Lấy số hiện tại đang được khám ở phòng đó
        const [currentServingRows] = await db.query(`
            SELECT Sothutu FROM hangdoi 
            WHERE Maphong = ? AND Trangthai = 'DANGKHAM'
            LIMIT 1
        `, [myTicket.Maphong]);

        const currentServing = currentServingRows.length > 0 ? `TMH-0${currentServingRows[0].Sothutu}` : "Đang trống";

        // Đếm số người đứng trước trong hàng đợi
        const [[{ peopleAhead }]] = await db.query(`
            SELECT COUNT(*) as peopleAhead FROM hangdoi 
            WHERE Maphong = ? AND Trangthai = 'DANGCHO' AND Sothutu < ?
        `, [myTicket.Maphong, myTicket.Sothutu]);

        res.json({
            hasTicket: true,
            myTicketNumber: `TMH-0${myTicket.Sothutu}`,
            queueStatus: myTicket.queueStatus, // DANGCHO, DANGKHAM, HOANTHANH, BOLUOT
            department: myTicket.department,
            room: myTicket.room ? `Phòng ${myTicket.room}` : "Phòng 204",
            doctorName: myTicket.doctorName,
            currentServingNumber: currentServing,
            peopleAhead: Math.max(0, peopleAhead),
            estimatedWaitMinutes: Math.max(0, peopleAhead * 12)
        });
    } catch (err) {
        console.error("Lỗi theo dõi hàng đợi:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🏥 Hospital Management System - LIVE WITH MYSQL`);
    console.log(`👨‍⚕️ Bác sĩ:    http://localhost:${PORT}/`);
    console.log(`👩‍💼 Tiếp tân:  http://localhost:${PORT}/reception.html`);
    console.log(`📱 Android API: http://localhost:${PORT}/api/patient/...`);
    console.log(`====================================================`);
});
