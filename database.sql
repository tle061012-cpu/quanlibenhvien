-- ==========================================================
-- CƠ SỞ DỮ LIỆU: quanlybenhvien (Hệ thống Quản lý Bệnh viện)
-- HỆ QUẢN TRỊ: MySQL / MariaDB (Dùng XAMPP / phpMyAdmin)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS quanlybenhvien
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE quanlybenhvien;

-- 1. BẢNG NGƯỜI DÙNG (Tài khoản & phân quyền)
CREATE TABLE IF NOT EXISTS Nguoidung (
    Manguoidung INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã định danh người dùng',
    Hoten VARCHAR(100) NOT NULL COMMENT 'Họ và tên',
    Email VARCHAR(100) UNIQUE COMMENT 'Địa chỉ email',
    Sodienthoai VARCHAR(20) UNIQUE NOT NULL COMMENT 'Số điện thoại đăng nhập',
    Matkhau VARCHAR(255) NOT NULL COMMENT 'Mật khẩu đã mã hóa hash',
    Vaitro ENUM('BENHNHAN', 'BACSI', 'TIEPTAN', 'QUANTRI') NOT NULL COMMENT 'Vai trò trong hệ thống',
    Anhdaidien VARCHAR(255) COMMENT 'Đường dẫn ảnh đại diện',
    Ngaytao TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Ngày tạo tài khoản'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bảng lưu tài khoản người dùng';

-- 2. BẢNG CHUYÊN KHOA
CREATE TABLE IF NOT EXISTS Chuyenkhoa (
    Machuyenkhoa INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã chuyên khoa',
    Tenchuyenkhoa VARCHAR(100) NOT NULL COMMENT 'Tên chuyên khoa',
    Mota TEXT COMMENT 'Mô tả chuyên khoa'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Danh mục chuyên khoa khám bệnh';

-- 3. BẢNG PHÒNG KHÁM
CREATE TABLE IF NOT EXISTS phongkham (
    Maphong INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã phòng khám',
    Sophong VARCHAR(20) NOT NULL COMMENT 'Số phòng',
    Machuyenkhoa INT COMMENT 'Mã chuyên khoa trực thuộc',
    FOREIGN KEY (Machuyenkhoa) REFERENCES Chuyenkhoa(Machuyenkhoa) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Danh sách phòng khám bệnh';

-- 4. BẢNG BÁC SĨ (Thông tin chi tiết)
CREATE TABLE IF NOT EXISTS Bacsi (
    Mabacsi INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã bác sĩ',
    Manguoidung INT UNIQUE NOT NULL COMMENT 'Liên kết tài khoản người dùng',
    Machuyenkhoa INT COMMENT 'Chuyên khoa công tác',
    Trinhdo VARCHAR(100) COMMENT 'Học hàm/Học vị (ThS, BS CKI, PGS...)',
    FOREIGN KEY (Manguoidung) REFERENCES Nguoidung(Manguoidung) ON DELETE CASCADE,
    FOREIGN KEY (Machuyenkhoa) REFERENCES Chuyenkhoa(Machuyenkhoa) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hồ sơ chi tiết của bác sĩ';

-- 5. BẢNG LỊCH LÀM VIỆC CỦA BÁC SĨ
CREATE TABLE IF NOT EXISTS Lichlamviec (
    Malich INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã ca làm việc',
    Mabacsi INT NOT NULL COMMENT 'Bác sĩ trực',
    Maphong INT NOT NULL COMMENT 'Phòng khám trực',
    Ngaylamviec DATE NOT NULL COMMENT 'Ngày làm việc',
    Cakham ENUM('SANG', 'CHIEU') NOT NULL COMMENT 'Ca sáng hoặc ca chiều',
    FOREIGN KEY (Mabacsi) REFERENCES Bacsi(Mabacsi) ON DELETE CASCADE,
    FOREIGN KEY (Maphong) REFERENCES phongkham(Maphong) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Lịch phân công trực phòng khám';

-- 6. BẢNG LỊCH HẸN KHÁM CỦA BỆNH NHÂN (Có Mã QR)
CREATE TABLE IF NOT EXISTS Lichhenkham (
    Malichhen INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã lịch hẹn khám',
    Mabenhnhan INT NOT NULL COMMENT 'Mã bệnh nhân',
    Mabacsi INT NOT NULL COMMENT 'Mã bác sĩ tiếp nhận khám',
    Ngaykham DATE NOT NULL COMMENT 'Ngày hẹn khám',
    Khunggio VARCHAR(20) NOT NULL COMMENT 'Giờ hẹn',
    Maqr VARCHAR(255) UNIQUE COMMENT 'Chuỗi mã QR để check-in tại viện',
    Trangthai ENUM('CHOXACNHAN', 'DAXACNHAN', 'DACHECKIN', 'HOANTHANH', 'DAHUY') DEFAULT 'CHOXACNHAN' COMMENT 'Trạng thái lịch hẹn',
    Ngaydat TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm bệnh nhân đặt lịch',
    FOREIGN KEY (Mabenhnhan) REFERENCES Nguoidung(Manguoidung) ON DELETE CASCADE,
    FOREIGN KEY (Mabacsi) REFERENCES Bacsi(Mabacsi) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Danh sách lịch hẹn khám của bệnh nhân';

-- 7. BẢNG HÀNG ĐỢI KHÁM (Smart Queue)
CREATE TABLE IF NOT EXISTS hangdoi (
    Mahangdoi INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã thứ tự hàng đợi',
    Malichhen INT UNIQUE NOT NULL COMMENT 'Liên kết lịch hẹn đã check-in',
    Maphong INT NOT NULL COMMENT 'Phòng khám đang chờ',
    Sothutu INT NOT NULL COMMENT 'Số thứ tự khám (Số phiếu: 1, 2, 3...)',
    Trangthai ENUM('DANGCHO', 'DANGGOI', 'DANGKHAM', 'HOANTHANH', 'BOLUOT') DEFAULT 'DANGCHO' COMMENT 'Trạng thái lượt khám',
    Thoigiantao TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian cấp số',
    FOREIGN KEY (Malichhen) REFERENCES Lichhenkham(Malichhen) ON DELETE CASCADE,
    FOREIGN KEY (Maphong) REFERENCES phongkham(Maphong) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hàng đợi lượt khám tại từng phòng';

-- 8. BẢNG KẾT QUẢ KHÁM BỆNH (Bác sĩ chẩn đoán)
CREATE TABLE IF NOT EXISTS Ketquakham (
    Maketqua INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã kết quả khám',
    Malichhen INT UNIQUE NOT NULL COMMENT 'Thuộc lượt khám nào',
    Mabacsi INT NOT NULL COMMENT 'Bác sĩ thực hiện khám',
    Chandoan TEXT NOT NULL COMMENT 'Chẩn đoán bệnh',
    Phuongandieutri TEXT COMMENT 'Lời dặn / hướng điều trị / đơn thuốc',
    Ghichu TEXT COMMENT 'Ghi chú thêm',
    Ngaykhamxong TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian hoàn thành khám',
    FOREIGN KEY (Malichhen) REFERENCES Lichhenkham(Malichhen) ON DELETE CASCADE,
    FOREIGN KEY (Mabacsi) REFERENCES Bacsi(Mabacsi) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kết quả chẩn đoán sau khi khám xong';

-- 9. BẢNG TÀI LIỆU OCR (Đơn thuốc/xét nghiệm cũ được số hóa)
CREATE TABLE IF NOT EXISTS Tailieuocr (
    Matailieu INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Mã tài liệu OCR',
    Mabenhnhan INT NOT NULL COMMENT 'Tài liệu của bệnh nhân nào',
    Duongdananh VARCHAR(255) NOT NULL COMMENT 'Đường dẫn file ảnh bệnh án/đơn thuốc',
    Noidungocr TEXT COMMENT 'Chữ trích xuất từ OCR',
    Ngaytailen TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian tải lên',
    FOREIGN KEY (Mabenhnhan) REFERENCES Nguoidung(Manguoidung) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tài liệu y bạ cũ được quét bằng OCR';

-- ==========================================================
-- DỮ LIỆU MẪU ĐỂ CHẠY NGAY (SEED DATA)
-- ==========================================================

-- Chuyên khoa
INSERT INTO Chuyenkhoa (Machuyenkhoa, Tenchuyenkhoa, Mota) VALUES
(1, 'Khoa Tai Mũi Họng', 'Khám và điều trị các bệnh lý vùng tai, mũi, họng và thanh quản'),
(2, 'Khoa Răng Hàm Mặt', 'Khám, điều trị nha khoa và phẫu thuật hàm mặt'),
(3, 'Khoa Nội Tổng Quát', 'Khám và điều trị nội khoa tổng quát');

-- Phòng khám
INSERT INTO phongkham (Maphong, Sophong, Machuyenkhoa) VALUES
(1, 'Phòng 204', 1),
(2, 'Phòng 105', 2),
(3, 'Phòng 102', 3);

-- Người dùng (Tài khoản mẫu)
INSERT INTO Nguoidung (Manguoidung, Hoten, Email, Sodienthoai, Matkhau, Vaitro) VALUES
(1, 'BS. CKII Lê Hoàng Minh', 'minh.le@hospital.vn', '0901000001', '123456', 'BACSI'),
(2, 'Nguyễn Văn Hùng', 'hung.nguyen@gmail.com', '0912345678', '123456', 'BENHNHAN'),
(3, 'Trần Thị Mai Phương', 'phuong.tran@gmail.com', '0987654321', '123456', 'BENHNHAN'),
(4, 'Lễ tân Hoàng Yến', 'yen.reception@hospital.vn', '0902000002', '123456', 'TIEPTAN');

-- Bác sĩ
INSERT INTO Bacsi (Mabacsi, Manguoidung, Machuyenkhoa, Trinhdo) VALUES
(1, 1, 1, 'BS. CKII');

-- Lịch hẹn mẫu
INSERT INTO Lichhenkham (Malichhen, Mabenhnhan, Mabacsi, Ngaykham, Khunggio, Maqr, Trangthai) VALUES
(1, 2, 1, CURDATE(), '08:30', 'QR-MED-201', 'DACHECKIN'),
(2, 3, 1, CURDATE(), '08:45', 'QR-MED-202', 'DAXACNHAN');

-- Hàng đợi mẫu
INSERT INTO hangdoi (Mahangdoi, Malichhen, Maphong, Sothutu, Trangthai) VALUES
(1, 1, 1, 12, 'DANGKHAM');
