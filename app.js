console.log('RICHCARS App Version: v1 - Build ' + new Date().toISOString());
/* ==========================================================================
   RICHCARS - Core Logic & Data Management (Interactive Calendar Version)
   ========================================================================== */

// --- SEED MOCK DATA & GOOGLE INTEGRATION CONFIG ---
const SECRET_KEY = 'rc-hr-8f3a9c2e1b7d4f6a0e5c8b2d9f1a3e7c';
const GOOGLE_CLIENT_ID = '392272628661-jgt4jlgc7abvajk3e4983vpljuvv8nlt.apps.googleusercontent.com';
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1fkWEILHaTxSJ3qpyGMPW4ot69sLGLEyRvcINxz5HG0Y/edit';
// Deployed Google Apps Script Web App URL
let GOOGLE_WEB_APP_URL = localStorage.getItem('richcars_apps_script_url') || 'https://script.google.com/macros/s/AKfycbyLgvgOyrwRFutpurxnx4-_j_XaHjbZP6Vd4S_f_TAfwDUWmD38c0h4yLHjc7oTxuWIqQ/exec';
localStorage.setItem('richcars_apps_script_url', GOOGLE_WEB_APP_URL);

function escapeHtml(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SEED_USERS = [
  { id: 'admin', name: 'RICHCARS Admin', role: 'manager', avatar: '👨‍💼', dept: 'ฝ่ายบริหาร / HR', email: 'admin@richcars.com', phone: '081-234-5001', empType: 'office' }
];

const getTodayStr = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const SEED_ATTENDANCE = [];

const SEED_LEAVE_REQUESTS = [];

const SEED_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    title: '🎉 ยินดีต้อนรับสู่ระบบ RICHCARS HR Management System',
    desc: 'ระบบบริหารจัดการพนักงาน บันทึกเวลาเข้า-ออกงานด้วยพิกัด GPS และยื่นใบลาออนไลน์อย่างเป็นทางการ',
    date: 'วันนี้',
    iconClass: 'icon-rose'
  }
];

const SEED_TASKS = [];

// --- APP STATE ---
const KEYS = {
  USERS: 'richcars_users_v2',
  TASKS: 'richcars_tasks_v2',
  ATTENDANCE: 'richcars_attendance_v2',
  LEAVES: 'richcars_leaves_v2',
  ANNOUNCEMENTS: 'richcars_announcements_v2',
  ACTIVE_USER: 'richcars_active_user_v2',
  ACTIVE_TAB: 'richcars_active_tab_v2',
  AUTH_SESSION: 'richcars_auth_session_v2'
};

class AppState {
  constructor() {
    this.users = this.load(KEYS.USERS, SEED_USERS);
    this.tasks = this.load(KEYS.TASKS, SEED_TASKS);
    this.attendance = this.load(KEYS.ATTENDANCE, SEED_ATTENDANCE);
    this.leaveRequests = this.load(KEYS.LEAVES, SEED_LEAVE_REQUESTS);
    this.announcements = this.load(KEYS.ANNOUNCEMENTS, SEED_ANNOUNCEMENTS);
    this.activeUserId = this.load(KEYS.ACTIVE_USER, 'admin');
    this.activeTab = this.load(KEYS.ACTIVE_TAB, 'dashboard');
    this.authSession = this.load(KEYS.AUTH_SESSION, null);
  }

  load(key, fallback) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }

  saveToLocalStorage() {
    localStorage.setItem(KEYS.USERS, JSON.stringify(this.users));
    localStorage.setItem(KEYS.TASKS, JSON.stringify(this.tasks));
    localStorage.setItem(KEYS.ATTENDANCE, JSON.stringify(this.attendance));
    localStorage.setItem(KEYS.LEAVES, JSON.stringify(this.leaveRequests));
    localStorage.setItem(KEYS.ANNOUNCEMENTS, JSON.stringify(this.announcements));
    localStorage.setItem(KEYS.ACTIVE_USER, JSON.stringify(this.activeUserId));
    localStorage.setItem(KEYS.ACTIVE_TAB, JSON.stringify(this.activeTab));
    localStorage.setItem(KEYS.AUTH_SESSION, JSON.stringify(this.authSession));
  }

  save(action = null, payload = null) {
    this.saveToLocalStorage();
    if (GOOGLE_WEB_APP_URL && action) {
      this.postToGoogleScript(action, payload);
    }
  }

  async postToGoogleScript(action, payload) {
    try {
      if (!GOOGLE_WEB_APP_URL) return;
      const requesterEmail = (this.authSession && this.authSession.email) ? this.authSession.email : null;
      await fetch(GOOGLE_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors', // Apps Script web app CORS mode
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: SECRET_KEY, action, payload, requesterEmail })
      });
    } catch (e) {
      console.warn('Google Sheets sync background status:', e);
    }
  }

  isLoggedIn() {
    return !!this.authSession && !!this.users.find(u => u.id === this.authSession.userId);
  }

  setAuthSession(user) {
    this.authSession = { userId: user.id, email: user.email, name: user.name, loggedInAt: new Date().toISOString() };
    this.activeUserId = user.id;
    this.save();
  }

  clearAuthSession() {
    this.authSession = null;
    this.save();
  }

  getActiveUser() {
    return this.users.find(u => u.id === this.activeUserId) || this.users[0];
  }

  getTodayRecord(userId) {
    const today = getTodayStr(0);
    return this.attendance.find(a => a.userId === userId && a.date === today);
  }

  getTodayApprovedLeave(userId) {
    const todayStr = getTodayStr(0);
    const todayTime = new Date(todayStr).getTime();
    return this.leaveRequests.find(l => {
      if (l.userId !== userId || l.status !== 'approved') return false;
      const start = l.startDate ? new Date(l.startDate).getTime() : 0;
      const end = l.endDate ? new Date(l.endDate).getTime() : 0;
      return start <= todayTime && todayTime <= end;
    });
  }

  clockIn(userId, dist, lat, lng, customNote = null) {
    const now = new Date();
    // Bug #5 Fix: Use manual format to avoid Thai numeral locales in Safari/iOS
    const _p = n => String(n).padStart(2, '0');
    const nowStr = `${_p(now.getHours())}:${_p(now.getMinutes())}:${_p(now.getSeconds())}`;
    let record = this.getTodayRecord(userId);
    
    const user = this.users.find(u => u.id === userId);
    const empType = user ? (user.empType || 'office') : 'office';
    
    // Auto-detect late (after 09:00) - Only for Office and WFH employees, exempt Part-Time
    const hours = now.getHours();
    const minutes = now.getMinutes();
    let note = customNote || 'มาทำงาน';

    if (empType !== 'parttime' && (hours > 9 || (hours === 9 && minutes > 0))) {
      const lateMinutes = (hours - 9) * 60 + minutes;
      note = `มาสาย ${lateMinutes} นาที` + (customNote ? ` (${customNote})` : '');
    } else if (empType === 'parttime') {
      note = customNote || '⏱️ พาร์ทไทม์ (รายชั่วโมง)';
    }

    if (dist !== undefined && dist !== null && empType === 'office') {
      note += ` (${dist}ม.)`;
    }
    
    if (!record) {
      record = {
        id: 'att_' + Date.now(),
        userId,
        date: getTodayStr(0),
        checkInTime: nowStr,
        checkOutTime: null,
        status: 'checked_in',
        note,
        lat,
        lng,
        dist
      };
      this.attendance.push(record);
    } else {
      record.checkInTime = nowStr;
      record.status = 'checked_in';
      record.note = note;
      if (lat) record.lat = lat;
      if (lng) record.lng = lng;
      if (dist !== undefined) record.dist = dist;
    }
    this.save('CLOCK_IN', record);
  }

  clockOut(userId, dist, lat, lng) {
    const record = this.getTodayRecord(userId);
    if (record) {
      // Bug #5 Fix: Use manual format to avoid Thai numeral locales in Safari/iOS
      const _nowO = new Date();
      const _pO = n => String(n).padStart(2, '0');
      record.checkOutTime = `${_pO(_nowO.getHours())}:${_pO(_nowO.getMinutes())}:${_pO(_nowO.getSeconds())}`;
      record.status = 'checked_out';
      if (lat) record.lat = lat;
      if (lng) record.lng = lng;
      if (dist !== undefined) record.dist = dist;
      this.save('CLOCK_OUT', record);
    }
  }

  addLeaveRequest(req) {
    req.id = 'lv_' + Date.now();
    req.status = 'pending';
    this.leaveRequests.unshift(req);
    this.save('ADD_LEAVE', req);
  }

  updateLeaveStatus(leaveId, newStatus) {
    const item = this.leaveRequests.find(l => l.id === leaveId);
    if (item) {
      item.status = newStatus;
      this.save('UPDATE_LEAVE_STATUS', { id: leaveId, status: newStatus });
    }
  }

  addTask(task) {
    task.id = 't_' + Date.now();
    task.progressPct = task.status === 'done' ? 100 : (task.status === 'in_progress' ? 50 : 0);
    this.tasks.push(task);
    this.save('ADD_TASK', task);
  }

  updateTaskStatus(taskId, newStatus) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      task.progressPct = newStatus === 'done' ? 100 : (newStatus === 'in_progress' ? 50 : 0);
      this.save('UPDATE_TASK_STATUS', { id: taskId, status: newStatus });
    }
  }

  deleteTask(taskId) {
    this.tasks = this.tasks.filter(t => t.id !== taskId);
    this.save('DELETE_TASK', { id: taskId });
  }

  addAnnouncement(ann) {
    ann.id = 'ann_' + Date.now();
    ann.date = new Date().toLocaleDateString('th-TH');
    ann.iconClass = 'icon-rose';
    this.announcements.unshift(ann);
    this.save('ADD_ANNOUNCEMENT', ann);
  }

  addEmployee(emp) {
    emp.id = 'emp_' + Date.now();
    emp.avatar = emp.role === 'manager' ? '👨‍💼' : '👨‍💻';
    if (!emp.startDate) emp.startDate = getTodayStr(0);
    this.users.push(emp);
    this.save('ADD_EMPLOYEE', emp);
  }

  deleteEmployee(userId) {
    this.users = this.users.filter(u => u.id !== userId);
    this.attendance = this.attendance.filter(a => a.userId !== userId);
    this.leaveRequests = this.leaveRequests.filter(l => l.userId !== userId);
    // Bug #6 Fix: Unassign tasks instead of deleting — preserves task history
    this.tasks = this.tasks.map(t => t.assigneeId === userId ? { ...t, assigneeId: null } : t);
    this.save('DELETE_EMPLOYEE', { id: userId });
  }

  syncAllToGoogleSheets() {
    const payload = {
      users: this.users,
      attendance: this.attendance,
      leaveRequests: this.leaveRequests,
      tasks: this.tasks,
      announcements: this.announcements
    };
    this.postToGoogleScript('SYNC_ALL', payload);
  }

  clearDemoData() {
    this.users = [
      { id: 'admin', name: 'RICHCARS Admin', role: 'manager', avatar: '👨‍💼', dept: 'ฝ่ายบริหาร / HR', email: 'admin@richcars.com', phone: '081-234-5001', empType: 'office' }
    ];
    this.attendance = [];
    this.leaveRequests = [];
    this.tasks = [];
    this.announcements = [
      {
        id: 'ann-1',
        title: '🎉 ยินดีต้อนรับสู่ระบบ RICHCARS HR Management System',
        desc: 'ระบบบริหารจัดการพนักงาน บันทึกเวลาเข้า-ออกงานด้วยพิกัด GPS และยื่นใบลาออนไลน์อย่างเป็นทางการ',
        date: 'วันนี้',
        iconClass: 'icon-rose'
      }
    ];
    this.activeUserId = 'admin';
    this.authSession = { userId: 'admin', email: 'admin@richcars.com', name: 'RICHCARS Admin', loggedInAt: new Date().toISOString() };
    this.save('SYNC_ALL', {
      users: this.users,
      attendance: this.attendance,
      leaveRequests: this.leaveRequests,
      tasks: this.tasks,
      announcements: this.announcements
    });
  }

  runAutoCutoffCheck() {
    const today = getTodayStr(0);
    let changed = false;

    // 1. Auto-close unclosed clock-ins from past days (Forgot to clock out)
    this.attendance.forEach(rec => {
      if (rec.date < today && rec.status === 'checked_in') {
        rec.status = 'checked_out';
        rec.checkOutTime = '18:00:00';
        if (!rec.note) rec.note = 'มาทำงาน';
        if (!rec.note.includes('ตัดรอบ')) {
          rec.note += ' ⚠️ (ลืมออกงาน - ตัดรอบ 18:00 น.)';
        }
        changed = true;
      }
    });

    // 2. Auto-detect past days with no attendance & no approved leave for members (Auto Absent)
    // Bug #3 Fix: Skip weekends (Saturday=6, Sunday=0) to avoid false absent records
    const members = this.users.filter(u => u.role === 'member');
    for (let i = 1; i <= 30; i++) {
      const pastDate = getTodayStr(-i);

      // Skip weekends — parse date parts manually to avoid UTC timezone offset issues
      const [py, pm, pd] = pastDate.split('-').map(Number);
      const dayOfWeek = new Date(py, pm - 1, pd).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // 0=Sunday, 6=Saturday

      members.forEach(u => {
        // ข้ามหากวันในอดีต (pastDate) เกิดก่อนวันที่พนักงานเข้าระบบ (startDate)
        if (u.startDate && pastDate < u.startDate) return;

        const hasAtt = this.attendance.some(a => a.userId === u.id && a.date === pastDate);
        const hasApprovedLeave = this.leaveRequests.some(l => {
          if (l.userId !== u.id || l.status !== 'approved') return false;
          const start = l.startDate ? new Date(l.startDate).getTime() : 0;
          const end = l.endDate ? new Date(l.endDate).getTime() : 0;
          const pTime = new Date(pastDate).getTime();
          return start <= pTime && pTime <= end;
        });

        if (!hasAtt && !hasApprovedLeave) {
          const autoRecord = {
            id: 'att_auto_absent_' + pastDate + '_' + u.id,
            userId: u.id,
            date: pastDate,
            checkInTime: null,
            checkOutTime: null,
            status: 'absent',
            note: '🔴 ขาดงาน (ตัดรอบอัตโนมัติ 23:59 น.)'
          };
          this.attendance.push(autoRecord);
          this.save('CLOCK_IN', autoRecord);
        }
      });
    }
  }
}

const state = new AppState();

// --- 1.1 FETCH ALL DATA FROM GOOGLE SHEETS ---
async function fetchAllFromGoogleSheet() {
  if (!GOOGLE_WEB_APP_URL) return false;
  try {
    const url = `${GOOGLE_WEB_APP_URL}?key=${SECRET_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json.success === true && json.data) {
      const normalizeDate = (dStr) => {
        if (!dStr) return dStr;
        if (typeof dStr === 'string' && dStr.includes('T')) {
          return dStr.split('T')[0];
        }
        return String(dStr).trim();
      };

      if (Array.isArray(json.data.users)) state.users = json.data.users;
      if (Array.isArray(json.data.attendance)) {
        state.attendance = json.data.attendance.map(a => ({
          ...a,
          date: normalizeDate(a.date)
        }));
      }
      if (Array.isArray(json.data.leaveRequests)) {
        state.leaveRequests = json.data.leaveRequests.map(l => ({
          ...l,
          startDate: normalizeDate(l.startDate),
          endDate: normalizeDate(l.endDate)
        }));
      }
      if (Array.isArray(json.data.tasks)) state.tasks = json.data.tasks;
      if (Array.isArray(json.data.announcements)) state.announcements = json.data.announcements;

      state.saveToLocalStorage();
      return true;
    } else {
      showToast('ไม่สามารถซิงค์ข้อมูลล่าสุดได้ กำลังแสดงข้อมูลที่บันทึกไว้ในเครื่อง', 'warning');
      return false;
    }
  } catch (e) {
    console.warn('Fetch from Google Sheet failed:', e);
    showToast('ไม่สามารถซิงค์ข้อมูลล่าสุดได้ กำลังแสดงข้อมูลที่บันทึกไว้ในเครื่อง', 'warning');
    return false;
  }
}

// 1.2 Full-screen loading overlay on app start (Runs before login and on login)
async function initAppWithLoading() {
  const overlay = document.getElementById('fullScreenLoadingOverlay');
  const btnGoogle = document.getElementById('btnGoogleSignIn');

  if (overlay) overlay.classList.remove('hidden');
  if (btnGoogle) {
    btnGoogle.disabled = true;
    btnGoogle.style.opacity = '0.6';
    btnGoogle.style.pointerEvents = 'none';
  }

  try {
    await fetchAllFromGoogleSheet();
  } catch (err) {
    console.error('Init fetch error:', err);
  } finally {
    if (overlay) overlay.classList.add('hidden');
    if (btnGoogle) {
      btnGoogle.disabled = false;
      btnGoogle.style.opacity = '';
      btnGoogle.style.pointerEvents = '';
    }
    renderApp();
  }
}

// 1.3 Visibility Change Listener (Tab focus sync)
let lastVisibilityFetchTime = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.isLoggedIn()) {
    const now = Date.now();
    if (now - lastVisibilityFetchTime >= 10000) { // 10s cooldown
      lastVisibilityFetchTime = now;
      await fetchAllFromGoogleSheet();
      renderApp();
    }
  }
});

// Calendar Navigation State
let calViewDate = new Date();

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// --- LIVE CLOCK ---
function initLiveClock() {
  function tick() {
    const now = new Date();
    const clockStr = now.toLocaleTimeString('th-TH', { hour12: false });
    const liveEl = document.getElementById('empLiveClock');
    if (liveEl) liveEl.textContent = clockStr;
  }
  tick();
  setInterval(tick, 1000);
}

function switchTab(tabId) {
  const user = state.getActiveUser();
  if (user && user.role !== 'manager' && (tabId === 'settings' || tabId === 'employees')) {
    tabId = 'dashboard';
  }

  state.activeTab = tabId;
  state.save();

  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.tab === tabId) item.classList.add('active');
    else item.classList.remove('active');
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === `tab-${tabId}`) content.classList.add('active');
    else content.classList.remove('active');
  });

  renderApp();
}

function renderApp() {
  const loginOverlay = document.getElementById('loginOverlayPage');
  const appLayout = document.getElementById('appLayout');

  if (!state.isLoggedIn()) {
    if (loginOverlay) loginOverlay.classList.remove('hidden');
    if (appLayout) appLayout.classList.add('hidden');
    updateTimeAwareLoginGlow();
    return;
  } else {
    if (loginOverlay) loginOverlay.classList.add('hidden');
    if (appLayout) appLayout.classList.remove('hidden');
  }

  state.runAutoCutoffCheck();
  const user = state.getActiveUser();

  // Header Pill
  document.getElementById('headerUserAvatar').textContent = user.avatar;
  document.getElementById('headerUserName').textContent = user.name;
  document.getElementById('headerUserRole').textContent = user.dept;

  const titleEl = document.getElementById('headerGreetingTitle');
  const subEl = document.getElementById('headerGreetingSub');

  const hour = new Date().getHours();
  let greetingText = 'สวัสดีตอนเช้า';
  if (hour >= 12 && hour < 17) greetingText = 'สวัสดีตอนบ่าย';
  else if (hour >= 17 || hour < 5) greetingText = 'สวัสดีตอนเย็น';

  if (user.role === 'manager') {
    titleEl.textContent = `${greetingText}, ${user.name} 👋`;
    subEl.textContent = `ยินดีต้อนรับเข้าสู่ระบบบริหารจัดการ`;
  } else {
    titleEl.textContent = `${greetingText} 👋 ${user.name}`;
    subEl.textContent = `${user.dept}`;
  }

  document.querySelectorAll('.mgr-only').forEach(el => {
    if (user.role === 'manager') el.style.display = '';
    else el.style.display = 'none';
  });

  const adminDash = document.getElementById('adminDashboardView');
  const empDash = document.getElementById('employeeDashboardView');

  if (user.role === 'manager') {
    adminDash.classList.remove('hidden');
    empDash.classList.add('hidden');
    renderAdminDashboard();
  } else {
    empDash.classList.remove('hidden');
    adminDash.classList.add('hidden');
    renderEmployeeDashboard();
  }

  renderEmployeesTab();
  renderAttendanceTab();
  renderKanbanBoard();
  renderLeaveTab();
  renderFullInteractiveCalendar();
  renderAnnouncementsTab();
  renderNotifications();
}

// --- ADMIN DASHBOARD ---
function renderAdminDashboard() {
  const members = state.users.filter(u => u.role === 'member');
  const total = members.length;

  let present = 0, late = 0, leave = 0, absent = 0;

  const tbody = document.getElementById('adminRecentAttendanceTbody');
  tbody.innerHTML = '';

  members.forEach(m => {
    const rec = state.getTodayRecord(m.id);
    let statusBadge = '<span class="badge-status badge-status-amber"><span class="dot dot-amber"></span> ยังไม่เข้างาน</span>';
    let checkIn = '--:--';
    let checkOut = '--:--';

    if (rec) {
      checkIn = rec.checkInTime ? rec.checkInTime.substring(0, 5) : '--:--';
      checkOut = rec.checkOutTime ? rec.checkOutTime.substring(0, 5) : '--:--';

      if (rec.status === 'checked_in' || rec.status === 'checked_out') {
        if (rec.note && rec.note.includes('สาย')) {
          late++;
          statusBadge = `<span class="badge-status badge-status-amber"><span class="dot dot-amber"></span> ${rec.note}</span>`;
        } else {
          present++;
          statusBadge = '<span class="badge-status badge-status-green"><span class="dot dot-green"></span> ตรงเวลา</span>';
        }
      } else if (rec.status === 'absent') {
        leave++;
        statusBadge = `<span class="badge-status badge-status-blue"><span class="dot dot-blue"></span> ${rec.note || 'ลาป่วย'}</span>`;
      }
    } else {
      absent++;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${m.avatar}</div>
          <span class="user-cell-name">${m.name}</span>
        </div>
      </td>
      <td><span style="color: var(--text-muted); font-size: 0.85rem;">${m.dept}</span></td>
      <td><strong>${checkIn}</strong></td>
      <td><strong>${checkOut}</strong></td>
      <td>${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  });

  const pct = (val) => total > 0 ? ((val / total) * 100).toFixed(2) + '%' : '0%';

  document.getElementById('kpiTotalEmp').textContent = total;
  document.getElementById('kpiPresentEmp').textContent = present;
  document.getElementById('kpiPresentPct').textContent = pct(present);
  document.getElementById('kpiLateEmp').textContent = late;
  document.getElementById('kpiLatePct').textContent = pct(late);
  document.getElementById('kpiLeaveEmp').textContent = leave;
  document.getElementById('kpiLeavePct').textContent = pct(leave);
  document.getElementById('kpiAbsentEmp').textContent = absent;
  document.getElementById('kpiAbsentPct').textContent = pct(absent);

  // Dynamic Charts
  renderDynamicLineChart();
  renderDynamicDonutChart(present, late, leave, absent, total);

  const pendingContainer = document.getElementById('adminPendingLeaveList');
  pendingContainer.innerHTML = '';

  const pendingLeaves = state.leaveRequests.filter(l => l.status === 'pending');

  if (pendingLeaves.length === 0) {
    pendingContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">ไม่มีรายการลางานที่รออนุมัติ</div>`;
  } else {
    pendingLeaves.forEach(l => {
      const user = state.users.find(u => u.id === l.userId) || { avatar: '👤' };
      const item = document.createElement('div');
      item.className = 'leave-pending-item';
      item.innerHTML = `
        <div class="leave-user-info">
          <div class="user-cell-avatar">${user.avatar}</div>
          <div class="leave-details">
            <strong>${l.userName}</strong>
            <span>${l.type} • ${l.dateRange}</span>
          </div>
        </div>
        <div class="leave-action-btns">
          <button class="btn-sm-green" onclick="approveLeave('${l.id}')">อนุมัติ</button>
          <button class="btn-sm-red" onclick="rejectLeave('${l.id}')">ปฏิเสธ</button>
        </div>
      `;
      pendingContainer.appendChild(item);
    });
  }
}

function approveLeave(leaveId) {
  if (confirm('คุณต้องการอนุมัติใบลานี้ใช่หรือไม่?')) {
    state.updateLeaveStatus(leaveId, 'approved');
    renderApp();
  }
}

function rejectLeave(leaveId) {
  if (confirm('คุณต้องการปฏิเสธใบลานี้ใช่หรือไม่?')) {
    state.updateLeaveStatus(leaveId, 'rejected');
    renderApp();
  }
}

// --- EMPLOYEE DASHBOARD ---
function renderEmployeeDashboard() {
  const activeUser = state.getActiveUser();
  const todayRec = state.attendance.find(a => a.userId === activeUser.id && a.date === getTodayStr(0));
  const todayLeave = state.getTodayApprovedLeave(activeUser.id);
  const rec = todayRec;

  // Dynamic Real-time Thai Date Display
  const now = new Date();
  const dateEl = document.getElementById('empTodayDateStr');
  if (dateEl) {
    const thaiDay = now.getDate();
    const thaiMonth = THAI_MONTHS[now.getMonth()];
    const thaiYear = now.getFullYear() + 543;
    dateEl.textContent = `วันนี้ ${thaiDay} ${thaiMonth} ${thaiYear}`;
  }

  const badgeEl = document.getElementById('empAttendanceBadge');
  const badgeText = document.getElementById('empAttendanceBadgeText');
  const btnIn = document.getElementById('btnEmpClockIn');
  const btnOut = document.getElementById('btnEmpClockOut');
  const inDisp = document.getElementById('empCheckInTimeDisplay');
  const outDisp = document.getElementById('empCheckOutTimeDisplay');

  // Bug #4 Fix: Properly reset both button states in every branch to avoid stale innerHTML
  // Default button labels (restored before each branch to prevent carry-over from previous renders)
  btnIn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> เข้างาน';
  btnOut.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i> ออกงาน';
  btnIn.disabled = false; btnIn.style.opacity = ''; btnIn.style.cursor = '';
  btnOut.disabled = false; btnOut.style.opacity = ''; btnOut.style.cursor = '';

  if (rec) {
    if (rec.status === 'checked_in') {
      badgeEl.style.background = 'var(--bg-green-light)';
      badgeEl.style.color = 'var(--color-green)';
      badgeText.textContent = 'เข้างานแล้ว';
      btnIn.classList.add('hidden');
      btnOut.classList.remove('hidden');
      inDisp.textContent = rec.checkInTime ? rec.checkInTime.substring(0, 5) + ' น.' : '--:--';
      outDisp.textContent = '--:--';
    } else {
      // Status: checked_out — hide Clock In, show Clock Out as completed indicator
      badgeEl.style.background = 'var(--bg-gray-light)';
      badgeEl.style.color = 'var(--text-muted)';
      badgeText.textContent = 'เสร็จสิ้นการทำงานวันนี้';
      btnIn.classList.add('hidden');
      btnOut.classList.remove('hidden');
      btnOut.disabled = true;
      btnOut.style.opacity = '0.55';
      btnOut.style.cursor = 'not-allowed';
      btnOut.innerHTML = '<i class="fa-solid fa-check-double"></i> เสร็จสิ้นการทำงานวันนี้แล้ว';
      inDisp.textContent = rec.checkInTime ? rec.checkInTime.substring(0, 5) + ' น.' : '--:--';
      outDisp.textContent = rec.checkOutTime ? rec.checkOutTime.substring(0, 5) + ' น.' : '--:--';
    }
  } else if (todayLeave) {
    // EMPLOYEE IS ON APPROVED LEAVE TODAY -> DISABLE CLOCK IN
    badgeEl.style.background = 'var(--bg-blue-light)';
    badgeEl.style.color = 'var(--color-blue)';
    badgeText.textContent = `🏖️ อยู่ระหว่าง${todayLeave.type} (อนุมัติแล้ว)`;
    btnIn.classList.remove('hidden');
    btnIn.disabled = true;
    btnIn.style.opacity = '0.65';
    btnIn.style.cursor = 'not-allowed';
    btnIn.innerHTML = `<i class="fa-solid fa-plane-arrival"></i> วันนี้อยู่ระหว่าง${todayLeave.type} (อนุมัติแล้ว)`;
    btnOut.classList.add('hidden');
    inDisp.textContent = '--:--';
    outDisp.textContent = '--:--';
  } else {
    badgeEl.style.background = 'var(--bg-amber-light)';
    badgeEl.style.color = 'var(--color-amber)';
    badgeText.textContent = 'ยังไม่ได้เข้างาน';
    btnIn.classList.remove('hidden');
    btnOut.classList.add('hidden');
    inDisp.textContent = '--:--';
    outDisp.textContent = '--:--';
  }

  const empTypeNotice = document.getElementById('empTypeGeofenceNotice');
  if (empTypeNotice) {
    const empType = activeUser.empType || 'office';
    if (empType === 'wfh') {
      empTypeNotice.className = 'badge-status badge-status-amber';
      empTypeNotice.innerHTML = '<i class="fa-solid fa-house-laptop"></i> 🏠 รูปแบบการทำงาน: WFH (ลงเวลาได้ทุกสถานที่)';
    } else if (empType === 'parttime') {
      empTypeNotice.className = 'badge-status badge-status-green';
      empTypeNotice.innerHTML = '<i class="fa-solid fa-user-clock"></i> ⏱️ รูปแบบการทำงาน: Part-Time (ชั่วโมงตามจริง)';
    } else {
      empTypeNotice.className = 'badge-status badge-status-blue';
      empTypeNotice.innerHTML = '<i class="fa-solid fa-shield-halved"></i> 🏢 รูปแบบการทำงาน: ประจำออฟฟิศ (รัศมี 200m)';
    }
  }

  const userAtts = state.attendance.filter(a => a.userId === activeUser.id);
  const presentDays = userAtts.filter(a => a.status === 'checked_in' || a.status === 'checked_out').length;
  const lateCount = userAtts.filter(a => a.note && a.note.includes('สาย')).length;

  document.getElementById('empSummaryPresent').innerHTML = `${presentDays} <small>วัน</small>`;
  document.getElementById('empSummaryLate').innerHTML = `${lateCount} <small>ครั้ง</small>`;

  // Dynamic leave count
  const userLeaves = state.leaveRequests.filter(l => l.userId === activeUser.id && l.status === 'approved');
  document.getElementById('empSummaryLeave').innerHTML = `${userLeaves.length} <small>ครั้ง</small>`;
  
  // Dynamic absent count
  const absentCount = userAtts.filter(a => a.status === 'absent').length;
  document.getElementById('empSummaryAbsent').innerHTML = `${absentCount} <small>ครั้ง</small>`;
  
  // Dynamic OT (hours worked over 8 per day)
  let totalOT = 0;
  userAtts.forEach(a => {
    if (a.checkInTime && a.checkOutTime) {
      const hrs = calculateWorkHours(a.checkInTime, a.checkOutTime);
      if (hrs > 8) totalOT += (hrs - 8);
    }
  });
  document.getElementById('empSummaryOT').innerHTML = `${Math.round(totalOT)} <small>ชั่วโมง</small>`;

  const todayTasks = state.tasks.filter(t => t.assigneeId === activeUser.id || activeUser.role === 'manager');
  const doneTasks = todayTasks.filter(t => t.status === 'done').length;
  const totalTasks = todayTasks.length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  document.getElementById('empTaskCountSummary').textContent = `${totalTasks} งาน`;
  document.getElementById('empTaskDoneSummary').textContent = `เสร็จสิ้น ${doneTasks} งาน (${pct}%)`;
  document.getElementById('empTaskProgressBar').style.width = `${pct}%`;

  const todayTaskListEl = document.getElementById('empTodayTasksList');
  todayTaskListEl.innerHTML = '';

  if (todayTasks.length === 0) {
    todayTaskListEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1rem;">ไม่มีงานประจำวันนี้</div>`;
  } else {
    todayTasks.forEach(t => {
      const card = document.createElement('div');
      card.className = 'today-task-card';
      card.innerHTML = `
        <div class="task-item-title">${escapeHtml(t.title)}</div>
        <div class="task-item-meta">
          <span>${escapeHtml(t.description || '')}</span>
          <span style="font-weight: 600; color: var(--primary-red);">${t.progressPct || 0}%</span>
        </div>
      `;
      todayTaskListEl.appendChild(card);
    });
  }

  const annContainer = document.getElementById('empAnnouncementsList');
  annContainer.innerHTML = '';

  state.announcements.slice(0, 2).forEach(ann => {
    const card = document.createElement('div');
    card.className = 'announcement-card-item';
    card.innerHTML = `
      <div class="announcement-title"><span>${ann.title}</span></div>
      <div class="announcement-desc">${escapeHtml(ann.desc)}</div>
    `;
    annContainer.appendChild(card);
  });

  const empTbody = document.getElementById('empRecentAttendanceTbody');
  empTbody.innerHTML = '';

  userAtts.slice(0, 4).forEach(a => {
    let badgeHtml = '<span class="badge-status badge-status-green">ตรงเวลา</span>';
    if (a.note && a.note.includes('สาย')) {
      badgeHtml = `<span class="badge-status badge-status-amber">${a.note}</span>`;
    } else if (a.status === 'absent') {
      badgeHtml = `<span class="badge-status badge-status-red">${a.note || 'ขาดงาน'}</span>`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${a.date}</strong></td>
      <td>${a.checkInTime ? a.checkInTime.substring(0, 5) : '--:--'}</td>
      <td>${a.checkOutTime ? a.checkOutTime.substring(0, 5) : '--:--'}</td>
      <td>${badgeHtml}</td>
    `;
    empTbody.appendChild(tr);
  });

  renderMiniCalendar();
}

function renderMiniCalendar() {
  const grid = document.getElementById('miniCalGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const today = new Date();
  const curMonth = today.getMonth();
  const curYear = today.getFullYear();
  const activeUser = state.getActiveUser();

  const firstDayOfWeek = new Date(curYear, curMonth, 1).getDay();
  const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();

  // Pad empty cells before day 1
  for (let i = 0; i < firstDayOfWeek; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'cal-day-cell empty-cell';
    grid.appendChild(emptyCell);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell';
    if (i === today.getDate()) cell.classList.add('active-day');

    const dateStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const attRec = state.attendance.find(a => a.date === dateStr && a.userId === activeUser.id);

    let dotColor = '';
    if (attRec) {
      if (attRec.note && attRec.note.includes('สาย')) dotColor = 'dot-amber';
      else if (attRec.status === 'absent') dotColor = 'dot-red';
      else dotColor = 'dot-green';
    }

    cell.innerHTML = `
      <span>${i}</span>
      ${dotColor ? `<span class="cal-dot-indicator ${dotColor}"></span>` : ''}
    `;
    cell.onclick = () => openDayDetailsModal(dateStr);
    grid.appendChild(cell);
  }
}

// ==========================================================================
// FULL INTERACTIVE CALENDAR TAB (#tab-calendar)
// ==========================================================================
function renderFullInteractiveCalendar() {
  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth(); // 0-11

  // Update Title (e.g. พฤษภาคม 2569 / 2026)
  const thaiYear = year + 543;
  const titleEl = document.getElementById('calCurrentMonthYearTitle');
  if (titleEl) titleEl.textContent = `${THAI_MONTHS[month]} ${thaiYear}`;

  const gridEl = document.getElementById('fullCalGrid');
  if (!gridEl) return;
  gridEl.innerHTML = '';

  // Calculate calendar grid days
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon...
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const showAttendance = document.getElementById('chkShowAttendance')?.checked ?? true;
  const showLeaves = document.getElementById('chkShowLeaves')?.checked ?? true;
  const showTasks = document.getElementById('chkShowTasks')?.checked ?? true;

  const todayStr = getTodayStr(0);

  // 1. Render Padded Days from Previous Month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const cell = document.createElement('div');
    cell.className = 'full-day-cell other-month';
    cell.innerHTML = `
      <div class="day-number-header">
        <span class="day-num">${dayNum}</span>
      </div>
    `;
    gridEl.appendChild(cell);
  }

  // 2. Render Active Month Days
  for (let day = 1; day <= daysInMonth; day++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const isToday = dateStr === todayStr;

    const cell = document.createElement('div');
    cell.className = `full-day-cell ${isToday ? 'today-cell' : ''}`;
    cell.onclick = () => openDayDetailsModal(dateStr);

    const allEvents = [];

    // Attendance events
    if (showAttendance) {
      const atts = state.attendance.filter(a => a.date === dateStr);
      const normalAtts = atts.filter(a => !(a.note && a.note.includes('สาย')));
      const lateAtts = atts.filter(a => a.note && a.note.includes('สาย'));

      if (normalAtts.length > 2) {
        allEvents.push(`<div class="event-chip chip-green">🟢 เข้างาน (${normalAtts.length} คน)</div>`);
      } else {
        normalAtts.forEach(a => {
          const u = state.users.find(usr => usr.id === a.userId) || { name: 'พนักงาน' };
          allEvents.push(`<div class="event-chip chip-green">${u.name.split(' ')[0]}: เข้างาน</div>`);
        });
      }

      if (lateAtts.length > 2) {
        allEvents.push(`<div class="event-chip chip-amber">🟡 สาย (${lateAtts.length} คน)</div>`);
      } else {
        lateAtts.forEach(a => {
          const u = state.users.find(usr => usr.id === a.userId) || { name: 'พนักงาน' };
          allEvents.push(`<div class="event-chip chip-amber">${u.name.split(' ')[0]}: สาย</div>`);
        });
      }
    }

    // Approved Leave events
    if (showLeaves) {
      const leaves = state.leaveRequests.filter(l => l.status === 'approved' && l.startDate && l.endDate && dateStr >= l.startDate && dateStr <= l.endDate);
      leaves.forEach(l => {
        allEvents.push(`<div class="event-chip chip-blue">🏖️ ${l.userName.split(' ')[0]}: ${l.type}</div>`);
      });
    }

    // Task Deadline events
    if (showTasks) {
      const tasksDue = state.tasks.filter(t => t.deadline === dateStr);
      tasksDue.forEach(t => {
        allEvents.push(`<div class="event-chip chip-red">📌 ส่ง: ${escapeHtml(t.title)}</div>`);
      });
    }

    // Build visible items + "+more" tag
    const MAX_VISIBLE = 2;
    let eventsHtml = '';
    if (allEvents.length > 0) {
      const visible = allEvents.slice(0, MAX_VISIBLE);
      eventsHtml += visible.join('');
      if (allEvents.length > MAX_VISIBLE) {
        const moreCount = allEvents.length - MAX_VISIBLE;
        eventsHtml += `<div class="event-chip chip-more">+${moreCount} เพิ่มเติม</div>`;
      }
    }

    cell.innerHTML = `
      <div class="day-number-header">
        <span class="day-num">${day}</span>
      </div>
      <div class="day-events-container">
        ${eventsHtml}
      </div>
    `;

    gridEl.appendChild(cell);
  }

  // 3. Render Padded Days from Next Month
  const totalCellsRendered = firstDayOfWeek + daysInMonth;
  const remainingCells = (7 - (totalCellsRendered % 7)) % 7;

  for (let i = 1; i <= remainingCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'full-day-cell other-month';
    cell.innerHTML = `
      <div class="day-number-header">
        <span class="day-num">${i}</span>
      </div>
    `;
    gridEl.appendChild(cell);
  }
}

// Open Details Modal for a selected Day
// Open Details Modal for a selected Day
function openDayDetailsModal(dateStr) {
  const modalTitle = document.getElementById('calDayModalTitle');
  const modalBody = document.getElementById('calDayModalBody');

  const [y, m, d] = dateStr.split('-').map(Number);
  const formattedThaiDate = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;

  modalTitle.innerHTML = `<i class="fa-solid fa-calendar-day"></i> รายละเอียดประจำวันที่ ${formattedThaiDate}`;

  // Fetch Attendance records
  const atts = state.attendance.filter(a => a.date === dateStr);
  const leaves = state.leaveRequests.filter(l => l.startDate && l.endDate && dateStr >= l.startDate && dateStr <= l.endDate);
  const tasksDue = state.tasks.filter(t => t.deadline === dateStr);

  const normalAttCount = atts.filter(a => !(a.note && a.note.includes('สาย')) && (a.status === 'checked_in' || a.status === 'checked_out')).length;
  const lateAttCount = atts.filter(a => a.note && a.note.includes('สาย')).length;

  let attHtml = '';
  if (atts.length === 0) {
    attHtml = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">ไม่มีบันทึกการเข้า-ออกงานในวันนี้</p>`;
  } else {
    attHtml = `
      <div class="table-responsive">
        <table class="rich-table">
          <thead>
            <tr><th>พนักงาน</th><th>เวลาเข้างาน</th><th>เวลาออกงาน</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            ${atts.map(a => {
              const u = state.users.find(usr => usr.id === a.userId) || { name: 'พนักงาน', avatar: '👤' };
              let badgeClass = 'badge-status-green';
              let noteText = a.note || 'ตรงเวลา';
              if (a.note && a.note.includes('สาย')) {
                badgeClass = 'badge-status-amber';
              } else if (a.status === 'absent') {
                badgeClass = 'badge-status-blue';
                noteText = a.note || 'ลาป่วย';
              }
              return `
                <tr>
                  <td><div class="user-cell"><div class="user-cell-avatar">${u.avatar}</div><span>${u.name}</span></div></td>
                  <td>${a.checkInTime || '--:--'}</td>
                  <td>${a.checkOutTime || '--:--'}</td>
                  <td><span class="badge-status ${badgeClass}">${noteText}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let leaveHtml = '';
  if (leaves.length === 0) {
    leaveHtml = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">ไม่มีการยื่นใบลาในวันนี้</p>`;
  } else {
    leaveHtml = `
      <div class="table-responsive">
        <table class="rich-table">
          <thead>
            <tr><th>ผู้ยื่นใบลา</th><th>ประเภทการลา</th><th>เหตุผล</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            ${leaves.map(l => `
              <tr>
                <td><strong>${l.userName}</strong></td>
                <td>${l.type}</td>
                <td>${escapeHtml(l.reason)}</td>
                <td><span class="badge-status badge-status-${l.status === 'approved' ? 'green' : (l.status === 'rejected' ? 'red' : 'amber')}">${l.status === 'approved' ? 'อนุมัติแล้ว' : (l.status === 'rejected' ? 'ปฏิเสธ' : 'รออนุมัติ')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  let tasksHtml = '';
  if (tasksDue.length === 0) {
    tasksHtml = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">ไม่มีงานที่ต้องส่งในวันนี้</p>`;
  } else {
    tasksHtml = `
      <div class="table-responsive">
        <table class="rich-table">
          <thead>
            <tr><th>ชื่องาน</th><th>ผู้รับผิดชอบ</th><th>ความสำคัญ</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            ${tasksDue.map(t => {
              const u = state.users.find(usr => usr.id === t.assigneeId) || { avatar: '👤', name: 'ยังไม่กำหนด' };
              return `
                <tr>
                  <td><strong>${escapeHtml(t.title)}</strong></td>
                  <td>${u.avatar} ${u.name}</td>
                  <td><span class="badge-status badge-status-red">${t.priority}</span></td>
                  <td><span class="badge-status badge-status-blue">${t.status}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <!-- Top Summary Pills -->
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
      <span class="badge-status badge-status-green">🟢 เข้างาน: ${normalAttCount} คน</span>
      <span class="badge-status badge-status-amber">🟡 มาสาย: ${lateAttCount} คน</span>
      <span class="badge-status badge-status-blue">🏖️ ลางาน: ${leaves.length} คน</span>
      <span class="badge-status badge-status-red">📌 งานที่ต้องส่ง: ${tasksDue.length} งาน</span>
    </div>

    <!-- Tab Filter Buttons -->
    <div class="day-modal-tabs">
      <button class="day-tab-btn active" onclick="switchDayModalTab('all', this)">
        <i class="fa-solid fa-list"></i> ทั้งหมด
      </button>
      <button class="day-tab-btn" onclick="switchDayModalTab('attendance', this)">
        <i class="fa-solid fa-clock"></i> เข้า-ออกงาน <span class="day-tab-badge">${atts.length}</span>
      </button>
      <button class="day-tab-btn" onclick="switchDayModalTab('leave', this)">
        <i class="fa-solid fa-paper-plane"></i> การลางาน <span class="day-tab-badge">${leaves.length}</span>
      </button>
      <button class="day-tab-btn" onclick="switchDayModalTab('tasks', this)">
        <i class="fa-solid fa-tasks"></i> กำหนดส่งงาน <span class="day-tab-badge">${tasksDue.length}</span>
      </button>
    </div>

    <!-- Section Panes -->
    <div id="dayPaneAttendance" class="day-modal-section day-pane">
      <h4><i class="fa-solid fa-clock"></i> 1. การบันทึกเวลาเข้า-ออกงาน (${atts.length})</h4>
      ${attHtml}
    </div>
    <div id="dayPaneLeave" class="day-modal-section day-pane">
      <h4><i class="fa-solid fa-paper-plane"></i> 2. การลางานในวันนี้ (${leaves.length})</h4>
      ${leaveHtml}
    </div>
    <div id="dayPaneTasks" class="day-modal-section day-pane">
      <h4><i class="fa-solid fa-tasks"></i> 3. งานที่มีกำหนดส่งวันนี้ (${tasksDue.length})</h4>
      ${tasksHtml}
    </div>
  `;

  document.getElementById('calDayModal').classList.remove('hidden');
}

function switchDayModalTab(tabType, btnEl) {
  document.querySelectorAll('.day-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const paneAtt = document.getElementById('dayPaneAttendance');
  const paneLeave = document.getElementById('dayPaneLeave');
  const paneTasks = document.getElementById('dayPaneTasks');

  if (tabType === 'all') {
    if (paneAtt) paneAtt.style.display = 'block';
    if (paneLeave) paneLeave.style.display = 'block';
    if (paneTasks) paneTasks.style.display = 'block';
  } else if (tabType === 'attendance') {
    if (paneAtt) paneAtt.style.display = 'block';
    if (paneLeave) paneLeave.style.display = 'none';
    if (paneTasks) paneTasks.style.display = 'none';
  } else if (tabType === 'leave') {
    if (paneAtt) paneAtt.style.display = 'none';
    if (paneLeave) paneLeave.style.display = 'block';
    if (paneTasks) paneTasks.style.display = 'none';
  } else if (tabType === 'tasks') {
    if (paneAtt) paneAtt.style.display = 'none';
    if (paneLeave) paneLeave.style.display = 'none';
    if (paneTasks) paneTasks.style.display = 'block';
  }
}

const EMP_TYPE_ORDER = { office: 1, wfh: 2, parttime: 3 };

function sortUsersByEmpType(usersArray) {
  return [...usersArray].sort((a, b) => {
    const orderA = EMP_TYPE_ORDER[a.empType] || 1;
    const orderB = EMP_TYPE_ORDER[b.empType] || 1;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, 'th');
  });
}

// --- SECONDARY TABS ---
function renderEmployeesTab() {
  const tbody = document.getElementById('employeesListTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const sortedUsers = sortUsersByEmpType(state.users);

  sortedUsers.forEach(u => {
    let empTypeTag = '<span class="badge-status badge-status-blue">🏢 Office</span>';
    if (u.empType === 'wfh') empTypeTag = '<span class="badge-status badge-status-amber">🏠 WFH</span>';
    else if (u.empType === 'parttime') empTypeTag = '<span class="badge-status badge-status-green">⏱️ Part-Time</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${u.avatar}</div>
          <span class="user-cell-name">${u.name}</span>
        </div>
      </td>
      <td>${u.dept}</td>
      <td>${empTypeTag}</td>
      <td>${u.email || '-'}</td>
      <td>${u.phone || '-'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="openEditEmployeeModal('${u.id}')"><i class="fa-solid fa-pen"></i> แก้ไข</button>
        <button class="btn btn-sm-red" onclick="deleteEmployeeItem('${u.id}')" title="ลบพนักงาน"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAttendanceTab() {
  // 1. Render Admin Summary (if Admin/Manager)
  renderAdminAttendanceSummary();

  // 2. Render Daily Logs Table
  const tbody = document.getElementById('fullAttendanceTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filterDate = document.getElementById('attendanceFilterDate')?.value || '';
  const filterUser = document.getElementById('attendanceFilterUser')?.value || 'all';

  // Populate user filter dropdown (only once)
  const userSelect = document.getElementById('attendanceFilterUser');
  if (userSelect && userSelect.options.length <= 1) {
    state.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.avatar} ${u.name}`;
      userSelect.appendChild(opt);
    });
  }

  let records = [...state.attendance];
  
  if (filterDate) {
    records = records.filter(a => a.date === filterDate);
  }
  if (filterUser !== 'all') {
    records = records.filter(a => a.userId === filterUser);
  }

  records.sort((a, b) => b.date.localeCompare(a.date));

  records.forEach(a => {
    const user = state.users.find(u => u.id === a.userId) || { name: 'พนักงาน', avatar: '👤' };
    
    let workingHoursText = '--';
    if (a.checkInTime && a.checkOutTime) {
      const hrs = calculateWorkHours(a.checkInTime, a.checkOutTime);
      const h = Math.floor(hrs);
      const m = Math.round((hrs - h) * 60);
      workingHoursText = `${h} ชั่วโมง ${m} นาที`;
    } else if (a.checkInTime && !a.checkOutTime && a.status === 'checked_in') {
      workingHoursText = 'กำลังทำงาน...';
    } else if (a.status === 'absent') {
      workingHoursText = '-';
    }

    let badgeHtml = '<span class="badge-status badge-status-green">ตรงเวลา</span>';
    if (a.note && a.note.includes('สาย')) {
      badgeHtml = `<span class="badge-status badge-status-amber">${a.note}</span>`;
    } else if (a.status === 'absent') {
      badgeHtml = `<span class="badge-status badge-status-blue">${a.note || 'ลาป่วย'}</span>`;
    }

    if (a.lat && a.lng) {
      badgeHtml += ` <a href="https://maps.google.com/?q=${a.lat},${a.lng}" target="_blank" title="ดูหมุด Google Maps" style="color: #ea4335; margin-left: 4px;"><i class="fa-solid fa-map-pin"></i></a>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${a.date}</strong></td>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${user.avatar}</div>
          <span>${user.name}</span>
        </div>
      </td>
      <td>${a.checkInTime || '--:--'}</td>
      <td>${a.checkOutTime || '--:--'}</td>
      <td>${workingHoursText}</td>
      <td>${badgeHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- ADMIN ATTENDANCE & WORK HOURS SUMMARY ---
function renderAdminAttendanceSummary() {
  const container = document.getElementById('adminAttendanceSummaryBody');
  if (!container) return;

  // Populate user filter dropdown in Summary Card (always keep synced with state.users)
  const summaryUserSelect = document.getElementById('summaryUserFilter');
  if (summaryUserSelect) {
    const currentVal = summaryUserSelect.value || 'all';
    summaryUserSelect.innerHTML = '<option value="all">ทุกคน (All Employees)</option>';
    state.users.filter(u => u.role === 'member').forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.avatar} ${u.name}`;
      if (u.id === currentVal) opt.selected = true;
      summaryUserSelect.appendChild(opt);
    });
  }

  const periodSelect = document.getElementById('summaryPeriodSelect')?.value || 'month';
  const customRangeEl = document.getElementById('summaryCustomDateRange');
  if (customRangeEl) {
    if (periodSelect === 'custom') customRangeEl.classList.remove('hidden');
    else customRangeEl.classList.add('hidden');
  }

  const customFrom = document.getElementById('summaryDateFrom')?.value;
  const customTo = document.getElementById('summaryDateTo')?.value;
  const filterUser = document.getElementById('summaryUserFilter')?.value || 'all';
  const filterEmpType = document.getElementById('summaryEmpTypeFilter')?.value || 'all';
  const searchText = (document.getElementById('summarySearchInput')?.value || '').toLowerCase();

  let startDateStr = '';
  let endDateStr = '';
  const now = new Date();

  if (periodSelect === 'today') {
    startDateStr = getTodayStr(0);
    endDateStr = getTodayStr(0);
  } else if (periodSelect === 'month') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    startDateStr = `${y}-${m}-01`;
    endDateStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  } else if (periodSelect === 'year') {
    const y = now.getFullYear();
    startDateStr = `${y}-01-01`;
    endDateStr = `${y}-12-31`;
  } else if (periodSelect === 'custom') {
    startDateStr = customFrom || '2000-01-01';
    endDateStr = customTo || '2099-12-31';
  }

  let targetUsers = state.users.filter(u => u.role === 'member');
  if (filterUser !== 'all') {
    targetUsers = targetUsers.filter(u => u.id === filterUser);
  }
  if (filterEmpType !== 'all') {
    targetUsers = targetUsers.filter(u => (u.empType || 'office') === filterEmpType);
  }
  if (searchText) {
    targetUsers = targetUsers.filter(u => u.name.toLowerCase().includes(searchText) || (u.dept && u.dept.toLowerCase().includes(searchText)));
  }

  targetUsers = sortUsersByEmpType(targetUsers);

  let totalTeamHours = 0;
  let totalTeamLateMinutes = 0;
  let totalTeamOt = 0;
  let totalPresentDaysCount = 0;

  const rowsHtml = targetUsers.map(user => {
    const userAtts = state.attendance.filter(a => a.userId === user.id && a.date >= startDateStr && a.date <= endDateStr);
    const userLeaves = state.leaveRequests.filter(l => l.userId === user.id && l.status === 'approved' && l.startDate && l.endDate && ((l.startDate >= startDateStr && l.startDate <= endDateStr) || (l.endDate >= startDateStr && l.endDate <= endDateStr)));

    let presentDays = 0;
    let lateCount = 0;
    let lateMinutesTotal = 0;
    let totalWorkHours = 0;
    let otHoursTotal = 0;
    let absentDays = 0;

    userAtts.forEach(a => {
      if (a.status === 'checked_in' || a.status === 'checked_out') {
        presentDays++;
        if (a.checkInTime && a.checkOutTime) {
          const hrs = calculateWorkHours(a.checkInTime, a.checkOutTime);
          totalWorkHours += hrs;
          if (hrs > 8) otHoursTotal += (hrs - 8);
        }
      }
      if (a.note && a.note.includes('สาย')) {
        lateCount++;
        const match = a.note.match(/สาย\s*(\d+)/);
        if (match) lateMinutesTotal += parseInt(match[1]);
      }
      if (a.status === 'absent' && (!a.note || (!a.note.includes('ลา') && !a.note.includes('ป่วย')))) {
        absentDays++;
      }
    });

    totalTeamHours += totalWorkHours;
    totalTeamLateMinutes += lateMinutesTotal;
    totalTeamOt += otHoursTotal;
    totalPresentDaysCount += presentDays;

    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-cell-avatar">${user.avatar}</div>
            <div>
              <strong class="user-cell-name">${user.name}</strong>
              <small style="color: var(--text-muted); font-size: 0.78rem;">${user.dept || 'ทั่วไป'}</small>
            </div>
          </div>
        </td>
        <td><span class="badge-status badge-status-green">🟢 ${presentDays} วัน</span></td>
        <td>
          ${lateCount > 0 
            ? `<span class="badge-status badge-status-amber">🟡 ${lateCount} ครั้ง (${lateMinutesTotal} นาที)</span>` 
            : `<span style="color: var(--text-muted); font-size: 0.82rem;">-</span>`}
        </td>
        <td>
          ${userLeaves.length > 0 
            ? `<span class="badge-status badge-status-blue">🏖️ ${userLeaves.length} วัน</span>` 
            : `<span style="color: var(--text-muted); font-size: 0.82rem;">-</span>`}
        </td>
        <td>
          ${absentDays > 0 
            ? `<span class="badge-status badge-status-red">🔴 ${absentDays} วัน</span>` 
            : `<span style="color: var(--text-muted); font-size: 0.82rem;">-</span>`}
        </td>
        <td><strong>${totalWorkHours.toFixed(1)} ชม.</strong></td>
        <td>
          ${otHoursTotal > 0 
            ? `<strong style="color: var(--color-purple);">+${otHoursTotal.toFixed(1)} ชม.</strong>` 
            : `<span style="color: var(--text-muted); font-size: 0.82rem;">0 ชม.</span>`}
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="openEmployeeAttendanceDetailModal('${user.id}', '${startDateStr}', '${endDateStr}')">
            <i class="fa-solid fa-magnifying-glass"></i> ดูประวัติ
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = rowsHtml || `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;

  // Update Summary KPI Cards
  const kpiHours = document.getElementById('summaryKpiTotalHours');
  const kpiLate = document.getElementById('summaryKpiTotalLate');
  const kpiOt = document.getElementById('summaryKpiTotalOt');
  const kpiPresent = document.getElementById('summaryKpiTotalPresent');

  if (kpiHours) kpiHours.textContent = `${totalTeamHours.toFixed(1)} ชม.`;
  if (kpiLate) kpiLate.textContent = `${totalTeamLateMinutes} นาที`;
  if (kpiOt) kpiOt.textContent = `${totalTeamOt.toFixed(1)} ชม.`;
  if (kpiPresent) kpiPresent.textContent = `${totalPresentDaysCount} วัน`;
}

// --- EXPORT SUMMARY CSV ---
function exportAdminAttendanceSummaryCSV() {
  const periodSelect = document.getElementById('summaryPeriodSelect')?.value || 'month';
  const customFrom = document.getElementById('summaryDateFrom')?.value;
  const customTo = document.getElementById('summaryDateTo')?.value;
  
  let startDateStr = '';
  let endDateStr = '';
  const now = new Date();

  if (periodSelect === 'today') {
    startDateStr = getTodayStr(0);
    endDateStr = getTodayStr(0);
  } else if (periodSelect === 'month') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    startDateStr = `${y}-${m}-01`;
    endDateStr = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  } else if (periodSelect === 'year') {
    const y = now.getFullYear();
    startDateStr = `${y}-01-01`;
    endDateStr = `${y}-12-31`;
  } else if (periodSelect === 'custom') {
    startDateStr = customFrom || '2000-01-01';
    endDateStr = customTo || '2099-12-31';
  }

  const filterUser = document.getElementById('summaryUserFilter')?.value || 'all';
  const filterEmpType = document.getElementById('summaryEmpTypeFilter')?.value || 'all';
  const searchText = (document.getElementById('summarySearchInput')?.value || '').toLowerCase();

  let members = state.users.filter(u => u.role === 'member');
  if (filterUser !== 'all') {
    members = members.filter(u => u.id === filterUser);
  }
  if (filterEmpType !== 'all') {
    members = members.filter(u => (u.empType || 'office') === filterEmpType);
  }
  if (searchText) {
    members = members.filter(u => u.name.toLowerCase().includes(searchText) || (u.dept && u.dept.toLowerCase().includes(searchText)));
  }

  members = sortUsersByEmpType(members);
  let csvContent = "\uFEFFพนักงาน,ตำแหน่ง,ประเภทงาน,วันเข้างาน(วัน),สาย(ครั้ง),เวลาสาย(นาที),ลา(วัน),ขาด(วัน),รวมเวลาทำงาน(ชม.),เวลาOT(ชม.)\n";

  members.forEach(user => {
    const userAtts = state.attendance.filter(a => a.userId === user.id && a.date >= startDateStr && a.date <= endDateStr);
    const userLeaves = state.leaveRequests.filter(l => l.userId === user.id && l.status === 'approved' && l.startDate && l.endDate && ((l.startDate >= startDateStr && l.startDate <= endDateStr) || (l.endDate >= startDateStr && l.endDate <= endDateStr)));

    let presentDays = 0, lateCount = 0, lateMin = 0, totalWorkHours = 0, otHours = 0, absentDays = 0;

    userAtts.forEach(a => {
      if (a.status === 'checked_in' || a.status === 'checked_out') {
        presentDays++;
        if (a.checkInTime && a.checkOutTime) {
          const hrs = calculateWorkHours(a.checkInTime, a.checkOutTime);
          totalWorkHours += hrs;
          if (hrs > 8) otHours += (hrs - 8);
        }
      }
      if (a.note && a.note.includes('สาย')) {
        lateCount++;
        const match = a.note.match(/สาย\s*(\d+)/);
        if (match) lateMin += parseInt(match[1]);
      }
      if (a.status === 'absent' && (!a.note || (!a.note.includes('ลา') && !a.note.includes('ป่วย')))) {
        absentDays++;
      }
    });

    let empTypeLabel = 'Office';
    if (user.empType === 'wfh') empTypeLabel = 'WFH';
    else if (user.empType === 'parttime') empTypeLabel = 'Part-Time';

    csvContent += `"${user.name}","${user.dept || 'ทั่วไป'}","${empTypeLabel}",${presentDays},${lateCount},${lateMin},${userLeaves.length},${absentDays},${totalWorkHours.toFixed(1)},${otHours.toFixed(1)}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `รายงานเวลาทำงานพนักงาน_${startDateStr}_ถึง_${endDateStr}.csv`;
  link.click();
}

// --- OPEN EMPLOYEE ATTENDANCE DETAIL MODAL ---
function openEmployeeAttendanceDetailModal(userId, startDateStr, endDateStr) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  const modalTitle = document.getElementById('calDayModalTitle');
  const modalBody = document.getElementById('calDayModalBody');

  if (modalTitle) {
    modalTitle.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> ประวัติเวลาทำงาน: ${user.name}`;
  }

  const userAtts = state.attendance.filter(a => a.userId === userId && a.date >= startDateStr && a.date <= endDateStr);
  userAtts.sort((a, b) => b.date.localeCompare(a.date));

  let rowsHtml = '';
  if (userAtts.length === 0) {
    rowsHtml = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">ไม่มีประวัติการเข้างานในช่วงเวลานี้</td></tr>`;
  } else {
    rowsHtml = userAtts.map(a => {
      const [y, m, d] = a.date.split('-').map(Number);
      const thaiDate = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
      const hrs = calculateWorkHours(a.checkInTime, a.checkOutTime);
      let badgeClass = 'badge-status-green';
      let noteText = a.note || 'ตรงเวลา';
      if (a.note && a.note.includes('สาย')) badgeClass = 'badge-status-amber';
      else if (a.status === 'absent') badgeClass = 'badge-status-blue';

      let mapsLink = '';
      if (a.lat && a.lng) {
        mapsLink = ` <a href="https://maps.google.com/?q=${a.lat},${a.lng}" target="_blank" title="ดูหมุด Google Maps" style="color: #ea4335; margin-left: 4px;"><i class="fa-solid fa-map-pin"></i></a>`;
      }

      return `
        <tr>
          <td><strong>${thaiDate}</strong></td>
          <td>${a.checkInTime || '--:--'}</td>
          <td>${a.checkOutTime || '--:--'}</td>
          <td>${hrs > 0 ? hrs.toFixed(1) + ' ชม.' : '-'}</td>
          <td><span class="badge-status ${badgeClass}">${noteText}</span>${mapsLink}</td>
        </tr>
      `;
    }).join('');
  }

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 0.85rem; background: #f8fafc; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-size: 2rem;">${user.avatar}</div>
        <div>
          <h3 style="font-size: 1.05rem; font-weight: 700; margin: 0;">${user.name}</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">${user.roleTitle} | ${user.phone || '-'}</p>
        </div>
      </div>
      <div class="table-responsive">
        <table class="rich-table">
          <thead>
            <tr><th>วันที่</th><th>เวลาเข้างาน</th><th>เวลาออกงาน</th><th>ชั่วโมงทำงาน</th><th>สถานะ / พิกัด</th></tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  document.getElementById('calDayModal')?.classList.remove('hidden');
}

function renderKanbanBoard() {
  const activeUser = state.getActiveUser();
  const search = (document.getElementById('kanbanSearchInput')?.value || '').toLowerCase();
  const filterPrio = document.getElementById('kanbanPriorityFilter')?.value || 'all';

  let tasks = state.tasks;
  if (activeUser.role !== 'manager') {
    tasks = tasks.filter(t => t.assigneeId === activeUser.id);
  }

  if (search) {
    tasks = tasks.filter(t => t.title.toLowerCase().includes(search) || (t.description && t.description.toLowerCase().includes(search)));
  }

  if (filterPrio !== 'all') {
    tasks = tasks.filter(t => t.priority === filterPrio);
  }

  const cols = {
    todo: document.getElementById('kanbanColTodo'),
    in_progress: document.getElementById('kanbanColInProgress'),
    in_review: document.getElementById('kanbanColInReview'),
    done: document.getElementById('kanbanColDone')
  };

  const counts = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
  Object.values(cols).forEach(c => { if(c) c.innerHTML = ''; });

  tasks.forEach(t => {
    counts[t.status] = (counts[t.status] || 0) + 1;
    const col = cols[t.status];
    if (!col) return;

    const assignee = state.users.find(u => u.id === t.assigneeId) || { avatar: '👤' };

    const card = document.createElement('div');
    card.className = 'rich-kanban-card';
    card.draggable = true;
    card.ondragstart = (e) => handleDragStart(e, t.id);

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span class="badge-status badge-status-red">${t.priority === 'high' ? '🔴 High' : (t.priority === 'medium' ? '🟡 Medium' : '🟢 Low')}</span>
        <select class="form-select" style="font-size: 0.75rem; padding: 0.1rem 0.3rem; width: auto;" onchange="quickMoveTask('${t.id}', this.value)">
          <option value="todo" ${t.status === 'todo' ? 'selected' : ''}>To Do</option>
          <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="in_review" ${t.status === 'in_review' ? 'selected' : ''}>In Review</option>
          <option value="done" ${t.status === 'done' ? 'selected' : ''}>Done</option>
        </select>
      </div>
      <strong style="display: block; font-size: 0.95rem; margin-bottom: 0.3rem;">${escapeHtml(t.title)}</strong>
      <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.75rem;">${escapeHtml(t.description || '')}</p>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: var(--text-muted);">
        <span><i class="fa-regular fa-calendar"></i> ${t.deadline}</span>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span>${assignee.avatar}</span>
          <button class="btn-sm-red" onclick="deleteTaskItem('${t.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
    col.appendChild(card);
  });

  if (document.getElementById('cntKanbanTodo')) document.getElementById('cntKanbanTodo').textContent = counts.todo;
  if (document.getElementById('cntKanbanInProgress')) document.getElementById('cntKanbanInProgress').textContent = counts.in_progress;
  if (document.getElementById('cntKanbanInReview')) document.getElementById('cntKanbanInReview').textContent = counts.in_review;
  if (document.getElementById('cntKanbanDone')) document.getElementById('cntKanbanDone').textContent = counts.done;
}

let draggedTaskId = null;
function handleDragStart(e, id) { draggedTaskId = id; }
function handleDragOver(e) { e.preventDefault(); }
function handleDrop(e, status) {
  e.preventDefault();
  if (draggedTaskId) {
    state.updateTaskStatus(draggedTaskId, status);
    draggedTaskId = null;
    renderApp();
  }
}
function quickMoveTask(id, status) {
  state.updateTaskStatus(id, status);
  renderApp();
}
function deleteTaskItem(id) {
  if (confirm('คุณต้องการลบรายการงานนี้ใช่หรือไม่?')) {
    state.deleteTask(id);
    renderApp();
  }
}

function renderLeaveTab() {
  const tbody = document.getElementById('fullLeaveTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  state.leaveRequests.forEach(l => {
    let statusHtml = '<span class="badge-status badge-status-amber">รออนุมัติ</span>';
    if (l.status === 'approved') statusHtml = '<span class="badge-status badge-status-green">อนุมัติแล้ว</span>';
    if (l.status === 'rejected') statusHtml = '<span class="badge-status badge-status-red">ปฏิเสธ</span>';

    let actionBtns = '-';
    if (state.getActiveUser().role === 'manager') {
      if (l.status === 'pending') {
        actionBtns = `<button class="btn-sm-green" onclick="approveLeave('${l.id}')">อนุมัติ</button> 
                      <button class="btn-sm-red" onclick="rejectLeave('${l.id}')">ปฏิเสธ</button>`;
      } else if (l.status === 'approved') {
        actionBtns = `<button class="btn-sm-red" onclick="revokeLeave('${l.id}')" title="ยกเลิกใบลาเพื่อปลดล็อกการเข้างาน"><i class="fa-solid fa-ban"></i> ยกเลิกใบลา</button>`;
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${l.userName}</strong></td>
      <td>${l.type}</td>
      <td>${l.dateRange}</td>
      <td>${escapeHtml(l.reason)}</td>
      <td>${statusHtml}</td>
      <td>${actionBtns}</td>
    `;
    tbody.appendChild(tr);
  });
}

function revokeLeave(id) {
  if (confirm('คุณต้องการยกเลิกอนุมัติใบรายการลานี้ใช่หรือไม่?\n\n(ระบบจะปลดล็อกปุ่มลงเวลาเข้างานให้พนักงานกลับมาสแกนเข้างานได้ตามปกติ)')) {
    const l = state.leaveRequests.find(req => req.id === id);
    if (l) {
      l.status = 'rejected';
      state.save();
      renderApp();
      showToast(`ยกเลิกใบลาของ "${l.userName}" เรียบร้อยแล้ว — สามารถสแกนเข้างานได้แล้ว`, 'info');
    }
  }
}

function renderAnnouncementsTab() {
  const grid = document.getElementById('announcementsFullGrid');
  if (!grid) return;
  grid.innerHTML = '';

  state.announcements.forEach(a => {
    const card = document.createElement('div');
    card.className = 'card-box';
    card.innerHTML = `
      <div class="card-box-header">
        <h3>${a.title}</h3>
        <span class="sub-title">${a.date}</span>
      </div>
      <p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(a.desc)}</p>
    `;
    grid.appendChild(card);
  });
}

// --- MODAL UTILS ---
function openModal(id) { 
  document.getElementById(id)?.classList.remove('hidden'); 
  setTimeout(initThaiDateInputs, 50);
}
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// --- DEBOUNCE UTILITY ---
function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('richToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'richToastContainer';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `rich-toast rich-toast-${type}`;
  toast.innerHTML = `<span class="rich-toast-icon">${icons[type] || '✅'}</span><span>${message}</span>`;
  container.appendChild(toast);
  // Animate in
  requestAnimationFrame(() => toast.classList.add('rich-toast-show'));
  // Animate out and remove
  setTimeout(() => {
    toast.classList.remove('rich-toast-show');
    toast.classList.add('rich-toast-hide');
    setTimeout(() => toast.remove(), 380);
  }, duration);
}

// --- OFFICE LOCATION & GEOFENCING CONFIG ---
const OFFICE_CONFIG = {
  name: 'สำนักงานใหญ่ ลาดพร้าว 18 แยก 10',
  lat: 13.803028,
  lng: 100.568917,
  radiusMeters: 200,
  googleMapsUrl: 'https://maps.google.com/?q=13.803028,100.568917'
};

// Calculate distance between two GPS coordinates in meters using Haversine formula
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Handle Geofenced Clock Action (In / Out)
function handleGeofencedClockAction(actionType) {
  const user = state.getActiveUser();
  const todayLeave = state.getTodayApprovedLeave(user.id);

  if (todayLeave && actionType === 'in') {
    alert(`⛔ ไม่สามารถลงเวลาเข้างานได้!\n\n🏖️ วันนี้คุณอยู่ระหว่าง "${todayLeave.type}" (ได้รับการอนุมัติแล้ว)\n\n💬 หากคุณต้องการลงเวลาทำงานจริง กรุณาติดต่อ Admin หรือหัวหน้างานเพื่อยกเลิกใบลา`);
    return;
  }

  const modeSelect = document.getElementById('gpsModeSelect');
  const mode = modeSelect ? modeSelect.value : 'real';

  const btnIn = document.getElementById('btnEmpClockIn');
  const btnOut = document.getElementById('btnEmpClockOut');
  const activeBtn = actionType === 'in' ? btnIn : btnOut;
  const originalText = activeBtn ? activeBtn.innerHTML : '';

  if (activeBtn) {
    activeBtn.disabled = true;
    activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังตรวจพิกัด GPS...`;
  }

  const processClockWithGps = (userLat, userLng, locationSourceText) => {
    const user = state.getActiveUser();
    const empType = user.empType || 'office';
    const dist = getDistanceMeters(userLat, userLng, OFFICE_CONFIG.lat, OFFICE_CONFIG.lng);
    const isWithinGeofence = dist <= OFFICE_CONFIG.radiusMeters;

    if (activeBtn) {
      activeBtn.disabled = false;
      activeBtn.innerHTML = originalText;
    }

    // Geofence restriction check: Bypassed for WFH and Part-time employees
    if (empType === 'office' && !isWithinGeofence) {
      alert(`⛔ ไม่สามารถลงเวลาได้: อยู่นอกพื้นที่ลงเวลา!\n\n🏢 สำหรับพนักงาน Office: พิกัดของคุณอยู่ห่างจาก "${OFFICE_CONFIG.name}" เป็นระยะทาง ${dist.toLocaleString()} เมตร\n\n🛡️ เงื่อนไข: ต้องอยู่ภายในรัศมีไม่เกิน ${OFFICE_CONFIG.radiusMeters} เมตรจากบริษัทเท่านั้น`);
      return;
    }

    let typeTag = '🏢 Office';
    if (empType === 'wfh') typeTag = '🏠 WFH (ลงเวลานอกสถานที่)';
    else if (empType === 'parttime') typeTag = '⏱️ Part-Time (พาร์ทไทม์)';

    // Success! Perform clock in/out
    if (actionType === 'in') {
      state.clockIn(state.activeUserId, dist, userLat, userLng, `ลงเวลา ${typeTag}`);
      showToast(`บันทึกเวลาเข้างานสำเร็จ! (${typeTag})`);
    } else {
      state.clockOut(state.activeUserId, dist, userLat, userLng);
      showToast(`บันทึกเวลาออกงานสำเร็จ! (${typeTag})`);
    }
    renderApp();
  };

  // Demo simulator options
  if (mode === 'demo_inside') {
    // 40 meters from office (Inside geofence)
    const demoLat = 13.803300;
    const demoLng = 100.569150;
    setTimeout(() => processClockWithGps(demoLat, demoLng, 'จำลอง: อยู่ในบริษัท'), 600);
    return;
  } else if (mode === 'demo_outside') {
    // 1,300 meters from office (Outside geofence)
    const demoLat = 13.811500;
    const demoLng = 100.578000;
    setTimeout(() => processClockWithGps(demoLat, demoLng, 'จำลอง: อยู่นอกพื้นที่'), 600);
    return;
  }

  // Real GPS from browser/device
  if (!navigator.geolocation) {
    if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = originalText; }
    alert('⚠️ อุปกรณ์ของคุณไม่รองรับระบบระบุตำแหน่ง GPS (Geolocation)');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      processClockWithGps(pos.coords.latitude, pos.coords.longitude, 'พิกัด GPS จริง');
    },
    (err) => {
      if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = originalText; }
      let errMsg = '⚠️ ไม่สามารถดึงพิกัด GPS ได้';
      if (err.code === 1) {
        errMsg = '⚠️ สิทธิ์เข้าถึงตำแหน่งถูกปฏิเสธ (Permission Denied)\n\nกรุณาเปิดตั้งค่า Location / GPS ในเบราว์เซอร์หรือมือถือของคุณ แล้วลองใหม่อีกครั้ง';
      } else if (err.code === 2) {
        errMsg = '⚠️ ไม่สามารถค้นหาตำแหน่งสัญญาณ GPS ได้ในขณะนี้';
      } else if (err.code === 3) {
        errMsg = '⚠️ การดึงพิกัด GPS หมดเวลา (Timeout)';
      }
      alert(errMsg);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// --- HELPER: Calculate Work Hours ---
function calculateWorkHours(checkInTime, checkOutTime) {
  if (!checkInTime || !checkOutTime) return 0;
  const parseTime = (t) => {
    const parts = t.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  };
  const inMin = parseTime(checkInTime);
  const outMin = parseTime(checkOutTime);
  return Math.max(0, (outMin - inMin) / 60);
}

// --- DYNAMIC BAR CHART ---
function renderDynamicLineChart() {
  const container = document.getElementById('adminLineChartContainer');
  if (!container) return;
  
  const members = state.users.filter(u => u.role === 'member');
  const total = members.length;
  const days = [];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = `${d.getDate()} ${THAI_MONTHS[d.getMonth()].substring(0, 3)}.`;
    
    const dayAtts = state.attendance.filter(a => a.date === dateStr);
    const present = dayAtts.filter(a => (a.status === 'checked_in' || a.status === 'checked_out') && !(a.note && a.note.includes('สาย'))).length;
    const late = dayAtts.filter(a => a.note && a.note.includes('สาย')).length;
    const leave = dayAtts.filter(a => a.status === 'absent' && a.note && (a.note.includes('ลา') || a.note.includes('ป่วย'))).length;
    const absent = dayAtts.filter(a => a.status === 'absent' && (!a.note || (!a.note.includes('ลา') && !a.note.includes('ป่วย')))).length;
    
    days.push({ dayLabel, present, late, leave, absent });
  }
  
  const maxY = Math.max(total, 5);
  const padL = 35, padR = 25, padT = 28, padB = 35;
  const chartW = 540, chartH = 210;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const xStep = plotW / Math.max(days.length - 1, 1);
  const scaleY = (val) => padT + plotH - (val / maxY) * plotH;
  const baselineY = scaleY(0);
  
  // Y-axis grid lines (clean integer steps 0 to maxY)
  let gridLines = '';
  for (let val = 0; val <= maxY; val++) {
    const y = scaleY(val);
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${chartW - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
      <text x="${padL - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-text">${val}</text>
    `;
  }
  
  // Grouped Bars per day
  const barW = 7;
  const barGap = 1.5;
  const metrics = [
    { key: 'present', color: '#10b981', label: 'มาทำงาน' },
    { key: 'late', color: '#f59e0b', label: 'มาสาย' },
    { key: 'leave', color: '#3b82f6', label: 'ลา' },
    { key: 'absent', color: '#ef4444', label: 'ขาดงาน' }
  ];
  
  let barsHtml = '';
  days.forEach((d, i) => {
    const cx = padL + i * xStep;
    const groupStartX = cx - (4 * barW + 3 * barGap) / 2;
    
    metrics.forEach((m, mIdx) => {
      const val = d[m.key];
      const bx = groupStartX + mIdx * (barW + barGap);
      const by = scaleY(val);
      const bh = Math.max(0, baselineY - by);
      
      if (val > 0) {
        barsHtml += `
          <rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${m.color}" />
          <text x="${bx + barW / 2}" y="${by - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${m.color}">${val}</text>
        `;
      } else {
        // Subtle indicator dot for 0 values
        barsHtml += `
          <rect x="${bx}" y="${baselineY - 2}" width="${barW}" height="2" rx="1" fill="${m.color}" opacity="0.3" />
        `;
      }
    });
  });
  
  const xLabels = days.map((d, i) => `
    <text x="${padL + i * xStep}" y="${chartH - 8}" text-anchor="middle" class="chart-axis-text" font-weight="600">${d.dayLabel}</text>
  `).join('');
  
  container.innerHTML = `
    <svg class="line-chart-svg" viewBox="0 0 ${chartW} ${chartH}" style="width: 100%; height: 100%;">
      ${gridLines}
      ${barsHtml}
      ${xLabels}
    </svg>
  `;
}

// --- DYNAMIC DONUT CHART ---
function renderDynamicDonutChart(present, late, leave, absent, total) {
  const container = document.getElementById('adminDonutWrapper');
  if (!container) return;
  
  const circumference = 2 * Math.PI * 38;
  const segments = [
    { pct: total > 0 ? present / total : 0, color: '#10b981', label: 'มาทำงาน', count: present, dot: 'dot-green' },
    { pct: total > 0 ? late / total : 0, color: '#f59e0b', label: 'มาสาย', count: late, dot: 'dot-amber' },
    { pct: total > 0 ? leave / total : 0, color: '#3b82f6', label: 'ลา', count: leave, dot: 'dot-blue' },
    { pct: total > 0 ? absent / total : 0, color: '#f43f5e', label: 'ขาดงาน', count: absent, dot: 'dot-red' }
  ];
  
  let offset = 0;
  let circles = '';
  segments.forEach(seg => {
    const dashLen = seg.pct * circumference;
    const gapLen = circumference - dashLen;
    circles += `<circle cx="50" cy="50" r="38" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${dashLen} ${gapLen}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)"/>`;
    offset += dashLen;
  });
  
  const details = segments.map(s => {
    const pctStr = total > 0 ? ((s.count / total) * 100).toFixed(2) : '0';
    return `<div class="donut-detail-item"><span><span class="dot ${s.dot}"></span> ${s.label}</span><strong>${s.count} <small>(${pctStr}%)</small></strong></div>`;
  }).join('');
  
  container.innerHTML = `
    <div class="donut-visual">
      <svg viewBox="0 0 100 100" class="donut-svg">${circles}</svg>
      <div class="donut-center-text"><span>ทั้งหมด</span><strong>${total} <small>คน</small></strong></div>
    </div>
    <div class="donut-details-list">${details}</div>
  `;
}

// --- NOTIFICATIONS ---
function renderNotifications() {
  const list = document.getElementById('notificationList');
  const countEl = document.getElementById('notificationCount');
  if (!list) return;
  
  const notifications = [];
  const today = getTodayStr(0);
  const activeUser = state.getActiveUser();
  
  // Pending leave requests (admin sees all, employee sees own)
  state.leaveRequests.filter(l => l.status === 'pending').forEach(l => {
    if (activeUser.role === 'manager' || l.userId === activeUser.id) {
      notifications.push({ icon: '📩', text: `${l.userName} ยื่นใบ${l.type}`, sub: l.dateRange });
    }
  });
  
  // Overdue or due-today tasks
  state.tasks.filter(t => t.deadline <= today && t.status !== 'done').forEach(t => {
    if (activeUser.role === 'manager' || t.assigneeId === activeUser.id) {
      notifications.push({ icon: '⏰', text: `งาน "${t.title}" ${t.deadline < today ? 'เลยกำหนด!' : 'ครบกำหนดวันนี้'}`, sub: `Deadline: ${t.deadline}` });
    }
  });
  
  // Late arrivals today (admin only)
  if (activeUser.role === 'manager') {
    state.attendance.filter(a => a.date === today && a.note && a.note.includes('สาย')).forEach(a => {
      const u = state.users.find(usr => usr.id === a.userId) || { name: 'พนักงาน' };
      notifications.push({ icon: '🕐', text: `${u.name} ${a.note}`, sub: `เข้างาน: ${a.checkInTime}` });
    });
  }
  
  if (countEl) countEl.textContent = notifications.length;
  
  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">ไม่มีการแจ้งเตือนใหม่</div>';
  } else {
    list.innerHTML = notifications.map(n => `
      <div class="notification-item">
        <span class="notification-icon">${n.icon}</span>
        <div class="notification-content">
          <span class="notification-text">${escapeHtml(n.text)}</span>
          <span class="notification-sub">${n.sub}</span>
        </div>
      </div>
    `).join('');
  }
}

// --- EDIT EMPLOYEE ---
let editingEmployeeId = null;

function openEditEmployeeModal(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;
  
  editingEmployeeId = userId;
  document.getElementById('empName').value = user.name;
  document.getElementById('empDept').value = user.dept;
  document.getElementById('empRole').value = user.role;
  if (document.getElementById('empTypeSelect')) document.getElementById('empTypeSelect').value = user.empType || 'office';
  document.getElementById('empEmail').value = user.email || '';
  if (document.getElementById('empPhone')) document.getElementById('empPhone').value = user.phone || '';
  
  const btnDelete = document.getElementById('btnDeleteEmpModal');
  if (btnDelete) btnDelete.style.display = 'inline-flex';

  const modalTitle = document.querySelector('#empModal .modal-header h3');
  if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> แก้ไขข้อมูลพนักงาน';
  
  openModal('empModal');
}

function deleteEmployeeItem(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;
  
  if (confirm(`คุณต้องการลบพนักงาน "${user.name}" ออกจากระบบใช่หรือไม่?\n\n⚠️ ประวัติการเข้างานจะถูกลบออก แต่งานที่มอบหมายจะถูก Unassign (ไม่ลบทิ้ง)`)) {
    if (state.activeUserId === userId) {
      state.activeUserId = 'admin';
    }
    state.deleteEmployee(userId);
    closeModal('empModal');
    renderApp();
    showToast(`ลบพนักงาน "${user.name}" เรียบร้อยแล้ว`, 'info');
  }
}

// --- RESET DATA ---
function resetAllData() {
  // Bug #1 Fix: Use \n (proper newline escape) not \\n (literal backslash+n)
  if (confirm('คุณต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่?\n\n⚠️ ข้อมูลที่คุณแก้ไขจะหายไปทั้งหมด')) {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    location.reload();
  }
}

// --- INITIALIZE EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initThaiDateInputs();
  initAppWithLoading();

  // Mobile Sidebar Toggle
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  
  document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
    sidebar.classList.add('active');
    backdrop.classList.add('active');
  });

  const closeSidebar = () => {
    sidebar.classList.remove('active');
    backdrop.classList.remove('active');
  };

  document.getElementById('btnSidebarClose')?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);

  // Sidebar Tab Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      switchTab(tabId);
      closeSidebar();
    });
  });

  document.querySelectorAll('.switch-tab-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const tabId = e.currentTarget.dataset.tab;
      switchTab(tabId);
    });
  });

  // Clock In / Out Buttons
  document.getElementById('btnEmpClockIn')?.addEventListener('click', () => {
    handleGeofencedClockAction('in');
  });
  document.getElementById('btnEmpClockOut')?.addEventListener('click', () => {
    handleGeofencedClockAction('out');
  });

  // Full Interactive Calendar Controls
  document.getElementById('btnCalPrevMonth')?.addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() - 1);
    renderFullInteractiveCalendar();
  });
  document.getElementById('btnCalNextMonth')?.addEventListener('click', () => {
    calViewDate.setMonth(calViewDate.getMonth() + 1);
    renderFullInteractiveCalendar();
  });
  document.getElementById('btnCalToday')?.addEventListener('click', () => {
    calViewDate = new Date();
    renderFullInteractiveCalendar();
  });

  document.getElementById('chkShowAttendance')?.addEventListener('change', renderFullInteractiveCalendar);
  document.getElementById('chkShowLeaves')?.addEventListener('change', renderFullInteractiveCalendar);
  document.getElementById('chkShowTasks')?.addEventListener('change', renderFullInteractiveCalendar);

  // Close Day Modal
  document.getElementById('btnCloseCalDayModal')?.addEventListener('click', () => closeModal('calDayModal'));
  document.getElementById('btnCloseCalDayModalBtn')?.addEventListener('click', () => closeModal('calDayModal'));

  // Task Modal Events
  const populateTaskAssignees = () => {
    const sel = document.getElementById('taskAssignee');
    if (!sel) return;
    sel.innerHTML = '';
    state.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.avatar} ${u.name}`;
      sel.appendChild(opt);
    });
  };

  const openTaskModal = () => {
    populateTaskAssignees();
    document.getElementById('taskForm')?.reset();
    document.getElementById('taskDeadline').value = getTodayStr(0);
    openModal('taskModal');
  };

  document.getElementById('btnCreateTaskKanban')?.addEventListener('click', openTaskModal);
  document.getElementById('btnCloseTaskModal')?.addEventListener('click', () => closeModal('taskModal'));
  document.getElementById('btnCancelTaskModal')?.addEventListener('click', () => closeModal('taskModal'));

  document.getElementById('taskForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const assigneeId = document.getElementById('taskAssignee').value;
    const deadline = document.getElementById('taskDeadline').value;
    const priority = document.getElementById('taskPriority').value;
    const status = document.getElementById('taskStatus').value;

    if (title) {
      state.addTask({ title, description, assigneeId, deadline, priority, status });
      closeModal('taskModal');
      renderApp();
    }
  });

  // Leave Modal Events
  const openLeaveModal = () => {
    document.getElementById('leaveForm')?.reset();
    document.getElementById('leaveStartDate').value = getTodayStr(0);
    document.getElementById('leaveEndDate').value = getTodayStr(0);
    openModal('leaveModal');
  };

  document.getElementById('btnSubmitLeaveModalOpen')?.addEventListener('click', openLeaveModal);
  document.getElementById('btnQuickSubmitLeave')?.addEventListener('click', openLeaveModal);
  document.getElementById('btnCloseLeaveModal')?.addEventListener('click', () => closeModal('leaveModal'));
  document.getElementById('btnCancelLeaveModal')?.addEventListener('click', () => closeModal('leaveModal'));

  document.getElementById('leaveForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = state.getActiveUser();
    const type = document.getElementById('leaveType').value;
    const startDate = document.getElementById('leaveStartDate').value;
    const endDate = document.getElementById('leaveEndDate').value;
    const reason = document.getElementById('leaveReason').value.trim();

    // Bug #7 Fix: Validate that endDate is not before startDate
    if (startDate && endDate && endDate < startDate) {
      showToast('วันสิ้นสุดการลาต้องไม่ก่อนวันเริ่มต้น — กรุณาตรวจสอบวันที่อีกครั้ง', 'error');
      return;
    }

    state.addLeaveRequest({
      userId: user.id,
      userName: user.name,
      type,
      dateRange: startDate === endDate ? startDate : `${startDate} ถึง ${endDate}`,
      startDate,
      endDate,
      reason
    });

    closeModal('leaveModal');
    renderApp();
    showToast('ส่งใบลาเรียบร้อยแล้ว — รอผลอนุมัติจากแอดมิน');
  });

  // Add Employee Modal Events
  const openNewEmpModal = () => {
    editingEmployeeId = null;
    document.getElementById('empForm')?.reset();
    const btnDelete = document.getElementById('btnDeleteEmpModal');
    if (btnDelete) btnDelete.style.display = 'none';
    const modalTitle = document.querySelector('#empModal .modal-header h3');
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> เพิ่มพนักงานใหม่';
    openModal('empModal');
  };

  document.getElementById('btnQuickAddEmp')?.addEventListener('click', openNewEmpModal);
  document.getElementById('btnAddEmpTab')?.addEventListener('click', openNewEmpModal);
  document.getElementById('btnCloseEmpModal')?.addEventListener('click', () => closeModal('empModal'));
  document.getElementById('btnCancelEmpModal')?.addEventListener('click', () => closeModal('empModal'));
  document.getElementById('btnDeleteEmpModal')?.addEventListener('click', () => {
    if (editingEmployeeId) {
      deleteEmployeeItem(editingEmployeeId);
    }
  });

  document.getElementById('empForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('empName').value.trim();
    const dept = document.getElementById('empDept').value.trim();
    const role = document.getElementById('empRole').value;
    const empType = document.getElementById('empTypeSelect')?.value || 'office';
    const email = document.getElementById('empEmail').value.trim();
    const phone = document.getElementById('empPhone')?.value.trim() || '';

    if (name && dept) {
      if (editingEmployeeId) {
        // Edit mode
        const user = state.users.find(u => u.id === editingEmployeeId);
        if (user) {
          user.name = name;
          user.dept = dept;
          user.role = role;
          user.empType = empType;
          user.email = email;
          user.phone = phone;
          state.save();
        }
        editingEmployeeId = null;
        closeModal('empModal');
        renderApp();
        showToast(`อัปเดตข้อมูล "${name}" เรียบร้อยแล้ว`);
      } else {
        // Create mode
        state.addEmployee({ name, dept, role, empType, email, phone, startDate: getTodayStr(0) });
        closeModal('empModal');
        renderApp();
        showToast(`เพิ่มพนักงาน "${name}" เข้าสู่ระบบสำเร็จ!`);
      }
      // Reset modal title
      const modalTitle = document.querySelector('#empModal .modal-header h3');
      if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> เพิ่มพนักงานใหม่';
    }
  });

  // Announcement Modal Events
  document.getElementById('btnQuickAddAnnouncement')?.addEventListener('click', () => openModal('announceModal'));
  document.getElementById('btnAddAnnounceTab')?.addEventListener('click', () => openModal('announceModal'));
  document.getElementById('btnCloseAnnounceModal')?.addEventListener('click', () => closeModal('announceModal'));
  document.getElementById('btnCancelAnnounceModal')?.addEventListener('click', () => closeModal('announceModal'));

  document.getElementById('announceForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('announceTitle').value.trim();
    const desc = document.getElementById('announceContent').value.trim();

    if (title && desc) {
      state.addAnnouncement({ title, desc });
      closeModal('announceModal');
      renderApp();
      showToast('โพสต์ประกาศใหม่สำเร็จ!');
    }
  });

  // Kanban Search & Filter — use debounce on text input to avoid re-rendering on every keystroke
  document.getElementById('kanbanSearchInput')?.addEventListener('input', debounce(renderKanbanBoard));
  document.getElementById('kanbanPriorityFilter')?.addEventListener('change', renderKanbanBoard);

  // Attendance Filter
  document.getElementById('attendanceFilterDate')?.addEventListener('change', renderAttendanceTab);
  document.getElementById('attendanceFilterUser')?.addEventListener('change', renderAttendanceTab);

  // Admin Attendance Summary Filters & Actions
  document.getElementById('summaryPeriodSelect')?.addEventListener('change', renderAdminAttendanceSummary);
  document.getElementById('summaryDateFrom')?.addEventListener('change', renderAdminAttendanceSummary);
  document.getElementById('summaryDateTo')?.addEventListener('change', renderAdminAttendanceSummary);
  document.getElementById('summaryUserFilter')?.addEventListener('change', renderAdminAttendanceSummary);
  document.getElementById('summaryEmpTypeFilter')?.addEventListener('change', renderAdminAttendanceSummary);
  // Debounce text search to avoid re-rendering on every keystroke
  document.getElementById('summarySearchInput')?.addEventListener('input', debounce(renderAdminAttendanceSummary));
  document.getElementById('btnExportSummaryCSV')?.addEventListener('click', exportAdminAttendanceSummaryCSV);

  // Notification Toggle
  document.getElementById('notificationBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.classList.add('hidden');
  });

  // Initialize Dark/Light Theme
  initTheme();
  document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);

  // Command Palette Listeners
  document.getElementById('btnOpenCommandPalette')?.addEventListener('click', openCommandPalette);
  document.getElementById('cmdSearchInput')?.addEventListener('input', (e) => renderCommandPaletteResults(e.target.value));

  // Global Keyboard Shortcuts (Ctrl + K or Cmd + K)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const modal = document.getElementById('commandPaletteModal');
      if (modal && !modal.classList.contains('hidden')) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    } else if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });

  // Close Command Palette on Backdrop Click
  document.getElementById('commandPaletteModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'commandPaletteModal') closeCommandPalette();
  });

  // Google Apps Script Web App URL setting
  const scriptInput = document.getElementById('settingAppsScriptUrl');
  if (scriptInput) {
    scriptInput.value = GOOGLE_WEB_APP_URL || '';
  }
  document.getElementById('btnSaveAppsScriptUrl')?.addEventListener('click', () => {
    const val = (document.getElementById('settingAppsScriptUrl')?.value || '').trim();
    GOOGLE_WEB_APP_URL = val;
    localStorage.setItem('richcars_apps_script_url', val);
    showToast('บันทึก Web App URL เรียบร้อยแล้ว');
  });

  document.getElementById('btnProductionReset')?.addEventListener('click', () => {
    if (confirm('คุณต้องการล้างข้อมูลทดสอบทั้งหมดเพื่อเริ่มต้นใช้งานจริงในบริษัทใช่หรือไม่?\n\n⚠️ ประวัติเข้างาน ใบลา และรายชื่อสมมติจะถูกลบทิ้ง เพื่อเริ่มตารางบริษัทจริงสดๆ')) {
      state.clearDemoData();
      renderApp();
      showToast('🧹 ล้างข้อมูลทดสอบเรียบร้อยแล้ว! ระบบพร้อมสำหรับการใช้งานจริง 100%', 'success', 5000);
    }
  });

  // Google Sign-In Button
  document.getElementById('btnGoogleSignIn')?.addEventListener('click', handleGoogleSignIn);
  initGoogleOAuth();

  // Logout Button in Sidebar
  document.getElementById('btnLogoutSidebar')?.addEventListener('click', handleLogout);
});

// --- THEME MANAGEMENT (Light / Dark Mode) ---
function initTheme() {
  const savedTheme = localStorage.getItem('richcars_theme_v1') || 'light';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('richcars_theme_v1', theme);
  
  const icon = document.getElementById('themeToggleIcon');
  if (icon) {
    if (theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
      icon.style.color = '#f59e0b';
    } else {
      icon.className = 'fa-solid fa-moon';
      icon.style.color = '';
    }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

// --- COMMAND PALETTE LOGIC (Ctrl + K) ---
function openCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('cmdSearchInput');
  if (!modal || !input) return;
  
  modal.classList.remove('hidden');
  input.value = '';
  input.focus();
  renderCommandPaletteResults('');
}

function closeCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  if (modal) modal.classList.add('hidden');
}

function renderCommandPaletteResults(query) {
  const resultsContainer = document.getElementById('cmdPaletteResults');
  if (!resultsContainer) return;

  const q = query.toLowerCase().trim();

  const allItems = [
    // Navigation Tabs (พนักงานทั่วไป)
    { type: 'nav', id: 'dashboard', title: 'หน้าหลัก (Dashboard)', icon: 'fa-house', category: 'เมนูระบบ' },
    { type: 'nav', id: 'attendance', title: 'การเข้างาน & สรุปเวลาทำงาน (Attendance)', icon: 'fa-calendar-check', category: 'เมนูระบบ' },
    { type: 'nav', id: 'tasks', title: 'การจัดการงาน (Tasks)', icon: 'fa-list-check', category: 'เมนูระบบ' },
    { type: 'nav', id: 'leave', title: 'การลางาน (Leave Requests)', icon: 'fa-envelope-open-text', category: 'เมนูระบบ' },
    { type: 'nav', id: 'calendar', title: 'ปฏิทินบริษัท (Calendar)', icon: 'fa-calendar-days', category: 'เมนูระบบ' },
    { type: 'nav', id: 'announcements', title: 'ประกาศข่าวสาร (Announcements)', icon: 'fa-bullhorn', category: 'เมนูระบบ' },

    // Quick Actions
    { type: 'action', action: 'clockIn', title: '🟢 ลงเวลาเข้างาน (Clock In)', icon: 'fa-arrow-right-to-bracket', category: 'คำสั่งด่วน' },
    { type: 'action', action: 'clockOut', title: '🔴 ลงเวลาออกงาน (Clock Out)', icon: 'fa-arrow-right-from-bracket', category: 'คำสั่งด่วน' },
    { type: 'action', action: 'submitLeave', title: '📝 ยื่นใบลาป่วย / ลากิจใหม่', icon: 'fa-paper-plane', category: 'คำสั่งด่วน' },
    { type: 'action', action: 'toggleTheme', title: '🌓 สลับโหมดมืด / สว่าง (Dark/Light)', icon: 'fa-moon', category: 'คำสั่งด่วน' },
  ];

  // เมนูเฉพาะผู้ดูแลระบบ (Admin / Manager)
  if (state.getActiveUser().role === 'manager') {
    allItems.push(
      { type: 'nav', id: 'employees', title: 'จัดการพนักงาน (Employees)', icon: 'fa-user-group', category: 'ผู้ดูแลระบบ' },
      { type: 'nav', id: 'settings', title: 'ตั้งค่าระบบ (Settings)', icon: 'fa-gear', category: 'ผู้ดูแลระบบ' }
    );
  }

  // Add Employees to search items
  state.users.forEach(u => {
    allItems.push({
      type: 'user',
      userId: u.id,
      title: `${u.avatar || '👤'} ${u.name || 'พนักงาน'} (${u.roleTitle || u.dept || 'พนักงาน'})`,
      icon: 'fa-user',
      category: 'พนักงานในระบบ'
    });
  });

  const filtered = q ? allItems.filter(item => item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)) : allItems;

  // Group by category
  const categories = {};
  filtered.forEach(item => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  });

  let html = '';
  Object.keys(categories).forEach(cat => {
    html += `<div class="cmd-result-group"><div class="cmd-group-title">${cat}</div>`;
    categories[cat].forEach(item => {
      let clickAttr = '';
      if (item.type === 'nav') {
        clickAttr = `onclick="switchTab('${item.id}'); closeCommandPalette();"`;
      } else if (item.type === 'action') {
        if (item.action === 'clockIn') clickAttr = `onclick="closeCommandPalette(); handleGeofencedClockAction('in');"`;
        else if (item.action === 'clockOut') clickAttr = `onclick="closeCommandPalette(); handleGeofencedClockAction('out');"`;
        else if (item.action === 'submitLeave') clickAttr = `onclick="closeCommandPalette(); openModal('leaveModal');"`;
        else if (item.action === 'toggleTheme') clickAttr = `onclick="closeCommandPalette(); toggleTheme();"`;
      } else if (item.type === 'user') {
        clickAttr = `onclick="switchTab('employees'); closeCommandPalette();"`;
      }

      html += `
        <div class="cmd-item" ${clickAttr}>
          <i class="fa-solid ${item.icon} cmd-item-icon"></i>
          <span>${item.title}</span>
        </div>
      `;
    });
    html += `</div>`;
  });

  resultsContainer.innerHTML = html || `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">ไม่พบรายการที่ค้นหา "${escapeHtml(query)}"</div>`;
}

// --- AUTHENTICATION & GOOGLE LOGIN FUNCTIONS ---

let tokenClient = null;

function initGoogleOAuth() {
  if (window.google && google.accounts) {
    try {
      // 1. Initialize GIS OneTap / ID Client
      if (google.accounts.id && GOOGLE_CLIENT_ID) {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleLoginResponse,
          auto_select: false
        });

        // Render official Google button inside wrapper if container exists
        const btnContainer = document.getElementById('googleSignInBtnWrapper');
        if (btnContainer) {
          btnContainer.innerHTML = '';
          google.accounts.id.renderButton(btnContainer, {
            theme: 'outline',
            size: 'large',
            width: '320',
            text: 'continue_with',
            locale: 'th'
          });
        }
      }

      // 2. Initialize GIS OAuth2 Token Client for Popup on Button Click
      if (google.accounts.oauth2 && GOOGLE_CLIENT_ID) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'email profile openid',
          callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              fetchGoogleUserInfo(tokenResponse.access_token);
            }
          }
        });
      }
    } catch (err) {
      console.warn('Google Identity initialization deferred:', err);
    }
  }
}

function handleGoogleSignIn() {
  const btnGoogle = document.getElementById('btnGoogleSignIn');
  if (btnGoogle && btnGoogle.disabled) {
    showToast('กำลังโหลดข้อมูลระบบ กรุณารอสักครู่...', 'info');
    return;
  }

  if (window.location.protocol === 'file:') {
    showToast('⚠️ กรุณาเข้าใช้งานผ่านเว็บจริงบน GitHub Pages เพื่อทดสอบ Google Login', 'warning', 5000);
    return;
  }

  if (window.google && google.accounts) {
    try {
      if (tokenClient) {
        // Request Google OAuth Popup Window
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } else if (google.accounts.id && GOOGLE_CLIENT_ID) {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleLoginResponse
        });
        google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const reason = notification.getNotDisplayedReason();
            console.log('Google OneTap prompt reason:', reason);
            showToast(`💡 กรุณากดเลือกบัญชีในปุ่ม Google ด้านล่าง (สถานะ: ${reason || 'เปิดทางเว็บหลัก'})`, 'info', 4500);
          }
        });
      }
    } catch (e) {
      console.error('Google Sign-In prompt error:', e);
      showToast('⚠️ เกิดข้อผิดพลาดในการเปิดหน้าล็อกอิน Google', 'error');
    }
  } else {
    showToast('⚠️ กำลังโหลดระบบ Google Sign-In กรุณาลองใหม่อีกครั้งในอีกสักครู่', 'warning');
  }
}

async function fetchGoogleUserInfo(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const info = await res.json();
    if (info && info.email) {
      processGoogleUserLogin(info.email, info.name, info.picture);
    }
  } catch (err) {
    console.error('Failed to fetch Google User Info:', err);
    showToast('ไม่สามารถดึงข้อมูลโปรไฟล์จาก Google ได้', 'error');
  }
}

function handleGoogleLoginResponse(response) {
  try {
    const responsePayload = parseJwt(response.credential);
    if (responsePayload && responsePayload.email) {
      processGoogleUserLogin(responsePayload.email, responsePayload.name, responsePayload.picture);
    }
  } catch (err) {
    console.error('Error parsing Google Token:', err);
    showToast('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ Google Login', 'error');
  }
}

function processGoogleUserLogin(googleEmail, googleName, googlePicture) {
  const email = (googleEmail || '').trim().toLowerCase();
  
  const user = state.users.find(u => u.email && u.email.trim().toLowerCase() === email);
  
  if (user) {
    showToast(`🔑 เข้าสู่ระบบด้วย Google สำเร็จ: ${user.name}`);
    state.setAuthSession(user);
    initAppWithLoading();
  } else {
    showToast('อีเมลนี้ยังไม่ได้ลงทะเบียนในระบบ กรุณาติดต่อฝ่าย HR เพื่อเพิ่มชื่อของคุณก่อนเข้าใช้งาน', 'error', 5000);
  }
}

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  return JSON.parse(jsonPayload);
}

function handleLogout() {
  if (confirm('คุณต้องการออกจากระบบ RICHCARS ใช่หรือไม่?')) {
    state.clearAuthSession();
    renderApp();
  }
}

// --- TIME-AWARE AMBIENT GLOW FUNCTION ---
function updateTimeAwareLoginGlow() {
  const overlay = document.getElementById('loginOverlayPage');
  const card = document.querySelector('.login-card-container');
  const badge = document.getElementById('loginTimeBadge');
  const badgeIcon = document.getElementById('loginTimeBadgeIcon');
  const badgeText = document.getElementById('loginTimeBadgeText');

  if (!overlay || !card) return;

  const hour = new Date().getHours();
  
  overlay.classList.remove('time-morning', 'time-afternoon', 'time-evening');
  card.classList.remove('glow-morning', 'glow-afternoon', 'glow-evening');
  if (badge) badge.classList.remove('badge-morning', 'badge-afternoon', 'badge-evening');

  if (hour >= 6 && hour < 12) {
    // Morning (06:00 - 11:59)
    overlay.classList.add('time-morning');
    card.classList.add('glow-morning');
    if (badge) badge.classList.add('badge-morning');
    if (badgeIcon) badgeIcon.textContent = '🌅';
    if (badgeText) badgeText.textContent = 'สวัสดีตอนเช้า';
  } else if (hour >= 12 && hour < 18) {
    // Afternoon (12:00 - 17:59)
    overlay.classList.add('time-afternoon');
    card.classList.add('glow-afternoon');
    if (badge) badge.classList.add('badge-afternoon');
    if (badgeIcon) badgeIcon.textContent = '☀️';
    if (badgeText) badgeText.textContent = 'สวัสดีตอนบ่าย';
  } else {
    // Evening / Night (18:00 - 05:59)
    overlay.classList.add('time-evening');
    card.classList.add('glow-evening');
    if (badge) badge.classList.add('badge-evening');
    if (badgeIcon) badgeIcon.textContent = '🌙';
    if (badgeText) badgeText.textContent = 'สวัสดีตอนค่ำ';
  }
}

// --- THAI DATE INPUT FORMATTER (DD/MM/YYYY - วัน/เดือน/ปี) ---
function initThaiDateInputs() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    const parent = input.parentElement;
    if (parent && parent.classList.contains('thai-date-wrapper')) {
      const grandParent = parent.parentElement;
      if (grandParent) {
        grandParent.insertBefore(input, parent);
        parent.remove();
      }
    }

    delete input.dataset.thaiInit;
    input.dataset.thaiInit = 'true';

    const newParent = input.parentElement;
    if (!newParent) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'thai-date-wrapper';

    const displayBox = document.createElement('div');
    displayBox.className = 'thai-date-display-box';
    displayBox.innerHTML = `
      <span class="thai-date-val">วัน/เดือน/ปี</span>
      <i class="fa-regular fa-calendar-days thai-date-icon"></i>
    `;

    newParent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(displayBox);

    input.classList.add('thai-date-hidden-input');

    const updateDisplay = () => {
      const val = input.value;
      const valSpan = displayBox.querySelector('.thai-date-val');
      if (val) {
        const parts = val.split('-');
        if (parts.length === 3) {
          const [y, m, d] = parts;
          valSpan.textContent = `${d}/${m}/${y}`;
          valSpan.style.color = 'var(--text-main)';
        }
      } else {
        valSpan.textContent = 'วัน/เดือน/ปี';
        valSpan.style.color = 'var(--text-muted)';
      }
    };

    input.addEventListener('change', updateDisplay);
    input.addEventListener('input', updateDisplay);
    updateDisplay();
  });
}

// Bug #2 Fix: Only clear legacy theme key (v2), do NOT remove data-theme attribute
// initTheme() in DOMContentLoaded already handles setting the correct theme from richcars_theme_v1
(function clearLegacyThemeKeys() {
  localStorage.removeItem('richcars_theme_v2'); // Remove old key from reverted theme system
})();
