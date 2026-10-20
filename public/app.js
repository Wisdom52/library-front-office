/**
 * LIBRARY FRONT OFFICE MANAGER — CLIENT APPLICATION
 * High-performance SPA with Digital Signature Capture, PostgreSQL & Access Sync
 */

// Application State
const state = {
  activeTab: 'tab-overview',
  activeStaff: 'Jane M. Doe (Head Librarian)',
  students: [],
  schools: [],
  items: [],
  presentVisits: [],
  openLoans: [],
  stats: {},
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  setupDateDisplay();
  setupNavigation();
  setupStaffSelector();
  setupSignaturePads();
  setupSearchBars();
  setupForms();

  // Initial Data Fetch
  await loadCoreData();

  // Periodic Refresh every 15 seconds for live roster updates
  setInterval(refreshLiveFeeds, 15000);
});

function setupDateDisplay() {
  const el = document.getElementById('header-date');
  if (!el) return;
  const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('en-US', options);
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const pageTitle = document.getElementById('page-title');

  const titles = {
    'tab-overview': 'Command Center',
    'tab-reception': 'Reception & Attendance Desk',
    'tab-loans': 'Resource Circulation Desk',
    'tab-students': 'Student Directory',
    'tab-items': 'Asset & Inventory Register',
    'tab-reports': 'Reports & Analytics',
    'tab-access': 'Microsoft Access & PostgreSQL Hub',
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.remove('active');
      });

      const activeSection = document.getElementById(targetTab);
      if (activeSection) {
        activeSection.classList.add('active');
      }

      state.activeTab = targetTab;
      if (pageTitle && titles[targetTab]) {
        pageTitle.textContent = titles[targetTab];
      }

      // Contextual refresh on tab switch
      if (targetTab === 'tab-reports') loadReportsData();
      if (targetTab === 'tab-students') renderStudentsTable();
      if (targetTab === 'tab-items') renderItemsTable();
      if (targetTab === 'tab-reception') loadReceptionData();
      if (targetTab === 'tab-loans') loadLoansData();
    });
  });

  // Quick Action Buttons
  document.getElementById('btn-quick-checkin')?.addEventListener('click', () => openModal('modal-checkin'));
  document.getElementById('btn-reception-checkin-direct')?.addEventListener('click', () => openModal('modal-checkin'));
  document.getElementById('btn-quick-issue')?.addEventListener('click', () => openModal('modal-issue'));
  document.getElementById('btn-open-issue-modal')?.addEventListener('click', () => openModal('modal-issue'));
  document.getElementById('btn-loans-issue-resource')?.addEventListener('click', () => openModal('modal-issue'));
  document.getElementById('btn-open-register-student')?.addEventListener('click', () => openModal('modal-register-student'));
  document.getElementById('btn-open-add-item')?.addEventListener('click', () => openModal('modal-add-item'));
  document.getElementById('btn-refresh-present')?.addEventListener('click', () => refreshLiveFeeds(true));

  // Auto student number generator
  document.getElementById('btn-gen-stu-num')?.addEventListener('click', () => {
    const input = document.getElementById('reg-student-number');
    if (input) input.value = makeClientStudentNumber();
  });
}

function makeClientStudentNumber() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const nn = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `STU-${yy}${mm}${dd}-${hh}${nn}${ss}`;
}

function setupStaffSelector() {
  const select = document.getElementById('select-active-staff');
  if (select) {
    state.activeStaff = select.value;
    select.addEventListener('change', (e) => {
      state.activeStaff = e.target.value;
      showToast(`Active officer switched to: ${state.activeStaff}`, 'info');
    });
  }
}

// ================= DATA FETCHING =================
async function loadCoreData() {
  try {
    await Promise.all([
      fetchHealth(),
      fetchStats(),
      fetchSchools(),
      fetchStudents(),
      fetchItems(),
      fetchPresentVisits(),
      fetchOpenLoans(),
    ]);
  } catch (err) {
    console.error('Error loading core data:', err);
    showToast('Failed to connect to backend service.', 'error');
  }
}

async function refreshLiveFeeds(manual = false) {
  try {
    await Promise.all([
      fetchStats(),
      fetchPresentVisits(),
      fetchOpenLoans(),
    ]);
    if (manual) showToast('Live attendance & loans updated.', 'success');
  } catch (err) {
    console.error('Refresh error:', err);
  }
}

async function fetchHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const el = document.getElementById('db-health-text');
    if (el) {
      el.textContent = `PostgreSQL 16 (${data.database || 'Active'})`;
    }
  } catch (e) {
    const el = document.getElementById('db-health-text');
    if (el) el.textContent = 'PostgreSQL Offline';
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    state.stats = data;

    document.getElementById('stat-currently-present').textContent = data.currentlyPresent || 0;
    document.getElementById('stat-visits-today').textContent = data.visitsToday || 0;
    document.getElementById('stat-active-loans').textContent = data.activeLoans || 0;
    document.getElementById('stat-available-items').textContent = data.availableItems || 0;
    document.getElementById('stat-total-items-text').textContent = `${data.totalItems || 0} total assets cataloged`;

    document.getElementById('sidebar-present-count').textContent = data.currentlyPresent || 0;
    document.getElementById('sidebar-loans-count').textContent = data.activeLoans || 0;
    document.getElementById('reception-present-counter').textContent = data.currentlyPresent || 0;
  } catch (err) {
    console.warn('Stats fetch error:', err);
  }
}

async function fetchSchools() {
  try {
    const res = await fetch('/api/schools');
    const data = await res.json();
    state.schools = data;

    // Populate school filter in students tab
    const filter = document.getElementById('students-school-filter');
    const regSelect = document.getElementById('reg-school');
    if (filter) {
      filter.innerHTML = '<option value="">All Schools</option>' +
        data.map(s => `<option value="${s.schoolid}">${escapeHtml(s.schoolname)}</option>`).join('');
    }
    if (regSelect) {
      regSelect.innerHTML = '<option value="">-- Select School --</option>' +
        data.map(s => `<option value="${s.schoolid}">${escapeHtml(s.schoolname)}</option>`).join('');
    }
  } catch (err) {
    console.error('Fetch schools error:', err);
  }
}

async function fetchStudents() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    state.students = data;
    renderStudentsTable();
    updateStudentDropdowns();
  } catch (err) {
    console.error('Fetch students error:', err);
  }
}

async function fetchItems() {
  try {
    const res = await fetch('/api/items');
    const data = await res.json();
    state.items = data;
    renderItemsTable();
    updateItemDropdowns();
  } catch (err) {
    console.error('Fetch items error:', err);
  }
}

async function fetchPresentVisits() {
  try {
    const res = await fetch('/api/visits/currently-present');
    const data = await res.json();
    state.presentVisits = data;
    renderOverviewPresentTable(data);
    renderReceptionPresentTable(data);
  } catch (err) {
    console.error('Fetch present visits error:', err);
  }
}

async function fetchOpenLoans() {
  try {
    const res = await fetch('/api/loans/open');
    const data = await res.json();
    state.openLoans = data;
    renderOverviewLoansTable(data);
    renderCirculationLoansTable(data);
  } catch (err) {
    console.error('Fetch open loans error:', err);
  }
}

async function loadReceptionData() {
  await fetchPresentVisits();
  try {
    const res = await fetch('/api/visits/today');
    const data = await res.json();
    renderReceptionTodayTable(data);
  } catch (err) {
    console.error('Fetch today visits error:', err);
  }
}

async function loadLoansData() {
  await fetchOpenLoans();
}

async function loadReportsData() {
  try {
    const [schoolsRes, historyRes] = await Promise.all([
      fetch('/api/reports/by-school'),
      fetch('/api/reports/loan-history'),
    ]);
    const schools = await schoolsRes.json();
    const history = await historyRes.json();

    // Render School Breakdown
    const tbodySchool = document.getElementById('tbody-report-school');
    if (tbodySchool) {
      if (schools.length === 0) {
        tbodySchool.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No attendance data.</td></tr>';
      } else {
        tbodySchool.innerHTML = schools.map(s => `
          <tr>
            <td><strong>${escapeHtml(s.schoolname)}</strong></td>
            <td><span class="chip chip-cyan">${s.totalvisits} visits</span></td>
            <td>${s.uniquestudents} students</td>
            <td>${s.lastvisittime ? new Date(s.lastvisittime).toLocaleDateString() : '—'}</td>
          </tr>
        `).join('');
      }
    }

    // Render Outstanding Items
    const tbodyOut = document.getElementById('tbody-report-outstanding');
    if (tbodyOut) {
      if (state.openLoans.length === 0) {
        tbodyOut.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No outstanding items!</td></tr>';
      } else {
        tbodyOut.innerHTML = state.openLoans.map(l => `
          <tr>
            <td><span class="font-mono text-cyan">${escapeHtml(l.assettag)}</span></td>
            <td><strong>${escapeHtml(l.titleormodel)}</strong> (${escapeHtml(l.itemtype)})</td>
            <td>${escapeHtml(l.fullname)}</td>
            <td>${l.daysout} days</td>
            <td>${l.isoverdue ? '<span class="chip chip-danger">OVERDUE</span>' : '<span class="chip chip-warn">ACTIVE</span>'}</td>
          </tr>
        `).join('');
      }
    }

    // Render Loan History
    const tbodyHist = document.getElementById('tbody-report-history');
    if (tbodyHist) {
      if (history.length === 0) {
        tbodyHist.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No circulation history found.</td></tr>';
      } else {
        tbodyHist.innerHTML = history.map(h => `
          <tr>
            <td>
              <strong>${escapeHtml(h.fullname)}</strong><br>
              <small class="text-muted">${escapeHtml(h.studentnumber)}</small>
            </td>
            <td>
              <span class="font-mono">${escapeHtml(h.assettag)}</span> - ${escapeHtml(h.titleormodel)}
            </td>
            <td>${new Date(h.dateissued).toLocaleDateString()}</td>
            <td>${h.datereturned ? new Date(h.datereturned).toLocaleDateString() : '—'}</td>
            <td>Out: ${escapeHtml(h.conditionout || 'Good')} / In: ${escapeHtml(h.conditionin || '—')}</td>
            <td>${escapeHtml(h.issuedby || '—')} / ${escapeHtml(h.receivedby || '—')}</td>
            <td>
              ${h.issuesignaturepath ? `<img src="/${h.issuesignaturepath}" class="sig-thumbnail" title="Issue Signature" />` : ''}
              ${h.returnsignaturepath ? `<img src="/${h.returnsignaturepath}" class="sig-thumbnail" title="Return Signature" />` : ''}
            </td>
            <td>
              ${h.status === 'OVERDUE' ? '<span class="chip chip-danger">OVERDUE</span>' :
                h.status === 'ISSUED' ? '<span class="chip chip-warn">ISSUED</span>' :
                '<span class="chip chip-success">RETURNED</span>'}
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

// ================= RENDERING TABLES =================

function renderOverviewPresentTable(list) {
  const tbody = document.getElementById('tbody-overview-present');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-muted">No students currently in the library.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(v => `
    <tr>
      <td><span class="font-mono text-cyan">${escapeHtml(v.studentnumber)}</span></td>
      <td><strong>${escapeHtml(v.fullname)}</strong></td>
      <td>${escapeHtml(v.schoolname)} (${escapeHtml(v.schoollevel || '')})</td>
      <td>${formatTime(v.checkintime)}</td>
      <td><span class="chip chip-cyan">${v.minutesinlibrary}m</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="checkoutVisit(${v.visitid}, '${escapeHtml(v.fullname)}')">
          Check Out
        </button>
      </td>
    </tr>
  `).join('');
}

function renderOverviewLoansTable(list) {
  const tbody = document.getElementById('tbody-overview-loans');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-muted">No items currently issued.</td></tr>';
    return;
  }

  tbody.innerHTML = list.slice(0, 6).map(l => `
    <tr>
      <td><span class="font-mono">${escapeHtml(l.assettag)}</span></td>
      <td><strong>${escapeHtml(l.titleormodel)}</strong></td>
      <td>${escapeHtml(l.fullname)}</td>
      <td>${formatDate(l.dateissued)}</td>
      <td>${l.isoverdue ? '<span class="chip chip-danger">OVERDUE</span>' : '<span class="chip chip-warn">ISSUED</span>'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="openReturnModal(${l.loanid})">Return</button>
      </td>
    </tr>
  `).join('');
}

function renderReceptionPresentTable(list) {
  const tbody = document.getElementById('tbody-reception-present');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-muted">No open visits. Library is empty.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(v => `
    <tr>
      <td>#${v.visitid}</td>
      <td>
        <strong>${escapeHtml(v.fullname)}</strong><br>
        <span class="font-mono text-muted text-sm">${escapeHtml(v.studentnumber)}</span>
      </td>
      <td>${escapeHtml(v.schoolname)}</td>
      <td>${formatTime(v.checkintime)}</td>
      <td><span class="chip chip-cyan">${v.minutesinlibrary} mins</span></td>
      <td>
        ${v.signaturepath ? `<img src="/${v.signaturepath}" class="sig-thumbnail" alt="Signature" title="Click to view signature" />` : '<span class="text-muted">—</span>'}
      </td>
      <td>${escapeHtml(v.checkinstaff || 'Reception')}</td>
      <td>
        <button class="btn btn-sm btn-danger-outline" onclick="checkoutVisit(${v.visitid}, '${escapeHtml(v.fullname)}')">
          Check Out
        </button>
      </td>
    </tr>
  `).join('');
}

function renderReceptionTodayTable(list) {
  const tbody = document.getElementById('tbody-reception-today');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-muted">No check-ins recorded today yet.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(v => `
    <tr>
      <td><span class="font-mono">${escapeHtml(v.studentnumber)}</span></td>
      <td><strong>${escapeHtml(v.fullname)}</strong></td>
      <td>${escapeHtml(v.schoolname)} (${escapeHtml(v.schoollevel || '')})</td>
      <td>${formatTime(v.checkintime)}</td>
      <td>${v.checkouttime ? formatTime(v.checkouttime) : '<span class="chip chip-cyan">INSIDE</span>'}</td>
      <td>${v.durationminutes} min</td>
      <td>${escapeHtml(v.checkinstaff || '')}</td>
      <td>
        ${v.signaturepath ? `<img src="/${v.signaturepath}" class="sig-thumbnail" alt="Signature" />` : '<span class="text-muted">—</span>'}
      </td>
    </tr>
  `).join('');
}

function renderCirculationLoansTable(list) {
  const tbody = document.getElementById('tbody-circulation-loans');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-muted">All library items are currently returned.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(l => `
    <tr>
      <td>#${l.loanid}</td>
      <td><span class="font-mono text-cyan">${escapeHtml(l.assettag)}</span></td>
      <td>
        <strong>${escapeHtml(l.titleormodel)}</strong><br>
        <small class="text-muted">${escapeHtml(l.itemtype)}</small>
      </td>
      <td>
        <strong>${escapeHtml(l.fullname)}</strong><br>
        <small class="font-mono text-muted">${escapeHtml(l.studentnumber)}</small>
      </td>
      <td>${escapeHtml(l.schoolname)}</td>
      <td>${formatDate(l.dateissued)}</td>
      <td>
        ${l.duedate ? formatDate(l.duedate) : '—'}
        ${l.isoverdue ? '<br><span class="chip chip-danger">OVERDUE</span>' : ''}
      </td>
      <td>${escapeHtml(l.conditionout || 'Good')}</td>
      <td>
        <button class="btn btn-sm btn-success" onclick="openReturnModal(${l.loanid})">Process Return</button>
      </td>
    </tr>
  `).join('');
}

function renderStudentsTable() {
  const tbody = document.getElementById('tbody-students-list');
  const countEl = document.getElementById('students-counter');
  if (!tbody) return;

  const searchInput = document.getElementById('students-search-input')?.value.toLowerCase() || '';
  const schoolFilter = document.getElementById('students-school-filter')?.value || '';

  const filtered = state.students.filter(s => {
    const matchSearch = s.fullname.toLowerCase().includes(searchInput) ||
                        s.studentnumber.toLowerCase().includes(searchInput);
    const matchSchool = !schoolFilter || String(s.schoolid) === String(schoolFilter);
    return matchSearch && matchSchool;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-muted">No students matching criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><span class="font-mono text-cyan">${escapeHtml(s.studentnumber)}</span></td>
      <td><strong>${escapeHtml(s.fullname)}</strong></td>
      <td>${escapeHtml(s.schoolname)}</td>
      <td>${escapeHtml(s.schoollevel || '—')}</td>
      <td>${escapeHtml(s.gender || '—')}</td>
      <td>
        ${s.has_open_visit ? '<span class="chip chip-cyan">IN LIBRARY</span>' :
          s.has_open_loan ? '<span class="chip chip-warn">HAS LOAN</span>' :
          '<span class="chip chip-neutral">ACTIVE</span>'}
      </td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-outline" onclick="openStudentHistory(${s.studentid})">History</button>
          ${!s.has_open_visit ? `
            <button class="btn btn-sm btn-primary" onclick="quickCheckinStudent(${s.studentid})">Check In</button>
          ` : `
            <button class="btn btn-sm btn-danger-outline" onclick="checkoutVisit(${s.active_visit_id}, '${escapeHtml(s.fullname)}')">Check Out</button>
          `}
        </div>
      </td>
    </tr>
  `).join('');
}

function renderItemsTable() {
  const tbody = document.getElementById('tbody-items-list');
  const countEl = document.getElementById('items-counter');
  if (!tbody) return;

  const typeFilter = document.getElementById('items-type-filter')?.value || '';
  const statusFilter = document.getElementById('items-status-filter')?.value || '';

  const filtered = state.items.filter(i => {
    const matchType = !typeFilter || i.itemtype === typeFilter;
    const matchStatus = !statusFilter || i.availabilitystatus === statusFilter;
    return matchType && matchStatus;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-muted">No items found matching filters.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(i => `
    <tr>
      <td><span class="font-mono text-cyan">${escapeHtml(i.assettag)}</span></td>
      <td><span class="chip chip-neutral">${escapeHtml(i.itemtype)}</span></td>
      <td><strong>${escapeHtml(i.titleormodel)}</strong></td>
      <td><span class="font-mono text-muted text-sm">${escapeHtml(i.serialnumber || '—')}</span></td>
      <td>${escapeHtml(i.itemcondition || 'Good')}</td>
      <td>
        ${i.availabilitystatus === 'AVAILABLE' ? '<span class="chip chip-success">AVAILABLE</span>' :
          i.availabilitystatus === 'ISSUED' ? '<span class="chip chip-warn">ISSUED</span>' :
          '<span class="chip chip-neutral">INACTIVE</span>'}
      </td>
      <td>
        ${i.borrowedby ? `<strong>${escapeHtml(i.borrowedby)}</strong><br><small class="text-muted font-mono">${escapeHtml(i.borrowernumber)}</small>` : '<span class="text-muted">—</span>'}
      </td>
      <td>
        ${i.availabilitystatus === 'AVAILABLE' ? `
          <button class="btn btn-sm btn-primary" onclick="quickIssueItem(${i.itemid})">Issue</button>
        ` : i.currentloanid ? `
          <button class="btn btn-sm btn-outline" onclick="openReturnModal(${i.currentloanid})">Return</button>
        ` : '—'}
      </td>
    </tr>
  `).join('');
}

function updateStudentDropdowns() {
  const checkinSelect = document.getElementById('checkin-student-select');
  const issueSelect = document.getElementById('issue-student-select');

  // For check-in: filter students not currently in library
  const availableForCheckin = state.students.filter(s => !s.has_open_visit);

  if (checkinSelect) {
    checkinSelect.innerHTML = '<option value="">-- Choose registered student --</option>' +
      availableForCheckin.map(s => `<option value="${s.studentid}">${escapeHtml(s.fullname)} (${escapeHtml(s.studentnumber)} - ${escapeHtml(s.schoolname)})</option>`).join('');
  }

  if (issueSelect) {
    issueSelect.innerHTML = '<option value="">-- Select student borrower --</option>' +
      state.students.map(s => `<option value="${s.studentid}">${escapeHtml(s.fullname)} (${escapeHtml(s.studentnumber)})</option>`).join('');
  }
}

function updateItemDropdowns() {
  const issueItemSelect = document.getElementById('issue-item-select');
  const availableItems = state.items.filter(i => i.availabilitystatus === 'AVAILABLE');

  if (issueItemSelect) {
    issueItemSelect.innerHTML = '<option value="">-- Select available resource --</option>' +
      availableItems.map(i => `<option value="${i.itemid}">[${escapeHtml(i.assettag)}] ${escapeHtml(i.titleormodel)} (${escapeHtml(i.itemtype)})</option>`).join('');
  }
}

// ================= SEARCH BARS =================
function setupSearchBars() {
  // Students filter in Directory
  document.getElementById('students-search-input')?.addEventListener('input', renderStudentsTable);
  document.getElementById('students-school-filter')?.addEventListener('change', renderStudentsTable);

  // Items filter in Inventory
  document.getElementById('items-type-filter')?.addEventListener('change', renderItemsTable);
  document.getElementById('items-status-filter')?.addEventListener('change', renderItemsTable);

  // Reception Instant Search Bar
  const receptionInput = document.getElementById('reception-search-input');
  const receptionResults = document.getElementById('reception-search-results');

  if (receptionInput && receptionResults) {
    receptionInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        receptionResults.classList.add('hidden');
        receptionResults.innerHTML = '';
        return;
      }

      const matches = state.students.filter(s =>
        s.fullname.toLowerCase().includes(q) ||
        s.studentnumber.toLowerCase().includes(q)
      ).slice(0, 6);

      if (matches.length === 0) {
        receptionResults.innerHTML = '<div class="search-item text-muted">No student found. Register them first.</div>';
        receptionResults.classList.remove('hidden');
        return;
      }

      receptionResults.innerHTML = matches.map(s => `
        <div class="search-item" onclick="selectStudentForCheckin(${s.studentid})">
          <div class="search-item-info">
            <strong>${escapeHtml(s.fullname)}</strong>
            <small>${escapeHtml(s.studentnumber)} • ${escapeHtml(s.schoolname)} (${escapeHtml(s.schoollevel || '')})</small>
          </div>
          <div>
            ${s.has_open_visit ? '<span class="chip chip-cyan">INSIDE</span>' : '<button class="btn btn-sm btn-primary">Check In</button>'}
          </div>
        </div>
      `).join('');
      receptionResults.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!receptionInput.contains(e.target) && !receptionResults.contains(e.target)) {
        receptionResults.classList.add('hidden');
      }
    });
  }
}

function selectStudentForCheckin(studentId) {
  document.getElementById('reception-search-results')?.classList.add('hidden');
  document.getElementById('reception-search-input').value = '';

  const student = state.students.find(s => s.studentid === studentId);
  if (!student) return;

  if (student.has_open_visit) {
    showToast(`${student.fullname} is already in the library!`, 'warn');
    return;
  }

  openModal('modal-checkin');
  const sel = document.getElementById('checkin-student-select');
  if (sel) sel.value = studentId;
}

// ================= DIGITAL SIGNATURE PAD =================
const signaturePads = {};

function setupSignaturePads() {
  initCanvasPad('checkin-signature-canvas', 'btn-clear-checkin-sig', 'checkin');
  initCanvasPad('issue-signature-canvas', 'btn-clear-issue-sig', 'issue');
}

function initCanvasPad(canvasId, clearBtnId, key) {
  const canvas = document.getElementById(canvasId);
  const clearBtn = document.getElementById(clearBtnId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let hasDrawn = false;

  // Set line styling
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e) {
    isDrawing = true;
    hasDrawn = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    e.preventDefault();
  }

  function draw(e) {
    if (!isDrawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  }

  function stopDraw(e) {
    if (isDrawing) {
      ctx.closePath();
      isDrawing = false;
    }
  }

  // Mouse
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  window.addEventListener('mouseup', stopDraw);

  // Touch
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  window.addEventListener('touchend', stopDraw);

  clearBtn?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
  });

  signaturePads[key] = {
    canvas,
    ctx,
    clear: () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawn = false;
    },
    getDataUrl: () => {
      return hasDrawn ? canvas.toDataURL('image/png') : null;
    },
  };
}

// ================= FORM HANDLERS =================
function setupForms() {
  // Check-In Form
  document.getElementById('form-checkin')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('checkin-student-select').value;
    const notes = document.getElementById('checkin-notes').value;
    const sigData = signaturePads['checkin']?.getDataUrl();

    if (!studentId) {
      showToast('Please select a student.', 'warn');
      return;
    }

    try {
      const res = await fetch('/api/visits/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: parseInt(studentId, 10),
          staffName: state.activeStaff,
          notes,
          signatureData: sigData,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to check in student.', 'error');
        return;
      }

      showToast(`Student checked in successfully at ${formatTime(data.visit.checkintime)}`, 'success');
      closeModal('modal-checkin');
      signaturePads['checkin']?.clear();
      document.getElementById('checkin-notes').value = '';

      // Reload
      await Promise.all([fetchStudents(), fetchPresentVisits(), fetchStats()]);
    } catch (err) {
      console.error('Checkin error:', err);
      showToast('Error during check-in.', 'error');
    }
  });

  // Issue Resource Form
  document.getElementById('form-issue')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = document.getElementById('issue-student-select').value;
    const itemId = document.getElementById('issue-item-select').value;
    const dueDate = document.getElementById('issue-due-date').value;
    const conditionOut = document.getElementById('issue-condition').value;
    const loanNotes = document.getElementById('issue-notes').value;
    const sigData = signaturePads['issue']?.getDataUrl();

    if (!studentId || !itemId) {
      showToast('Please select both student and item.', 'warn');
      return;
    }

    try {
      const res = await fetch('/api/loans/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: parseInt(studentId, 10),
          itemId: parseInt(itemId, 10),
          dueDate: dueDate || null,
          conditionOut,
          staffName: state.activeStaff,
          loanNotes,
          signatureData: sigData,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to issue item.', 'error');
        return;
      }

      showToast(`Resource "${data.itemTitle}" issued to ${data.studentName}`, 'success');
      closeModal('modal-issue');
      signaturePads['issue']?.clear();
      document.getElementById('issue-notes').value = '';

      await Promise.all([fetchItems(), fetchOpenLoans(), fetchStudents(), fetchStats()]);
    } catch (err) {
      console.error('Issue error:', err);
      showToast('Error issuing resource.', 'error');
    }
  });

  // Return Resource Form
  document.getElementById('form-return')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loanId = document.getElementById('return-loan-id').value;
    const conditionIn = document.getElementById('return-condition').value;
    const loanNotes = document.getElementById('return-notes').value;

    try {
      const res = await fetch(`/api/loans/return/${loanId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionIn,
          staffName: state.activeStaff,
          loanNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to process return.', 'error');
        return;
      }

      showToast('Item return recorded and inventory updated.', 'success');
      closeModal('modal-return');
      document.getElementById('return-notes').value = '';

      await Promise.all([fetchItems(), fetchOpenLoans(), fetchStudents(), fetchStats()]);
    } catch (err) {
      console.error('Return error:', err);
      showToast('Error recording item return.', 'error');
    }
  });

  // Register Student Form
  document.getElementById('form-register-student')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentNumber = document.getElementById('reg-student-number').value;
    const fullName = document.getElementById('reg-fullname').value;
    const schoolId = document.getElementById('reg-school').value;
    const schoolLevel = document.getElementById('reg-level').value;
    const gender = document.getElementById('reg-gender').value;
    const notes = document.getElementById('reg-notes').value;

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber,
          fullName,
          schoolId: parseInt(schoolId, 10),
          schoolLevel,
          gender,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to register student.', 'error');
        return;
      }

      showToast(`Student ${data.fullname} (${data.studentnumber}) registered!`, 'success');
      closeModal('modal-register-student');
      document.getElementById('form-register-student').reset();

      await fetchStudents();
      await fetchStats();
    } catch (err) {
      console.error('Register error:', err);
      showToast('Error registering student.', 'error');
    }
  });

  // Add Item Form
  document.getElementById('form-add-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const assetTag = document.getElementById('item-asset-tag').value;
    const itemType = document.getElementById('item-type').value;
    const titleOrModel = document.getElementById('item-title').value;
    const serialNumber = document.getElementById('item-serial').value;
    const itemCondition = document.getElementById('item-condition').value;
    const notes = document.getElementById('item-notes').value;

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetTag,
          itemType,
          titleOrModel,
          serialNumber,
          itemCondition,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to add asset.', 'error');
        return;
      }

      showToast(`Asset "${data.assettag}" added to catalog!`, 'success');
      closeModal('modal-add-item');
      document.getElementById('form-add-item').reset();

      await fetchItems();
      await fetchStats();
    } catch (err) {
      console.error('Add item error:', err);
      showToast('Error saving asset.', 'error');
    }
  });
}

// ================= MODAL & ACTION HELPERS =================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

async function checkoutVisit(visitId, studentName) {
  if (!confirm(`Confirm check-out for ${studentName || 'student'}?`)) return;

  try {
    const res = await fetch(`/api/visits/check-out/${visitId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: state.activeStaff }),
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to check out.', 'error');
      return;
    }

    showToast(`Checked out ${studentName || 'student'}. Time recorded.`, 'success');
    await Promise.all([fetchStudents(), fetchPresentVisits(), fetchStats()]);
  } catch (err) {
    console.error('Checkout error:', err);
    showToast('Error processing check-out.', 'error');
  }
}

function openReturnModal(loanId) {
  const loan = state.openLoans.find(l => l.loanid === loanId);
  if (!loan) return;

  document.getElementById('return-loan-id').value = loanId;
  const summaryEl = document.getElementById('return-summary-content');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="font-size:0.92rem;">
        <div><strong>Resource:</strong> [${escapeHtml(loan.assettag)}] ${escapeHtml(loan.titleormodel)}</div>
        <div><strong>Borrower:</strong> ${escapeHtml(loan.fullname)} (${escapeHtml(loan.studentnumber)})</div>
        <div><strong>Issued On:</strong> ${formatDate(loan.dateissued)} | <strong>Due:</strong> ${loan.duedate ? formatDate(loan.duedate) : '—'}</div>
        <div><strong>Issued Condition:</strong> ${escapeHtml(loan.conditionout || 'Good')}</div>
      </div>
    `;
  }

  openModal('modal-return');
}

function quickCheckinStudent(studentId) {
  openModal('modal-checkin');
  const sel = document.getElementById('checkin-student-select');
  if (sel) sel.value = studentId;
}

function quickIssueItem(itemId) {
  openModal('modal-issue');
  const sel = document.getElementById('issue-item-select');
  if (sel) sel.value = itemId;
}

async function openStudentHistory(studentId) {
  try {
    const res = await fetch(`/api/students/${studentId}`);
    const data = await res.json();
    if (!res.ok) return showToast('Error loading student profile.', 'error');

    document.getElementById('hist-student-name').textContent = data.student.fullname;
    document.getElementById('hist-student-sub').textContent =
      `${data.student.studentnumber} • ${data.student.schoolname} • ${data.student.schoollevel || 'Level not recorded'}`;

    // Visits table
    const tbodyVisits = document.getElementById('tbody-student-visits');
    if (tbodyVisits) {
      if (data.visits.length === 0) {
        tbodyVisits.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No visits recorded.</td></tr>';
      } else {
        tbodyVisits.innerHTML = data.visits.map(v => `
          <tr>
            <td>${formatDate(v.checkintime)}</td>
            <td>${formatTime(v.checkintime)}</td>
            <td>${v.checkouttime ? formatTime(v.checkouttime) : '<span class="chip chip-cyan">INSIDE</span>'}</td>
            <td>${escapeHtml(v.checkinstaff || '—')}</td>
            <td>
              ${v.signaturepath ? `<img src="/${v.signaturepath}" class="sig-thumbnail" alt="Sig" />` : '<span class="text-muted">—</span>'}
            </td>
          </tr>
        `).join('');
      }
    }

    // Loans table
    const tbodyLoans = document.getElementById('tbody-student-loans');
    if (tbodyLoans) {
      if (data.loans.length === 0) {
        tbodyLoans.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No loans recorded.</td></tr>';
      } else {
        tbodyLoans.innerHTML = data.loans.map(l => `
          <tr>
            <td><strong>[${escapeHtml(l.assettag)}]</strong> ${escapeHtml(l.titleormodel)}</td>
            <td>${formatDate(l.dateissued)}</td>
            <td>${l.duedate ? formatDate(l.duedate) : '—'}</td>
            <td>${l.datereturned ? formatDate(l.datereturned) : '<span class="chip chip-warn">CURRENTLY OUT</span>'}</td>
            <td>${escapeHtml(l.conditionout || 'Good')} / ${escapeHtml(l.conditionin || '—')}</td>
          </tr>
        `).join('');
      }
    }

    openModal('modal-student-history');
  } catch (err) {
    console.error('Student history error:', err);
  }
}

function switchHistTab(tabId) {
  document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.hist-tab-panel').forEach(p => p.classList.remove('active'));

  event.target.classList.add('active');
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
}

function exportData(table) {
  window.open(`/api/export/${table}`, '_blank');
  showToast(`Downloading ${table} data export...`, 'info');
}

// ================= TOASTS & UTILS =================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(50px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
