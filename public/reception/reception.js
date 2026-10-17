/**
 * =====================================================================================
 * HỆ THỐNG QUẢN LÝ BỆNH VIỆN VÀ ĐẶT LỊCH KHÁM THÔNG MINH - ĐỒ ÁN CHUYÊN NGÀNH (NHÓM 12)
 * =====================================================================================
 * 
 * 📁 TÊN FILE: public/reception/reception.js
 * 🎯 MỤC ĐÍCH: Xử lý logic nghiệp vụ Quầy Tiếp tân và Kiosk Quét mã QR Check-in tự động.
 * 👥 VAI TRÒ HỖ TRỢ (ROLE): LỄ TÂN (Receptionist) / KIOSK CHECK-IN
 * 
 * 🔄 CÁC HOẠT ĐỘNG CHÍNH (KEY OPERATIONS):
 *    1. `loadReceptionData()`      : Đồng bộ danh sách lịch hẹn và tình trạng các phòng khám mỗi 4 giây.
 *    2. `doCheckinApi()`           : QUÉT MÃ QR CHECK-IN -> Đổi trạng thái lịch hẹn, cấp STT, đẩy vào Smart Queue.
 *    3. `handleWalkInSubmit()`     : Tiếp nhận bệnh nhân vãng lai không đặt hẹn -> Cấp số khám trực tiếp tại quầy.
 *    4. `renderClinicsMonitor()`   : Hiển thị thời gian thực bác sĩ nào đang khám ai, còn bao nhiêu người chờ.
 *    5. `showTicketModal()`        : Hiển thị Popup Phiếu chờ khám bệnh điện tử có hỗ trợ in (Print).
 * =====================================================================================
 */

// Biến lưu cache danh sách lịch hẹn để lọc tìm kiếm nhanh trên client
let appointmentsCache = [];

// Khởi tạo khi DOM đã nạp hoàn tất
document.addEventListener('DOMContentLoaded', () => {
    loadReceptionData();

    // Tự động làm mới dữ liệu sau mỗi 4 giây
    setInterval(() => {
        loadReceptionData(false);
    }, 4000);
});

/**
 * 👩‍💼 1. TẢI DỮ LIỆU TỔNG QUAN QUẦY TIẾP TÂN TỪ SERVER MYSQL
 */
async function loadReceptionData(showToastMsg = false) {
    try {
        // Tải tổng quan sảnh & trạng thái các phòng khám
        const resOverview = await fetch('/api/reception/overview');
        const overview = await resOverview.json();

        document.getElementById('stat-total-apt').textContent = overview.totalAppointments;
        document.getElementById('stat-checked-in').textContent = overview.checkedInCount;
        document.getElementById('stat-pending').textContent = overview.pendingCheckinCount;

        renderClinicsMonitor(overview.clinics);

        // Tải danh sách lịch hẹn hôm nay
        const resApt = await fetch('/api/reception/appointments');
        appointmentsCache = await resApt.json();
        renderAppointmentsTable(appointmentsCache);

        if (showToastMsg) showToast("Đã đồng bộ dữ liệu tiếp nhận!");
    } catch (err) {
        console.error("Lỗi khi tải dữ liệu tiếp tân:", err);
    }
}

/**
 * 📋 2. HIỂN THỊ BẢNG DANH SÁCH LỊCH HẸN ĐẶT TRƯỚC
 */
function renderAppointmentsTable(list) {
    const tbody = document.getElementById('appointment-table-body');
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Không có lịch hẹn nào.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(apt => {
        const isCheckedIn = apt.status === 'CHECKED_IN';
        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="py-3 px-4 font-bold text-slate-800">${apt.appointmentTime}</td>
                <td class="py-3 px-4">
                    <span class="font-bold text-slate-800">${apt.patientName}</span>
                    <span class="text-slate-400 ml-1">(${apt.gender}, ${apt.age}t)</span>
                    <p class="text-[11px] text-slate-400 mt-0.5">SĐT: ${apt.phone}</p>
                </td>
                <td class="py-3 px-4">
                    <span class="font-medium text-slate-700">${apt.department}</span>
                    <p class="text-[11px] text-indigo-600 font-semibold">${apt.room}</p>
                </td>
                <td class="py-3 px-4">
                    <span class="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[11px] font-bold">
                        ${apt.qrToken}
                    </span>
                </td>
                <td class="py-3 px-4">
                    ${isCheckedIn 
                        ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                             <i class="fa-solid fa-check mr-1"></i> Đã vào hàng đợi
                           </span>`
                        : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                             <i class="fa-regular fa-clock mr-1"></i> Chờ đến
                           </span>`
                    }
                </td>
                <td class="py-3 px-4 text-right">
                    ${isCheckedIn 
                        ? `<button disabled class="px-3 py-1 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">Đã cấp số</button>`
                        : `<button onclick="handleCheckinFromTable(${apt.id})" class="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 transition">
                             Check-in
                           </button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 🔍 Lọc danh sách lịch hẹn theo ô tìm kiếm (Tên, SĐT, Mã QR)
 */
function filterAppointments() {
    const q = document.getElementById('search-apt').value.toLowerCase().trim();
    if (!q) {
        renderAppointmentsTable(appointmentsCache);
        return;
    }
    const filtered = appointmentsCache.filter(a => 
        a.patientName.toLowerCase().includes(q) || a.phone.includes(q) || a.qrToken.toLowerCase().includes(q)
    );
    renderAppointmentsTable(filtered);
}

/**
 * 🏥 3. HIỂN THỊ GIÁM SÁT CÁC PHÒNG KHÁM TOÀN VIỆN (CLINICS MONITOR)
 */
function renderClinicsMonitor(clinics) {
    const container = document.getElementById('clinics-monitor-list');
    if (!clinics || clinics.length === 0) return;

    container.innerHTML = clinics.map(c => `
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5 text-xs">
            <div class="flex justify-between items-center">
                <span class="font-bold text-slate-800">${c.name}</span>
                <span class="px-2 py-0.5 rounded font-bold ${c.status === 'READY' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                    ${c.room}
                </span>
            </div>
            <p class="text-slate-500">${c.doctor}</p>
            <div class="flex justify-between items-center pt-1 border-t border-slate-200 text-slate-600">
                <span>Đang khám: <strong class="text-teal-700">${c.currentPatient}</strong></span>
                <span>Chờ: <strong class="text-amber-600">${c.waitingCount} ca</strong></span>
            </div>
        </div>
    `).join('');
}

/**
 * Điền nhanh mã QR mẫu vào ô nhập liệu
 */
function quickFillToken(token) {
    document.getElementById('input-qr-token').value = token;
    handleManualCheckin(new Event('submit'));
}

/**
 * Xử lý nhập mã QR thủ công từ form
 */
async function handleManualCheckin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const token = document.getElementById('input-qr-token').value.trim();
    if (!token) {
        showToast("Vui lòng nhập mã QR!", true);
        return;
    }

    await doCheckinApi({ qrToken: token });
    document.getElementById('input-qr-token').value = '';
}

/**
 * Bấm nút Check-in trực tiếp trên hàng của bảng
 */
async function handleCheckinFromTable(aptId) {
    await doCheckinApi({ appointmentId: aptId });
}

/**
 * ⚡ 4. GỌI API CHECK-IN & ĐẨY VÀO HÀNG ĐỢI (CORE CHECK-IN LOGIC)
 */
async function doCheckinApi(payload) {
    try {
        const res = await fetch('/api/reception/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            showToast(data.message || "Lỗi khi check-in!", true);
            return;
        }

        showToast(data.message);
        showTicketModal(data.ticket);
        loadReceptionData();
    } catch (err) {
        showToast("Lỗi kết nối tới hệ thống tiếp nhận!", true);
    }
}

/**
 * 🎫 5. TIẾP NHẬN BỆNH NHÂN VÃNG LAI (CẤP SỐ TẠI QUẦY)
 */
async function handleWalkInSubmit(e) {
    e.preventDefault();
    const payload = {
        patientName: document.getElementById('walkin-name').value.trim(),
        phone: document.getElementById('walkin-phone').value.trim(),
        age: document.getElementById('walkin-age').value,
        gender: "Nam",
        department: document.getElementById('walkin-dept').value,
        reason: document.getElementById('walkin-reason').value.trim()
    };

    try {
        const res = await fetch('/api/reception/walk-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            showToast(data.message || "Lỗi khi cấp số!", true);
            return;
        }

        showToast(data.message);
        showTicketModal(data.ticket);
        document.getElementById('walkin-name').value = '';
        document.getElementById('walkin-phone').value = '';
        document.getElementById('walkin-reason').value = '';
        loadReceptionData();
    } catch (err) {
        showToast("Lỗi khi cấp số khám vãng lai!", true);
    }
}

/**
 * 🖨️ 6. HIỂN THỊ MODAL PHIẾU KHÁM BỆNH (TICKET MODAL)
 */
function showTicketModal(ticket) {
    document.getElementById('ticket-modal-no').textContent = ticket.ticketNumber;
    document.getElementById('ticket-modal-patient').textContent = ticket.patientName;
    document.getElementById('ticket-modal-dept').textContent = `${ticket.department} • ${ticket.room}`;
    document.getElementById('ticket-modal-doctor').textContent = ticket.doctor;
    document.getElementById('ticket-modal-time').textContent = ticket.checkinTime;
    document.getElementById('ticket-modal-ahead').textContent = `${ticket.peopleAhead} người`;
    document.getElementById('ticket-modal-wait').textContent = `~${ticket.estimatedWaitMinutes} phút`;

    document.getElementById('ticket-modal').classList.remove('hidden');
}

function closeTicketModal() {
    document.getElementById('ticket-modal').classList.add('hidden');
}

/**
 * 🔔 7. TOAST HIỂN THỊ THÔNG BÁO GÓC MÀN HÌNH
 */
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    const iconEl = document.getElementById('toast-icon');

    msgEl.textContent = message;
    if (isError) {
        toast.className = "fixed bottom-5 right-5 z-50 bg-rose-900 text-white px-5 py-3 rounded-xl shadow-lg transform translate-y-0 opacity-100 transition-all duration-300 flex items-center space-x-3 text-sm";
        iconEl.className = "fa-solid fa-circle-exclamation text-rose-300";
    } else {
        toast.className = "fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg transform translate-y-0 opacity-100 transition-all duration-300 flex items-center space-x-3 text-sm";
        iconEl.className = "fa-solid fa-circle-check text-emerald-400";
    }

    setTimeout(() => {
        toast.className = "fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 flex items-center space-x-3 text-sm";
    }, 3500);
}
