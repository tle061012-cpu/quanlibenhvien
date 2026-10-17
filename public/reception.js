let appointmentsCache = [];

document.addEventListener('DOMContentLoaded', () => {
    loadReceptionData();

    // Tự động làm mới mỗi 4 giây
    setInterval(() => {
        loadReceptionData(false);
    }, 4000);
});

// 1. Tải dữ liệu quầy tiếp tân
async function loadReceptionData(showToastMsg = false) {
    try {
        // Tải tổng quan sảnh & phòng khám
        const resOverview = await fetch('/api/reception/overview');
        const overview = await resOverview.json();

        document.getElementById('stat-total-apt').textContent = overview.totalAppointments;
        document.getElementById('stat-checked-in').textContent = overview.checkedInCount;
        document.getElementById('stat-pending').textContent = overview.pendingCheckinCount;

        renderClinicsMonitor(overview.clinics);

        // Tải danh sách lịch hẹn
        const resApt = await fetch('/api/reception/appointments');
        appointmentsCache = await resApt.json();
        renderAppointmentsTable(appointmentsCache);

        if (showToastMsg) showToast("Đã đồng bộ dữ liệu tiếp nhận!");
    } catch (err) {
        console.error("Lỗi khi tải dữ liệu tiếp tân:", err);
    }
}

// 2. Hiển thị Bảng lịch hẹn đặt trước
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

// Lọc lịch hẹn theo ô tìm kiếm
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

// 3. Hiển thị Giám sát các phòng khám
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

// 4. Xử lý Quét mã QR thủ công hoặc bấm nút mẫu
function quickFillToken(token) {
    document.getElementById('input-qr-token').value = token;
    handleManualCheckin(new Event('submit'));
}

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

// Bấm nút "Check-in" trực tiếp trên bảng lịch hẹn
async function handleCheckinFromTable(aptId) {
    await doCheckinApi({ appointmentId: aptId });
}

// Gọi API Check-in
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

// 5. Xử lý Cấp số cho Khách vãng lai
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

// 6. Hiển thị Popup Phiếu khám (Ticket)
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

// 7. Toast thông báo
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
