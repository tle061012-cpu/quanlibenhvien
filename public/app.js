// State ứng dụng
let currentPatient = null;
let currentTab = 'history';

// Khởi chạy khi tài liệu HTML sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabEvents();
    loadDoctorProfile();
    loadDashboardData();

    // Tự động làm mới dữ liệu sau mỗi 5 giây (giả lập real-time)
    setInterval(() => {
        loadDashboardData(false);
    }, 5000);
});

// Đồng hồ thời gian thực
function initClock() {
    const clockEl = document.getElementById('realtime-clock');
    const updateTime = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('vi-VN');
    };
    updateTime();
    setInterval(updateTime, 1000);
}

// Bắt sự kiện chuyển Tab
function initTabEvents() {
    const btnHistory = document.getElementById('tab-btn-history');
    const btnOcr = document.getElementById('tab-btn-ocr');
    const contentHistory = document.getElementById('tab-content-history');
    const contentOcr = document.getElementById('tab-content-ocr');

    btnHistory.addEventListener('click', () => {
        currentTab = 'history';
        btnHistory.className = "pb-3 text-sm font-bold text-teal-700 border-b-2 border-teal-600 flex items-center";
        btnOcr.className = "pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center";
        contentHistory.classList.remove('hidden');
        contentOcr.classList.add('hidden');
    });

    btnOcr.addEventListener('click', () => {
        currentTab = 'ocr';
        btnOcr.className = "pb-3 text-sm font-bold text-teal-700 border-b-2 border-teal-600 flex items-center";
        btnHistory.className = "pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center";
        contentOcr.classList.remove('hidden');
        contentHistory.classList.add('hidden');
    });
}

// 1. Tải thông tin Bác sĩ
async function loadDoctorProfile() {
    try {
        const res = await fetch('/api/doctor/profile');
        const data = await res.json();

        document.getElementById('doctor-name').textContent = data.name;
        document.getElementById('doctor-dept-room').textContent = `${data.department} • ${data.room}`;
        if (data.avatar) document.getElementById('doctor-avatar').src = data.avatar;

        updateStatusUI(data.status);
    } catch (err) {
        console.error("Lỗi khi tải thông tin bác sĩ:", err);
    }
}

// Cập nhật giao diện trạng thái phòng khám
function updateStatusUI(status) {
    const btn = document.getElementById('btn-toggle-status');
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    if (status === 'READY') {
        btn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition";
        dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";
        text.textContent = "Sẵn sàng đón bệnh";
    } else {
        btn.className = "flex items-center space-x-2 px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition";
        dot.className = "w-2.5 h-2.5 rounded-full bg-amber-500";
        text.textContent = "Tạm nghỉ nhận";
    }
}

// Bật/tắt trạng thái phòng khám
async function toggleDoctorStatus() {
    try {
        const res = await fetch('/api/doctor/toggle-status', { method: 'POST' });
        const data = await res.json();
        updateStatusUI(data.status);
        showToast(data.message);
    } catch (err) {
        showToast("Không thể đổi trạng thái", true);
    }
}

// 2. Tải dữ liệu Dashboard & Hàng đợi
async function loadDashboardData(showLoadingToast = false) {
    try {
        // Tải Stats
        const resStats = await fetch('/api/doctor/dashboard-stats');
        const stats = await resStats.json();

        document.getElementById('stat-total').textContent = stats.totalToday;
        document.getElementById('stat-waiting').textContent = stats.waitingCount;
        document.getElementById('stat-completed').textContent = stats.doneCount;
        document.getElementById('stat-skipped').textContent = stats.skippedCount;

        // Tải Queue
        const resQueue = await fetch('/api/doctor/queue');
        const queueData = await resQueue.json();

        renderCurrentPatient(queueData.inConsult);
        renderWaitingQueue(queueData.waiting);

        if (showLoadingToast) showToast("Đã đồng bộ dữ liệu mới nhất!");
    } catch (err) {
        console.error("Lỗi khi tải dữ liệu hàng đợi:", err);
    }
}

// 3. Hiển thị Bệnh nhân đang khám
function renderCurrentPatient(patient) {
    currentPatient = patient;
    const body = document.getElementById('current-patient-body');
    const actions = document.getElementById('current-actions-container');
    const ticketNo = document.getElementById('current-ticket-no');
    const nameEl = document.getElementById('current-patient-name');
    const metaEl = document.getElementById('current-patient-meta');
    const reasonEl = document.getElementById('current-patient-reason');
    const checkinTimeEl = document.getElementById('current-patient-checkin-time');
    const historyList = document.getElementById('history-list');
    const ocrList = document.getElementById('ocr-list');

    if (!patient) {
        ticketNo.textContent = "---";
        nameEl.textContent = "Chưa có bệnh nhân nào trong phòng";
        metaEl.textContent = "Bấm 'GỌI BỆNH NHÂN TIẾP THEO' bên dưới để bắt đầu lượt khám.";
        reasonEl.textContent = "Chưa có dữ liệu triệu chứng.";
        checkinTimeEl.textContent = "";
        actions.style.display = 'none';
        historyList.innerHTML = `<p class="text-xs text-slate-400 italic">Không có dữ liệu.</p>`;
        ocrList.innerHTML = `<p class="text-xs text-slate-400 italic">Không có dữ liệu.</p>`;
        return;
    }

    actions.style.display = 'flex';
    ticketNo.textContent = patient.ticketNumber;
    nameEl.textContent = patient.patientName;
    metaEl.textContent = `${patient.gender} • ${patient.age} tuổi • SĐT: ${patient.phone} • Giờ hẹn: ${patient.appointmentTime}`;
    reasonEl.textContent = patient.reason || "Bệnh nhân không ghi chú triệu chứng cụ thể.";
    checkinTimeEl.textContent = `Check-in lúc: ${patient.checkinTime}`;

    // Render Lịch sử khám cũ
    if (patient.history && patient.history.length > 0) {
        historyList.innerHTML = patient.history.map(item => `
            <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                <div>
                    <span class="font-bold text-slate-700">${item.diagnosis}</span>
                    <p class="text-slate-400 mt-0.5">Bác sĩ khám: ${item.doctor}</p>
                </div>
                <span class="px-2 py-1 rounded bg-white border border-slate-200 text-slate-500 font-semibold">${item.date}</span>
            </div>
        `).join('');
    } else {
        historyList.innerHTML = `<p class="text-xs text-slate-400 italic">Bệnh nhân chưa có lịch sử khám trước đây tại hệ thống.</p>`;
    }

    // Render Tài liệu OCR
    if (patient.ocrDocs && patient.ocrDocs.length > 0) {
        ocrList.innerHTML = patient.ocrDocs.map(doc => `
            <div class="p-3.5 rounded-xl border border-teal-100 bg-teal-50/50 flex flex-col sm:flex-row gap-3 items-start">
                <img src="${doc.previewUrl}" alt="OCR" class="w-20 h-20 rounded-lg object-cover border border-teal-200 shadow-sm">
                <div class="flex-1 text-xs">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-teal-800 text-sm">${doc.title}</span>
                        <span class="text-teal-600 font-medium">Scan: ${doc.scannedDate}</span>
                    </div>
                    <div class="mt-2 space-y-1 bg-white p-2 rounded-lg border border-teal-100 text-slate-700">
                        ${Object.entries(doc.extractedFields || {}).map(([k, v]) => `
                            <p><strong>${k}:</strong> ${v}</p>
                        `).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        ocrList.innerHTML = `<p class="text-xs text-slate-400 italic">Chưa có tài liệu đơn thuốc/xét nghiệm cũ được số hóa qua OCR.</p>`;
    }
}

// 4. Hiển thị Danh sách chờ khám (Smart Queue)
function renderWaitingQueue(waitingList) {
    const container = document.getElementById('waiting-queue-container');
    const badgeCount = document.getElementById('badge-queue-count');

    badgeCount.textContent = `${waitingList.length} người`;

    if (!waitingList || waitingList.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-slate-400 text-xs">
                <i class="fa-solid fa-mug-hot text-2xl mb-2 text-slate-300"></i>
                <p>Hàng đợi trống! Không còn bệnh nhân nào đang chờ.</p>
            </div>
        `;
        return;
    }

    const AVG_MINUTES_PER_PATIENT = 12;

    container.innerHTML = waitingList.map((item, index) => {
        const estimatedWait = index * AVG_MINUTES_PER_PATIENT;
        return `
            <div class="py-3 px-2 flex items-center justify-between hover:bg-slate-50 rounded-xl transition">
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center font-bold text-slate-700 text-xs shadow-sm">
                        <span class="text-[10px] text-slate-400 font-normal">STT</span>
                        ${item.ticketNumber.replace('TMH-', '')}
                    </div>
                    <div>
                        <h4 class="text-sm font-bold text-slate-800">${item.patientName}</h4>
                        <div class="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                            <span><i class="fa-regular fa-clock mr-1"></i>Hẹn: ${item.appointmentTime}</span>
                            <span>•</span>
                            <span class="text-amber-600 font-medium">Chờ ~${estimatedWait}p</span>
                        </div>
                    </div>
                </div>
                <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Đã Check-in
                </span>
            </div>
        `;
    }).join('');
}

// 5. Gọi Bệnh nhân tiếp theo
async function callNextPatient() {
    try {
        const res = await fetch('/api/doctor/call-next', { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message, true);
            return;
        }

        showToast(data.message);
        loadDashboardData();
    } catch (err) {
        showToast("Lỗi khi kết nối hệ thống gọi số!", true);
    }
}

// 6. Bỏ lượt bệnh nhân hiện tại
async function skipCurrentPatient() {
    if (!currentPatient) return;
    if (!confirm(`Bạn có chắc muốn bỏ lượt bệnh nhân ${currentPatient.patientName} (${currentPatient.ticketNumber}) không?`)) {
        return;
    }

    try {
        const res = await fetch('/api/doctor/skip-current', { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.message, true);
            return;
        }

        showToast(data.message);
        loadDashboardData();
    } catch (err) {
        showToast("Lỗi khi bỏ lượt bệnh nhân!", true);
    }
}

// 7. Modal Nhập kết quả khám
function openExamModal() {
    if (!currentPatient) {
        showToast("Hiện không có bệnh nhân nào trong phòng để nhập kết quả!", true);
        return;
    }
    document.getElementById('modal-diagnosis').value = '';
    document.getElementById('modal-treatment').value = '';
    document.getElementById('modal-notes').value = '';
    document.getElementById('exam-modal').classList.remove('hidden');
}

function closeExamModal() {
    document.getElementById('exam-modal').classList.add('hidden');
}

async function submitExamResult(e) {
    e.preventDefault();
    if (!currentPatient) return;

    const payload = {
        patientId: currentPatient.id,
        diagnosis: document.getElementById('modal-diagnosis').value,
        treatmentPlan: document.getElementById('modal-treatment').value,
        notes: document.getElementById('modal-notes').value
    };

    try {
        const res = await fetch('/api/doctor/complete-consultation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            showToast(data.message, true);
            return;
        }

        closeExamModal();
        showToast(data.message);
        loadDashboardData();
    } catch (err) {
        showToast("Lỗi khi lưu kết quả khám!", true);
    }
}

// Toast hiển thị thông báo
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
        iconEl.className = "fa-solid fa-circle-check text-teal-400";
    }

    setTimeout(() => {
        toast.className = "fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 flex items-center space-x-3 text-sm";
    }, 3500);
}

// Đăng xuất Bác sĩ
function logoutDoctor() {
    localStorage.removeItem('hospitalUser');
    window.location.href = '/login.html';
}
