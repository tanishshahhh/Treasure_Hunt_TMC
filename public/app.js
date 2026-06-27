/* ══════════ STATE ══════════ */
const CLUE_COUNT = 7;
let localGameData = null;

let state = {
  session: 'morning',
  currentView: 'scoreboard',
  user: null, // { username, role }
};

function getGameData() {
  if (!localGameData) {
    return { teams: [] };
  }
  return localGameData;
}

function saveGameData(data) { 
  localGameData = data;
  fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).catch(err => console.error("Error saving data", err));
}

/* ══════════ AUTH ══════════ */
function initLogin() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim().toLowerCase();
    const p = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>Signing In...</span>';
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.success) {
        errEl.textContent = '';
        state.user = data.user;
        sessionStorage.setItem('tmc_user', JSON.stringify(state.user));
        showDashboard();
      } else {
        errEl.textContent = data.error || 'Invalid credentials';
      }
    } catch (err) {
      errEl.textContent = 'Server error. Please try again.';
    }
    btn.innerHTML = originalText;
  });
}

function checkSession() {
  const saved = sessionStorage.getItem('tmc_user');
  if (saved) { state.user = JSON.parse(saved); showDashboard(); }
}

function logout() {
  sessionStorage.removeItem('tmc_user');
  state.user = null;
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('vol-dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

/* ══════════ DASHBOARD INIT ══════════ */
function showDashboard() {
  const role = state.user.role;

  if (role === 'volunteer') {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('vol-dashboard').classList.remove('hidden');
    setupVolDash();
    renderVolView();
    return;
  }

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  // Role-based UI
  document.getElementById('role-badge').textContent = role.charAt(0).toUpperCase() + role.slice(1);
  document.getElementById('role-badge').className = 'role-badge ' + role;
  document.getElementById('role-user').textContent = state.user.username;

  // Hide admin-only nav
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = role === 'admin' ? '' : 'none';
  });

  setupSidebar();
  switchView('scoreboard');
  renderAll();
}

/* ══════════ SIDEBAR ══════════ */
function setupSidebar() {
  // Session toggle
  document.querySelectorAll('.session-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.session-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.session = btn.dataset.session;
      document.getElementById('session-indicator').querySelector('span').textContent =
        state.session === 'morning' ? 'Morning Session' : 'Afternoon Session';
      renderAll();
    });
  });

  // Nav links (buttons — no preventDefault needed)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      switchView(link.dataset.view);
    });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Mobile menu
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
  }));
}


function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === view);
  });
}

/* ══════════ VOLUNTEER MOBILE VIEW ══════════ */
function setupVolDash() {
  // Session toggle
  document.querySelectorAll('.vol-sess-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vol-sess-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.session = btn.dataset.session;
      renderVolView();
    });
  });
  // Logout
  document.getElementById('vol-logout-btn').addEventListener('click', logout);

  // Reset
  document.getElementById('vol-reset-btn').addEventListener('click', () => {
    openModal('Reset Scores', `<p>Are you sure you want to reset all team scores for the <strong>${state.session}</strong> session? This cannot be undone.</p>`, () => {
      const data = getGameData();
      data.teams.forEach(t => {
        t[state.session] = new Array(CLUE_COUNT).fill(false);
      });
      saveGameData(data);
      closeModal();
      renderAll();
      showToast(`Scores reset for ${state.session} session!`, 'success');
      broadcastUpdate();
    });
  });
}

function renderVolView() {
  const data = getGameData();
  const session = state.session;
  const teams = data.teams.map(t => ({
    ...t,
    score: t[session].filter(Boolean).length,
    clues: t[session],
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const container = document.getElementById('vol-teams');
  const isFirstLoad = container.children.length === 0;

  if (isFirstLoad) {
    container.innerHTML = teams.map((t, idx) => {
      const pct = t.score === 0 ? 0 : Math.round((t.score / CLUE_COUNT) * 100);
      const clueButtons = t.clues.map((done, i) => `
        <button class="vol-clue-btn ${done ? 'done' : ''}"
                data-team="${t.id}" data-clue="${i}"
                aria-label="Clue ${i+1} ${done ? 'completed' : 'pending'}">
          <span class="vol-clue-num">${i+1}</span>
          <span class="vol-clue-label">Clue</span>
          <svg class="vol-clue-check" width="20" height="20" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>`).join('');
      return `
        <div class="vol-team-card" data-tid="${t.id}" style="animation-delay:${idx*.06}s">
          <div class="vol-team-header">
            <div class="vol-team-name">${t.name}</div>
            <div class="vol-team-score">
              <span class="vol-score-num" data-vscore>${t.score}</span>
              <span class="vol-score-total">/${CLUE_COUNT}</span>
            </div>
          </div>
          <div class="vol-clues-grid">${clueButtons}</div>
          <div class="vol-progress-strip">
            <div class="vol-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');
    // Attach handlers once
    container.querySelectorAll('.vol-clue-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleClue(parseInt(btn.dataset.team), parseInt(btn.dataset.clue));
      });
    });
  } else {
    // Patch only what changed
    teams.forEach((t, idx) => {
      const card = container.querySelector(`[data-tid="${t.id}"]`);
      if (!card) return;
      const pct = t.score === 0 ? 0 : Math.round((t.score / CLUE_COUNT) * 100);
      const scoreEl = card.querySelector('[data-vscore]');
      if (scoreEl) scoreEl.textContent = t.score;
      card.querySelectorAll('.vol-clue-btn').forEach((btn, i) => {
        btn.classList.toggle('done', !!t.clues[i]);
        btn.setAttribute('aria-label', `Clue ${i+1} ${t.clues[i] ? 'completed' : 'pending'}`);
      });
      const fill = card.querySelector('.vol-progress-fill');
      if (fill) fill.style.width = `${pct}%`;
      // Re-sort
      container.appendChild(card);
    });
  }
}

/* ══════════ RENDER ALL ══════════ */
function renderAll() {
  if (state.user.role === 'volunteer') { renderVolView(); return; }
  renderScoreboard();
  renderProgress();
  if (state.user.role === 'admin') renderManage();
}

/* ══════════ SCOREBOARD ══════════ */
function renderScoreboard() {
  const data = getGameData();
  const session = state.session;
  const teams = data.teams.map(t => ({
    ...t,
    score: t[session].filter(Boolean).length,
    clues: t[session],
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const container = document.getElementById('scoreboard-container');
  const isFirstLoad = container.children.length === 0;

  if (isFirstLoad) {
    // Build full HTML once
    container.innerHTML = teams.map((t, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : '';
      const lastDone = t.clues.lastIndexOf(true);
      const fillPct = t.score === 0 ? 0 : (lastDone / (CLUE_COUNT - 1)) * 100;
      const dots = t.clues.map((done, di) => `
        <div class="sb-dot ${done ? 'done' : ''}" data-di="${di}" title="Clue ${di+1}">
          ${done
            ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<span>${di+1}</span>`}
        </div>`).join('');
      return `
        <div class="score-row animate-in ${rankClass}" data-tid="${t.id}" style="animation-delay:${i*.05}s">
          <div class="rank-num">${rank}</div>
          <div class="team-info">
            <div class="team-name">${t.name}</div>
            <div class="sb-track">
              <div class="sb-line-bg"></div>
              <div class="sb-line-fill" style="width:calc(${fillPct}% * ((100% - 40px)/100%) + ${fillPct > 0 ? 20 : 0}px)"></div>
              <div class="sb-dots">${dots}</div>
            </div>
          </div>
          <div class="score-cell">
            <div class="score-value" data-score>${t.score}<span class="score-denom">/${CLUE_COUNT}</span></div>
            <div class="score-label">clues</div>
          </div>
        </div>`;
    }).join('');
  } else {
    // Patch only changed values — no DOM rebuild
    teams.forEach((t, i) => {
      const row = container.querySelector(`[data-tid="${t.id}"]`);
      if (!row) return;
      // Update rank classes
      row.className = `score-row ${i < 3 ? 'rank-'+(i+1) : ''}`;
      // Update rank number
      const rankNumEl = row.querySelector('.rank-num');
      if (rankNumEl) rankNumEl.textContent = i + 1;
      // Update score number
      const scoreEl = row.querySelector('[data-score]');
      if (scoreEl) scoreEl.firstChild.textContent = t.score;
      // Update dots
      const lastDone = t.clues.lastIndexOf(true);
      const fillPct = t.score === 0 ? 0 : (lastDone / (CLUE_COUNT - 1)) * 100;
      row.querySelectorAll('.sb-dot').forEach((dot, di) => {
        dot.classList.toggle('done', !!t.clues[di]);
        dot.innerHTML = t.clues[di]
          ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
          : `<span>${di+1}</span>`;
      });
      // Update fill line
      const fill = row.querySelector('.sb-line-fill');
      if (fill) fill.style.width = `calc(${fillPct}% * ((100% - 40px)/100%) + ${fillPct > 0 ? 20 : 0}px)`;
    });
    // Re-sort rows in DOM by rank
    teams.forEach(t => {
      const row = container.querySelector(`[data-tid="${t.id}"]`);
      if (row) container.appendChild(row);
    });
  }
}

/* ══════════ PROGRESS ══════════ */
function renderProgress() {
  const data = getGameData();
  const session = state.session;
  const role = state.user.role;
  const canEdit = role === 'admin' || role === 'volunteer';

  const teams = data.teams.map(t => ({
    ...t,
    score: t[session].filter(Boolean).length,
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const container = document.getElementById('progress-container');
  const isFirstLoad = container.children.length === 0;

  if (isFirstLoad) {
    container.innerHTML = teams.map((t, idx) => {
      const clues = t[session];
      const lastDone = clues.lastIndexOf(true);
      const fillPct = t.score === 0 ? 0 : (lastDone / (CLUE_COUNT - 1)) * 100;
      const dots = clues.map((done, i) => `
        <div class="progress-dot-wrapper">
          <div class="progress-dot ${done ? 'completed' : ''} ${canEdit ? 'clickable' : ''}"
               data-team="${t.id}" data-clue="${i}" title="Clue ${i+1}">
            <span class="dot-num">${i+1}</span>
            <svg class="dot-check" width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <span class="progress-dot-label">Clue ${i+1}</span>
        </div>`).join('');
      return `
        <div class="progress-card animate-in" data-tid="${t.id}" style="animation-delay:${idx*.06}s">
          <div class="progress-card-header">
            <div class="progress-team-name">${t.name}</div>
            <div class="progress-score-chip" data-chip>${t.score}/${CLUE_COUNT}</div>
          </div>
          <div class="progress-track">
            <div class="progress-line-bg"></div>
            <div class="progress-line-fill" style="width:calc(${fillPct}% - 0px)"></div>
            <div class="progress-dots">${dots}</div>
          </div>
        </div>`;
    }).join('');
    // Attach handlers once
    if (canEdit) attachProgressHandlers(container);
  } else {
    // Patch only changed values
    teams.forEach((t, idx) => {
      const card = container.querySelector(`[data-tid="${t.id}"]`);
      if (!card) return;
      const clues = t[session];
      const lastDone = clues.lastIndexOf(true);
      const fillPct = t.score === 0 ? 0 : (lastDone / (CLUE_COUNT - 1)) * 100;
      // Score chip
      const chip = card.querySelector('[data-chip]');
      if (chip) chip.textContent = `${t.score}/${CLUE_COUNT}`;
      // Fill line
      const fill = card.querySelector('.progress-line-fill');
      if (fill) fill.style.width = `calc(${fillPct}% - 0px)`;
      // Dots
      card.querySelectorAll('.progress-dot').forEach((dot, i) => {
        dot.classList.toggle('completed', !!clues[i]);
      });
      // Re-sort
      container.appendChild(card);
    });
  }
}

function attachProgressHandlers(container) {
  container.querySelectorAll('.progress-dot.clickable').forEach(dot => {
    dot.addEventListener('click', () => {
      toggleClue(parseInt(dot.dataset.team), parseInt(dot.dataset.clue));
    });
  });
}

function toggleClue(teamId, clueIdx) {
  const data = getGameData();
  const team = data.teams.find(t => t.id === teamId);
  if (!team) return;

  const clues = team[state.session];
  const isMarking = !clues[clueIdx];

  // Enforce sequential completion
  if (isMarking) {
    if (clueIdx > 0 && !clues[clueIdx - 1]) {
      showToast(`Must complete Clue ${clueIdx} first!`, 'error');
      return;
    }
  } else {
    if (clueIdx < CLUE_COUNT - 1 && clues[clueIdx + 1]) {
      showToast(`Cannot unmark: Clue ${clueIdx + 2} is already completed!`, 'error');
      return;
    }
  }

  team[state.session][clueIdx] = isMarking;
  saveGameData(data);
  renderAll();
  const done = team[state.session][clueIdx];
  showToast(done ? `${team.name}: Clue ${clueIdx+1} completed!` : `${team.name}: Clue ${clueIdx+1} unmarked`, done ? 'success' : 'info');
  broadcastUpdate();
}

/* ══════════ MANAGE TEAMS ══════════ */
function renderManage() {
  const data = getGameData();
  const container = document.getElementById('manage-container');
  container.innerHTML = data.teams.map(t => {
    const mDone = t.morning.filter(Boolean).length;
    const aDone = t.afternoon.filter(Boolean).length;
    return `
      <div class="manage-row" style="animation-delay:${data.teams.indexOf(t) * .04}s">
        <div class="manage-team-name">${t.name}</div>
        <div class="manage-clue-count">AM: ${mDone}/${CLUE_COUNT} · PM: ${aDone}/${CLUE_COUNT}</div>
        <div class="manage-actions">
          <button class="btn-icon" onclick="editTeam(${t.id})" title="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon danger" onclick="deleteTeam(${t.id})" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');

  // Add team button
  document.getElementById('btn-add-team').onclick = () => openModal('Add Team', `
    <div class="input-group"><label>Team Name</label><input type="text" id="modal-team-name" placeholder="Enter team name"></div>
  `, () => {
    const name = document.getElementById('modal-team-name').value.trim();
    if (!name) return;
    const data = getGameData();
    const maxId = data.teams.reduce((m, t) => Math.max(m, t.id), 0);
    data.teams.push({ id: maxId + 1, name, morning: new Array(CLUE_COUNT).fill(false), afternoon: new Array(CLUE_COUNT).fill(false) });
    saveGameData(data);
    closeModal();
    renderAll();
    showToast(`${name} added!`, 'success');
    broadcastUpdate();
  });
}

window.editTeam = function(id) {
  const data = getGameData();
  const team = data.teams.find(t => t.id === id);
  if (!team) return;
  openModal('Edit Team', `
    <div class="input-group"><label>Team Name</label><input type="text" id="modal-team-name" value="${team.name}"></div>
  `, () => {
    const name = document.getElementById('modal-team-name').value.trim();
    if (!name) return;
    const d = getGameData();
    const t = d.teams.find(x => x.id === id);
    t.name = name;
    saveGameData(d);
    closeModal();
    renderAll();
    showToast('Team updated!', 'success');
    broadcastUpdate();
  });
};

window.deleteTeam = function(id) {
  const data = getGameData();
  const team = data.teams.find(t => t.id === id);
  if (!team) return;
  openModal('Delete Team', `<p>Are you sure you want to remove <strong>${team.name}</strong>?</p>`, () => {
    const d = getGameData();
    d.teams = d.teams.filter(t => t.id !== id);
    saveGameData(d);
    closeModal();
    renderAll();
    showToast(`${team.name} removed`, 'error');
    broadcastUpdate();
  });
};

/* ══════════ MODAL ══════════ */
function openModal(title, bodyHTML, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
    <button class="btn-modal-primary" id="modal-confirm-btn">Confirm</button>`;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-cancel-btn').onclick = closeModal;
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('modal-confirm-btn').onclick = onConfirm;
}
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

/* ══════════ TOAST ══════════ */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 2500);
}

/* ══════════ REAL-TIME SYNC ══════════ */
let bc;
let _isBroadcasting = false;

try { bc = new BroadcastChannel('tmc_hunt'); } catch(e) {}

function broadcastUpdate() {
  if (!bc) return;
  _isBroadcasting = true;
  bc.postMessage('update');
  setTimeout(() => { _isBroadcasting = false; }, 50);
}

async function fetchInitialData() {
  try {
    const res = await fetch('/api/data');
    localGameData = await res.json();
    if (state.user) renderAll();
  } catch (err) {
    console.error("Failed to load initial data", err);
  }
}

async function onExternalUpdate() {
  if (!state.user || _isBroadcasting) return;
  try {
    const res = await fetch('/api/data');
    const newData = await res.json();
    if (JSON.stringify(newData) !== JSON.stringify(localGameData)) {
      localGameData = newData;
      renderAll();
    }
  } catch (err) {}
}

if (bc) bc.onmessage = onExternalUpdate;

// Poll database every 5 seconds for other devices
setInterval(onExternalUpdate, 5000);

/* ══════════ INIT ══════════ */
document.addEventListener('DOMContentLoaded', () => {
  fetchInitialData();
  initLogin();
  checkSession();
});
