// Utility for dynamic dates
const today = new Date();
function getOffsetDateString(daysOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : 'https://fc-app-va3r.onrender.com';

const state = {
  currentUser: null,
  currentTeamId: 1,
  isCoach: false,
  isAdmin: false,
  selectedDate: null,
  currentMonthDate: new Date(today.getFullYear(), today.getMonth(), 1),
  currentView: 'calendar',
  teams: [],
  events: [],
  users: [],
  messages: [],
  notifications: [],
  lineupEventId: null
};

const appContent = document.getElementById('app-content');
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const reasonModal = document.getElementById('reason-modal');
const navCoachBtn = document.getElementById('nav-coach-btn');
const navAdminBtn = document.getElementById('nav-admin-btn');
const loginError = document.getElementById('login-error');

let tempDeclineId = null;
let tempEventId = null;

// Initial Data Fetch
async function initialFetch() {
  try {
    const res = await fetch(`${API_BASE}/api/data`);
    const data = await res.json();
    state.teams = data.teams || [];
    state.events = data.events;
    state.users = data.users;
    state.messages = data.messages || [];
    state.notifications = data.notifications || [];

    // Auto Login Check
    const savedUser = localStorage.getItem('training_app_user');
    if (savedUser) {
      document.getElementById('username-input').value = savedUser;
      document.getElementById('login-btn').click();
    }
  } catch (e) {
    console.error("Datenbank konnte nicht geladen werden", e);
  }
}

// Polling for auto-sync
let lastDataString = "";
async function syncData() {
  if (!state.currentUser) return; // don't sync if not logged in
  try {
    const res = await fetch(`${API_BASE}/api/data`);
    const data = await res.json();
    const currentDataString = JSON.stringify(data);
    if (currentDataString !== lastDataString) {
      lastDataString = currentDataString;
      state.teams = data.teams || [];
      state.events = data.events;
      state.users = data.users;
      state.messages = data.messages || [];
      state.notifications = data.notifications || [];

      // Only re-render if no modals are open and user is not typing
      if (reasonModal.style.display !== 'flex' && !document.activeElement.matches('input, select')) {
        renderCurrentView();
      }
      updateNotificationBadge();
    }
  } catch (e) { }
}
setInterval(syncData, 3000);

// Initialize App
initialFetch();

// Get filtered data based on user's team
function getTeamEvents() { return state.events.filter(e => e.teamId === state.currentTeamId); }
function getTeamUsers() { return state.users.filter(u => u.teamId === state.currentTeamId || (u.memberships && u.memberships.find(m => m.teamId === state.currentTeamId))); }
function getTeamMessages() { return state.messages.filter(m => m.teamId === state.currentTeamId); }
function getTeamNotifications() { return state.notifications.filter(n => n.teamId === state.currentTeamId); }

function getUserRole(u) {
  const membership = u.memberships?.find(m => m.teamId === state.currentTeamId);
  if (membership) return membership.role;
  return u.role;
}

function renderTeamSwitcher(user) {
  let switcherContainer = document.getElementById('team-switcher-container');
  if (!switcherContainer) {
    switcherContainer = document.createElement('div');
    switcherContainer.id = 'team-switcher-container';
    switcherContainer.style.marginRight = '1rem';
    
    const headerActions = document.querySelector('.header-actions');
    if (headerActions) {
      headerActions.insertBefore(switcherContainer, headerActions.firstChild);
    }
  }

  if (user.memberships && user.memberships.length > 1) {
    switcherContainer.innerHTML = `
      <select class="select-input" style="padding: 0.3rem 0.5rem; font-size: 0.8rem; margin: 0; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white;" onchange="switchTeam(this.value)">
        ${user.memberships.map(m => {
          const team = state.teams.find(t => t.id === m.teamId);
          return `<option value="${m.teamId}" ${m.teamId === state.currentTeamId ? 'selected' : ''} style="color: black;">${team ? team.name : 'Team '+m.teamId}</option>`;
        }).join('')}
      </select>
    `;
    switcherContainer.style.display = 'block';
  } else {
    switcherContainer.style.display = 'none';
  }
}

window.switchTeam = (teamId) => {
  state.currentTeamId = parseInt(teamId);
  updateRoleAndMenu();
  if (state.currentView === 'manage' && !state.isCoach) {
    state.currentView = 'calendar';
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="calendar"]').classList.add('active');
  }
  renderCurrentView();
};

// Login Logic
document.getElementById('login-btn').addEventListener('click', () => {
  const username = document.getElementById('username-input').value.trim();
  if (username) {
    const user = state.users.find(u => u.name.toLowerCase() === username.toLowerCase());

    if (user) {
      localStorage.setItem('training_app_user', user.name);

      state.currentUser = user.name;
      
      if (user.memberships && user.memberships.length > 0) {
        state.currentTeamId = user.memberships[0].teamId;
      } else {
        state.currentTeamId = user.teamId || 1;
      }

      window.updateRoleAndMenu = () => {
        const currentUser = state.users.find(u => u.name === state.currentUser);
        if (!currentUser) return;
        
        const membership = currentUser.memberships?.find(m => m.teamId === state.currentTeamId);
        if (membership) {
          state.isCoach = membership.role === 'coach' || membership.role === 'player_coach';
          state.isAdmin = membership.role === 'admin' || currentUser.role === 'admin';
        } else {
          state.isCoach = currentUser.role === 'coach';
          state.isAdmin = currentUser.role === 'admin';
        }
        
        navCoachBtn.style.display = state.isCoach ? 'block' : 'none';
        navAdminBtn.style.display = state.isAdmin ? 'block' : 'none';
        
        renderTeamSwitcher(currentUser);
      };

      loginError.style.display = 'none';
      updateRoleAndMenu();

      loginScreen.style.display = 'none';
      appContainer.style.display = 'flex';

      state.currentView = 'calendar';

      lastDataString = JSON.stringify({ teams: state.teams, events: state.events, users: state.users, messages: state.messages, notifications: state.notifications });

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-view="calendar"]').classList.add('active');

      renderCurrentView();
      updateNotificationBadge();
    } else {
      loginError.style.display = 'block';
    }
  }
});

window.logout = () => {
  localStorage.removeItem('training_app_user');
  location.reload();
};

// SVG Icons
const icons = {
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  calendar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`,
  mapPin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
  user: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
  chevronLeft: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`,
  chevronRight: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`
};

const formatMonthYear = (date) => date.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
const formatDateFull = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
};

// --- View Router ---
function renderCurrentView() {
  if (state.currentView === 'calendar') renderDashboardView();
  else if (state.currentView === 'team') renderTeamView();
  else if (state.currentView === 'notifications') renderNotificationsView();
  else if (state.currentView === 'stats') renderStatsView();
  else if (state.currentView === 'manage') renderCoachView();
  else if (state.currentView === 'admin') renderAdminView();
}

// --- Calendar HTML Gen ---
window.changeMonth = (delta) => {
  state.currentMonthDate.setMonth(state.currentMonthDate.getMonth() + delta);
  renderCurrentView();
};

window.selectDate = (dateStr) => {
  if (state.selectedDate === dateStr) {
    state.selectedDate = null;
  } else {
    state.selectedDate = dateStr;
  }
  renderCurrentView();
};

window.clearDateFilter = () => {
  state.selectedDate = null;
  renderCurrentView();
};

function generateCalendarHTML() {
  const year = state.currentMonthDate.getFullYear();
  const month = state.currentMonthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startingDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const monthDays = lastDay.getDate();
  const daysHTML = [];

  const daysOfWeek = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  daysOfWeek.forEach(d => daysHTML.push(`<div class="cal-day-header">${d}</div>`));

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = 0; i < startingDay; i++) {
    daysHTML.push(`<div class="cal-day other-month">${prevMonthLastDay - startingDay + i + 1}</div>`);
  }

  const todayStr = getOffsetDateString(0);
  const teamEvents = getTeamEvents();

  for (let i = 1; i <= monthDays; i++) {
    const d = new Date(year, month, i);
    const dateStr = [d.getFullYear(), ('0' + (d.getMonth() + 1)).slice(-2), ('0' + d.getDate()).slice(-2)].join('-');

    let classes = 'cal-day';
    if (dateStr === todayStr) classes += ' today';
    if (dateStr === state.selectedDate) classes += ' active';

    const dayEvents = teamEvents.filter(e => e.date === dateStr);
    let dotsHTML = '';
    if (dayEvents.length > 0) {
      dotsHTML = '<div class="cal-dots">';
      dayEvents.forEach(e => {
        if (e.isCanceled) dotsHTML += `<div class="cal-dot" style="background: var(--danger);"></div>`;
        else dotsHTML += `<div class="cal-dot dot-${e.type}"></div>`;
      });
      dotsHTML += '</div>';
    }

    daysHTML.push(`<div class="${classes}" onclick="selectDate('${dateStr}')">${i}${dotsHTML}</div>`);
  }

  const totalCells = startingDay + monthDays;
  for (let i = 1; i <= (42 - totalCells); i++) {
    daysHTML.push(`<div class="cal-day other-month">${i}</div>`);
  }

  return `
    <div class="calendar-wrapper">
      <div class="calendar-controls">
        <button class="cal-btn" onclick="changeMonth(-1)">${icons.chevronLeft}</button>
        <div class="calendar-month">${formatMonthYear(state.currentMonthDate)}</div>
        <button class="cal-btn" onclick="changeMonth(1)">${icons.chevronRight}</button>
      </div>
      <div class="calendar-grid">
        ${daysHTML.join('')}
      </div>
    </div>
  `;
}

// --- Info Kanal ---
function generateInfoKanalHTML() {
  let messagesHTML = '';
  const teamMessages = getTeamMessages();
  teamMessages.forEach(m => {

    let reactionsHTML = '';
    const emojis = ["👍", "❤️", "🔥"];
    emojis.forEach(emoji => {
      const usersReacted = m.reactions && m.reactions[emoji] ? m.reactions[emoji] : [];
      const hasReacted = usersReacted.includes(state.currentUser);
      const count = usersReacted.length;

      reactionsHTML += `
        <button class="reaction-btn ${hasReacted ? 'active' : ''}" onclick="reactMessage(${m.id}, '${emoji}')">
          ${emoji} ${count > 0 ? `<span class="reaction-count">${count}</span>` : ''}
        </button>
      `;
    });

    messagesHTML += `
      <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0.5rem; margin-bottom: 0.75rem; border-left: 3px solid var(--primary); position: relative;">
        <p style="margin-bottom: 0.5rem; color: white;">${m.text}</p>
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          ${reactionsHTML}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
          <span>${icons.user} ${m.author} (Coach)</span>
          <span>
            ${new Date(m.date).toLocaleDateString('de-CH', { hour: '2-digit', minute: '2-digit' })} Uhr
            ${state.isCoach ? `<button onclick="deleteMessage(${m.id})" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left: 10px;" title="Löschen">${icons.trash}</button>` : ''}
          </span>
        </div>
      </div>
    `;
  });
  if (teamMessages.length === 0) messagesHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Keine Infos vorhanden.</p>';

  let coachInputHTML = '';
  if (state.isCoach) {
    coachInputHTML = `
      <div style="display:flex; gap: 0.5rem; margin-top: 1rem;">
        <input type="text" id="new-msg-input" class="text-input" style="margin-bottom: 0;" placeholder="Wichtige Info an das Team...">
        <button class="btn btn-primary" onclick="sendMessage()">Senden</button>
      </div>
    `;
  }

  return `
    <div class="glass-panel" style="margin-top: 2rem;">
      <h3 style="margin-bottom: 1rem; color: var(--primary); display:flex; align-items:center; gap: 0.5rem;">${icons.info} Info-Kanal vom Trainer</h3>
      <div style="max-height: 250px; overflow-y: auto; padding-right: 0.5rem;">
        ${messagesHTML}
      </div>
      ${coachInputHTML}
    </div>
  `;
}

// --- Dashboard View ---
function renderDashboardView() {
  const myTeam = state.teams.find(t => t.id === state.currentTeamId);
  const teamName = myTeam ? myTeam.name : "";

  appContent.innerHTML = `
    <div class="section-header" style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2>Hallo, ${state.currentUser} 👋</h2>
        <p>Deine Übersicht für ${teamName}.</p>
      </div>
      <button class="btn" style="background: transparent; border: 1px solid var(--surface-border); color: var(--text-muted); padding: 0.4rem 0.8rem; font-size: 0.85rem; display:flex; gap:0.5rem; align-items:center;" onclick="logout()">
        ${icons.logout} Abmelden
      </button>
    </div>
    <div class="split-view">
      <div class="left-col">
        <div class="glass-panel">
          <h3 style="margin-bottom: 1.5rem; font-weight: 600;">Kalender</h3>
          ${generateCalendarHTML()}
        </div>
        ${generateInfoKanalHTML()}
      </div>
      <div class="right-col">
        ${generateEventListsHTML()}
      </div>
    </div>
  `;
}

function getUserStatusForEvent(event) {
  if (state.isAdmin) return { status: 'none', reason: '' };
  const p = event.playerDetails.find(pd => pd.name === state.currentUser);
  if (p) return p;
  // Everyone is auto-enrolled (opt-out system)
  return { status: 'yes', reason: '' };
}

function generateEventCardHTML(event, isCoachView = false) {
  const userState = getUserStatusForEvent(event);

  // Calculate attendees and declined dynamically
  const allTeamMembers = getTeamUsers().filter(u => getUserRole(u) !== 'admin');
  const coaches = allTeamMembers.filter(u => getUserRole(u) === 'coach');
  const declined = event.playerDetails.filter(p => p.status === 'no');
  const declinedNames = declined.map(p => p.name);
  const attendees = allTeamMembers.filter(u => !declinedNames.includes(u.name) && getUserRole(u) !== 'coach').map(u => ({ name: u.name, status: 'yes' }));

  let statusBadge = '';
  if (event.isCanceled) {
    statusBadge = '<span class="status-badge status-no" style="font-size:0.9rem;">ABGESAGT</span>';
  } else {
    if (userState.status === 'yes') statusBadge = '<span class="status-badge status-yes">Angemeldet</span>';
    else if (userState.status === 'no') statusBadge = '<span class="status-badge status-no">Abgemeldet</span>';
  }

  let interactionHTML = '';
  if (!isCoachView) {
    if (state.isCoach) {
      // Coach dashboard interactions
      if (event.isCanceled) {
        interactionHTML = `<div class="user-status-msg msg-no" style="margin-top: 1.5rem;">🚫 Dieser Termin wurde abgesagt.</div>`;
      } else {
        if (userState.status === 'yes') {
          interactionHTML = `
              <div class="action-buttons" style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-warning" style="flex: 1;" onclick="promptDecline(${event.id})">Abmelden</button>
                <button class="btn btn-danger" style="flex: 1;" onclick="cancelEvent(${event.id})">${icons.x} Termin absagen</button>
              </div>
            `;
        } else if (userState.status === 'no') {
          interactionHTML = `
              <div class="user-status-msg msg-no" style="margin-top: 1.5rem; margin-bottom: 0.5rem;">${icons.x} Abgemeldet<br><span style="font-size:0.8em;">Grund: ${userState.reason}</span></div>
              <div class="action-buttons" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-success" style="flex: 1;" onclick="confirmYes(${event.id})">${icons.check} Wieder anmelden</button>
                <button class="btn btn-danger" style="flex: 1;" onclick="cancelEvent(${event.id})">${icons.x} Termin absagen</button>
              </div>
            `;
        }
      }
    } else {
      // Player dashboard interactions
      if (event.isCanceled) {
        interactionHTML = `<div class="user-status-msg msg-no" style="margin-top: 1.5rem;">🚫 Dieses Event wurde abgesagt.</div>`;
      } else {
        if (userState.status === 'yes') {
          interactionHTML = `
              <div class="action-buttons" style="margin-top: 1.5rem;">
                <button class="btn btn-danger" onclick="promptDecline(${event.id})">Abmelden</button>
              </div>
            `;
        } else if (userState.status === 'no') {
          interactionHTML = `
              <div class="user-status-msg msg-no" style="margin-top: 1.5rem; margin-bottom: 0.5rem;">${icons.x} Abgemeldet<br><span style="font-size:0.8em;">Grund: ${userState.reason}</span></div>
              <div class="action-buttons">
                <button class="btn btn-success" onclick="confirmYes(${event.id})">${icons.check} Wieder anmelden</button>
              </div>
            `;
        }
      }
    }
  }

  let statsHTML = '';
  if (isCoachView) {
    statsHTML = `
        <div class="participant-list">
          <details style="margin-bottom: 1rem;">
            <summary style="display:flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem; user-select: none;">
              <h4 style="color: var(--success); margin: 0;">✅ Angemeldet (${attendees.length})</h4>
              <span style="color: var(--text-muted); font-size: 0.8rem;">Anzeigen ▼</span>
            </summary>
            <div style="padding-top: 1rem;">
              ${attendees.map(p => `
                <div class="player-row" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2);">
                  <span style="font-weight: 600;">${p.name}</span>
                  ${!event.isCanceled ? `<button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="coachUpdateStatus(${event.id}, '${p.name}', 'no', 'Vom Trainer abgemeldet')">Abwesend</button>` : ''}
                </div>
              `).join('')}
              ${attendees.length === 0 ? '<p style="color:var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Noch keine Zusagen.</p>' : ''}
            </div>
          </details>
          
          <details>
            <summary style="display:flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem; user-select: none;">
              <h4 style="color: var(--danger); margin: 0;">❌ Abgemeldet (${declined.length})</h4>
              <span style="color: var(--text-muted); font-size: 0.8rem;">Anzeigen ▼</span>
            </summary>
            <div style="padding-top: 1rem;">
              ${declined.map(p => `
                <div class="player-row" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.3); display: block;">
                  <div style="display:flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 600; font-size: 1.1em;">${p.name}</div>
                    ${!event.isCanceled ? `
                      <button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="coachUpdateStatus(${event.id}, '${p.name}', 'pending', '')">Anwesend setzen</button>
                    ` : ''}
                  </div>
                  <div style="font-size: 0.9em; color: var(--danger); margin-top: 4px; padding: 4px; background: rgba(239, 68, 68, 0.1); border-radius: 4px;">
                    <strong>Grund:</strong> ${p.reason || 'Kein Grund angegeben'}
                  </div>
                </div>
              `).join('')}
              ${declined.length === 0 ? '<p style="color:var(--text-muted); font-size: 0.9rem;">Noch keine Abmeldungen.</p>' : ''}
            </div>
          </details>
        </div>
      `;
  } else if (!state.isCoach) {
    statsHTML = `
        <div class="participant-stats" style="margin-top: 1rem; margin-bottom: 0;">
          <div class="stat-pill">✅ ${attendees.length} Dabei</div>
          <div class="stat-pill">❌ ${declined.length} Abwesend</div>
        </div>
      `;
  }

  let resultHTML = '';
  if (event.type === 'Spiel' && !event.isCanceled) {
    let eventsListHTML = '';
    if (event.matchEvents && event.matchEvents.length > 0) {
      const sortedEvents = [...event.matchEvents].sort((a, b) => a.minute - b.minute);
      eventsListHTML = '<div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.25rem;">';
      sortedEvents.forEach(me => {
        let icon = me.type === 'goal' ? '⚽️' : me.type === 'yellow' ? '🟨' : '🟥';
        eventsListHTML += `<div style="font-size: 0.85rem; color: var(--text-muted);"><b>${me.minute}'</b> ${icon} ${me.player}</div>`;
      });
      eventsListHTML += '</div>';
    }

    if (isCoachView || state.currentView === 'calendar') {
      if (state.isCoach) {
        resultHTML = `
            <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem; border: 1px solid var(--surface-border);">
              ${event.result && event.result.isPlayed
            ? `<h4 style="color: var(--text-muted); margin-bottom: 0.5rem; font-size: 0.9rem; text-align: center;">Endresultat</h4>
                   <div style="font-weight: bold; font-size: 1.8rem; color: white; text-align: center;">${event.result.home || 0} : ${event.result.away || 0}</div>
                   ${eventsListHTML}
                   <button class="btn btn-warning" style="margin-top: 1rem; width: 100%;" onclick="openMatchReportModal(${event.id})">📝 Spielbericht bearbeiten</button>`
            : `${event.matchEvents && event.matchEvents.length > 0 ? `
                     <h4 style="color: var(--danger); margin-bottom: 0.5rem; font-size: 0.9rem; text-align: center;">🔴 LIVE Zwischenstand</h4>
                     <div style="font-weight: bold; font-size: 1.8rem; color: white; text-align: center;">${event.result?.home || 0} : ${event.result?.away || 0}</div>
                     ${eventsListHTML}
                   ` : ''}
                   <button class="btn btn-warning" style="${event.matchEvents && event.matchEvents.length > 0 ? 'margin-top: 1rem;' : ''} width: 100%;" onclick="openMatchReportModal(${event.id})">⚽️ Live-Ereignisse & Spielbericht</button>`
          }
            </div>
          `;
      } else if (event.result && (event.result.isPlayed || (event.matchEvents && event.matchEvents.length > 0) || event.result.home !== null)) {
        let isLive = !event.result.isPlayed;
        resultHTML = `
            <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem; text-align: center; border: 1px solid var(--surface-border);">
              <h4 style="color: ${isLive ? 'var(--danger)' : 'var(--text-muted)'}; margin-bottom: 0.5rem; font-size: 0.9rem;">${isLive ? '🔴 LIVE Zwischenstand' : 'Endresultat'}</h4>
              <span style="font-weight: bold; font-size: 1.8rem; color: white;">${event.result.home || 0} : ${event.result.away || 0}</span>
              ${eventsListHTML}
            </div>
          `;
      }
    }
  }

  let motmHTML = '';
  if (event.type === 'Spiel' && !event.isCanceled) {
    if (event.motm) {
      motmHTML = `
          <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255, 215, 0, 0.1); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 0.5rem; text-align: center;">
            <h4 style="color: gold; margin-bottom: 0.5rem; font-size: 0.9rem;">🏆 Spieler des Spiels</h4>
            <span style="font-weight: bold; font-size: 1.2rem; color: white;">${event.motm}</span>
          </div>
        `;
    }
    if (state.isCoach && (isCoachView || state.currentView === 'calendar')) {
      const players = getTeamUsers().filter(u => getUserRole(u) === 'player');
      motmHTML += `
          <div style="margin-top: 1rem; padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem;">
            <label style="font-size: 0.8rem; color: var(--text-muted); display:block; margin-bottom:0.25rem;">Spieler des Spiels wählen:</label>
            <select class="select-input" onchange="setMotm(${event.id}, this.value)" style="margin-bottom: 0; padding: 0.4rem; font-size: 0.8rem;">
              <option value="">-- Niemand --</option>
              ${players.map(p => `<option value="${p.name}" ${event.motm === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
        `;
    }
  }

  const isLocationUrl = event.location.startsWith('http://') || event.location.startsWith('https://');
  const mapLink = isLocationUrl ? event.location : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;
  const displayLocation = isLocationUrl ? 'Link öffnen' : `Auf Karte ansehen (${event.location})`;
  const cardStyle = event.isCanceled ? 'opacity: 0.7; border-color: var(--danger);' : '';

  return `
      <div class="event-card" id="event-${event.id}" style="${cardStyle}">
        <div class="event-header">
          <div>
            <span class="event-type-badge badge-${event.type}">${event.type}</span>
            ${event.isCanceled && isCoachView ? '<span class="status-badge status-no" style="margin-left: 0.5rem;">ABGESAGT</span>' : ''}
            <h3 style="${event.isCanceled ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${event.title}</h3>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
            ${!isCoachView && !state.isCoach ? statusBadge : ''}
            ${isCoachView && !event.isCanceled ? `<button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="cancelEvent(${event.id})">${icons.x} Termin absagen</button>` : ''}
            ${(state.isAdmin || (state.isCoach && isCoachView)) && event.isCanceled ? `<button class="btn btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="adminDeleteEvent(${event.id})">🗑️ Komplett löschen</button>` : ''}
          </div>
        </div>
        <div class="event-info">
          <p>${icons.calendar} ${formatDateFull(event.date)} | ${event.time}</p>
          <p>${icons.clock} Treffpunkt: <strong style="color:var(--primary); margin-left: 4px;">${event.meetingTime || 'Nicht angegeben'}</strong></p>
          <p>${icons.mapPin} <a href="${mapLink}" target="_blank" style="color:var(--success); text-decoration:none; margin-left: 4px;">${displayLocation}</a></p>
          <p style="margin-top: 0.5rem;">${icons.user} Trainer: ${coaches.filter(u => !declinedNames.includes(u.name)).map(u => u.name).join(' & ') || 'Kein Trainer anwesend'}</p>
        </div>
        
        ${resultHTML}
        ${motmHTML}
        ${interactionHTML}
        ${statsHTML}
      </div>
    `;
}

function generateEventListsHTML() {
  let eventsToShow = getTeamEvents();
  let headerHTML = `<div class="list-header"><h3>Was als Nächstes ansteht</h3></div>`;

  if (state.selectedDate) {
    eventsToShow = eventsToShow.filter(e => e.date === state.selectedDate);
    headerHTML = `
      <div class="list-header">
        <h3>Events am ${formatDateFull(state.selectedDate)}</h3>
        <button class="filter-reset-btn" onclick="clearDateFilter()">Alle zeigen</button>
      </div>
    `;
  } else {
    // Hide past events by default
    const todayStr = getOffsetDateString(0);
    eventsToShow = eventsToShow.filter(e => e.date >= todayStr);
  }

  // Sort strictly by date, then by time
  eventsToShow.sort((a, b) => {
    if (a.date === b.date) {
      return (a.time || "").localeCompare(b.time || "");
    }
    return a.date.localeCompare(b.date);
  });

  if (eventsToShow.length === 0) {
    return headerHTML + `<div class="no-events">Keine Termine gefunden.</div>`;
  }

  let html = headerHTML;
  eventsToShow.forEach(e => html += generateEventCardHTML(e));
  return html;
}

// --- Notifications View ---
function renderNotificationsView() {
  let notificationsHTML = '';
  const teamNotifs = getTeamNotifications();
  teamNotifs.forEach(n => {
    notificationsHTML += `
      <div style="background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 1rem; display: flex; align-items: flex-start; gap: 1rem; border: 1px solid var(--surface-border);">
        <div style="font-size: 2rem; background: rgba(255,255,255,0.1); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; flex: none;">
          ${n.icon}
        </div>
        <div>
          <h4 style="color: white; margin-bottom: 0.5rem; font-size: 1.1rem;">${n.text}</h4>
          <span style="font-size: 0.85rem; color: var(--text-muted);">${new Date(n.date).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })} Uhr</span>
        </div>
      </div>
    `;
  });

  if (teamNotifs.length === 0) {
    notificationsHTML = '<div class="glass-panel"><p style="color:var(--text-muted); text-align:center;">Noch keine Benachrichtigungen.</p></div>';
  }

  appContent.innerHTML = `
    <div class="section-header" style="margin-bottom: 2rem;">
      <div>
        <h2>Benachrichtigungen 🔔</h2>
        <p>Alle wichtigen Updates auf einen Blick.</p>
      </div>
    </div>
    <div style="max-width: 800px; margin: 0 auto;">
      ${notificationsHTML}
    </div>
  `;

  localStorage.setItem('last_notif_count_' + state.currentUser, teamNotifs.length);
  updateNotificationBadge();
}

function updateNotificationBadge() {
  if (!state.currentUser) return;
  const notifs = getTeamNotifications();
  const lastCount = parseInt(localStorage.getItem('last_notif_count_' + state.currentUser)) || 0;
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.style.display = (notifs.length > lastCount) ? 'block' : 'none';
  }
}

// --- Team / Lineup View ---
window.changeLineupEvent = (eventId) => {
  state.lineupEventId = parseInt(eventId);
  renderCurrentView();
};

window.clearLineupSelection = () => {
  state.lineupEventId = null;
  renderCurrentView();
};

window.togglePublishLineup = () => {
  const selectedMatch = getTeamEvents().find(m => m.id === state.lineupEventId);
  if (!selectedMatch) return;

  const isCurrentlyPublished = selectedMatch.lineup.isPublished;

  if (!isCurrentlyPublished) {
    if (!confirm("Bist du sicher? Die Aufstellung wird jetzt für alle Spieler sichtbar!")) return;
  } else {
    if (!confirm("Möchtest du die Aufstellung wieder verbergen?")) return;
  }

  selectedMatch.lineup.isPublished = !isCurrentlyPublished;
  saveLineup();
};

function renderTeamView() {
  const isCoach = state.isCoach;

  const matches = getTeamEvents().filter(e => e.type === 'Spiel' && !e.isCanceled).sort((a, b) => a.date.localeCompare(b.date));

  if (matches.length === 0) {
    appContent.innerHTML = `<div class="section-header"><h2>Mannschaft & Aufstellung</h2><p>Es sind aktuell keine Spiele geplant (oder alle wurden abgesagt).</p></div>`;
    return;
  }

  if (!state.lineupEventId) {
    const todayStr = getOffsetDateString(0);
    const upcoming = matches.filter(m => m.date >= todayStr);
    const past = matches.filter(m => m.date < todayStr).sort((a,b) => b.date.localeCompare(a.date)); // past matches newest first

    const renderGrid = (list) => {
      if (list.length === 0) return '<p style="color:var(--text-muted); margin-bottom: 2rem;">Keine Spiele vorhanden.</p>';
      return `
        <div class="match-grid">
          ${list.map(m => {
            const isPub = m.lineup && m.lineup.isPublished;
            const isUnpublishedForPlayer = (!isCoach && !isPub);
            const cardStyle = isUnpublishedForPlayer ? 'opacity: 0.5; pointer-events: none;' : '';
            return `
            <div class="match-square-card" onclick="changeLineupEvent(${m.id})" style="${cardStyle}">
              <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚽️</div>
              <h4>${m.title}</h4>
              <p>${formatDateFull(m.date)}</p>
            </div>
            `;
          }).join('')}
        </div>
      `;
    };

    appContent.innerHTML = `
      <div class="section-header" style="margin-bottom: 2rem;">
        <h2>Spiele & Aufstellungen</h2>
        <p>Wähle ein Spiel aus, um die Aufstellung zu sehen oder zu bearbeiten.</p>
      </div>
      
      <h3 style="margin-bottom: 1rem; color: var(--primary);">Kommende Spiele</h3>
      ${renderGrid(upcoming)}

      <h3 style="margin-bottom: 1rem; color: var(--text-muted);">Vergangene Spiele</h3>
      ${renderGrid(past)}
    `;
    return;
  }

  const selectedMatch = matches.find(m => m.id === state.lineupEventId);
  if (!selectedMatch) {
    state.lineupEventId = null;
    renderCurrentView();
    return;
  }

  const allTeamMembers = getTeamUsers().filter(u => getUserRole(u) !== 'admin');
  const declinedNames = selectedMatch.playerDetails.filter(p => p.status === 'no').map(p => p.name);
  const attendingPlayers = allTeamMembers.filter(u => !declinedNames.includes(u.name) && getUserRole(u) === 'player');

  const coaches = getTeamUsers().filter(u => getUserRole(u) === 'coach');

  // Get lineup for this specific match
  if (!selectedMatch.lineup) selectedMatch.lineup = { isPublished: false, pitchPlayers: [], bench: [], captain: "" };
  const currentLineup = selectedMatch.lineup;

  let matchSelectorHTML = `
    <div style="margin-bottom: 2rem;">
      <button class="btn" style="background: rgba(255,255,255,0.1); color: white;" onclick="clearLineupSelection()">⬅ Zurück zur Spielübersicht</button>
      <h3 style="margin-top: 1rem; color: white;">Aufstellung für: <span style="color:var(--primary);">${selectedMatch.title}</span></h3>
    </div>
  `;

  let rosterHTML = `
    <div class="glass-panel" style="margin-bottom: 2rem;">
      ${matchSelectorHTML}
      
      <h3 style="margin-bottom: 1rem; color: var(--warning);">Trainer-Staff</h3>
      <div class="participant-list" style="border:none; padding:0; margin:0 0 2rem 0;">
        ${coaches.map(u => `
          <div class="player-row" style="background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.3);">
            <span>${u.name}</span>
          </div>
        `).join('')}
      </div>

      <h3 style="margin-bottom: 1.5rem; color: var(--success);">Verfügbare Spieler (${attendingPlayers.length})</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
        Es werden nur Spieler angezeigt, die für dieses Spiel (noch) zugesagt haben.
        ${isCoach ? '<br><b>Tipp:</b> Ziehe Spieler per Drag & Drop auf das Spielfeld!' : ''}
      </p>
      <div class="participant-list" style="border:none; padding:0; margin:0;">
        ${attendingPlayers.map(u => {
    const isOnPitch = currentLineup.pitchPlayers.find(p => p.name === u.name);
    const isOnBench = currentLineup.bench.includes(u.name);
    if (isOnPitch || isOnBench) return '';

    return `
          <div class="player-row draggable-player" 
               draggable="${isCoach ? 'true' : 'false'}" 
               ondragstart="event.dataTransfer.setData('name', '${u.name}')"
               style="background: rgba(255,255,255,0.05); border: 1px solid var(--surface-border); cursor: ${isCoach ? 'grab' : 'default'};">
            <span>${u.name}</span>
            ${isCoach ? `
              <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="startPlacingPlayer('${u.name}')">Auf's Feld</button>
                <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; background: rgba(255,255,255,0.1); color:white;" onclick="addToLineup('${u.name}', 'bench')">+ Bank</button>
              </div>
            ` : ''}
          </div>
          `;
  }).join('')}
        ${attendingPlayers.length === 0 ? '<p style="color:var(--text-muted);">Keine Zusagen bisher.</p>' : ''}
      </div>
    </div>
  `;

  let lineupHTML = '';
  if (!isCoach && !currentLineup.isPublished) {
    lineupHTML = `
      <div class="glass-panel" style="text-align: center; padding: 4rem 2rem;">
        <h3 style="color: var(--text-muted);">Aufstellung nicht verfügbar</h3>
        <p style="color: var(--text-muted); margin-top: 1rem;">Der Trainer hat die Aufstellung für dieses Spiel noch nicht veröffentlicht.</p>
      </div>
    `;
  } else {
    let captainSelect = `<p style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 0.5rem;">Captain: <b>${currentLineup.captain ? '👑 ' + currentLineup.captain : 'Nicht bestimmt'}</b></p>`;
    if (isCoach) {
      const allLineupPlayers = [...currentLineup.pitchPlayers.map(p => p.name), ...currentLineup.bench];
      captainSelect = `
        <div class="form-group" style="margin-top: 1.5rem;">
          <label>Captain bestimmen</label>
          <select class="select-input" onchange="setCaptain(this.value)" style="margin-bottom: 0;">
            <option value="">-- Keiner --</option>
            ${allLineupPlayers.map(p => `
              <option value="${p}" ${currentLineup.captain === p ? 'selected' : ''}>${p}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    let pitchPlayersHTML = currentLineup.pitchPlayers.map(p => `
      <div class="pitch-player draggable-player" 
           draggable="${isCoach ? 'true' : 'false'}" 
           ondragstart="event.dataTransfer.setData('name', '${p.name}')"
           onclick="if(isCoach) { event.stopPropagation(); startPlacingPlayer('${p.name}'); }"
           style="left: ${p.x}%; top: ${p.y}%;">
        ${p.name} ${p.name === currentLineup.captain ? '👑' : ''}
        ${isCoach ? `<button class="remove-btn" onclick="event.stopPropagation(); removeFromLineup('${p.name}')">×</button>` : ''}
      </div>
    `).join('');

    let pitchHTML = `
      ${window.placingPlayer ? `
        <div style="background: var(--primary); color: white; padding: 0.75rem; text-align: center; border-radius: 0.5rem; margin-bottom: 1rem; font-weight: bold; cursor: pointer;" onclick="cancelPlacingPlayer()">
          Tippe auf das Spielfeld, um ${window.placingPlayer} zu platzieren! (Hier klicken zum Abbrechen)
        </div>
      ` : ''}
      <div class="pitch-container" 
           ondragover="event.preventDefault()" 
           ondrop="${isCoach ? 'handlePitchDrop(event)' : ''}"
           onclick="${isCoach ? 'handlePitchClick(event)' : ''}">
        <div class="pitch-line pitch-center-circle"></div>
        <div class="pitch-line pitch-halfway"></div>
        <div class="pitch-line pitch-penalty-area-top"></div>
        <div class="pitch-line pitch-penalty-area-bottom"></div>
        ${pitchPlayersHTML}
      </div>
    `;

    let publishHeader = '';
    if (isCoach) {
      publishHeader = `
        <div style="background: ${currentLineup.isPublished ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; padding: 0.5rem 0.8rem; border-radius: 0.5rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid ${currentLineup.isPublished ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'};">
          <div style="font-size: 0.85rem;">
            <strong style="color:white;">Status: </strong> 
            <span style="color: ${currentLineup.isPublished ? 'var(--success)' : 'var(--warning)'};">${currentLineup.isPublished ? '✅ Veröffentlicht' : '✏️ Entwurf'}</span>
          </div>
          <button class="btn ${currentLineup.isPublished ? 'btn-danger' : 'btn-success'}" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="togglePublishLineup()">
            ${currentLineup.isPublished ? 'Verbergen' : 'Veröffentlichen'}
          </button>
        </div>
      `;
    }

    lineupHTML = `
      <div class="glass-panel">
        ${publishHeader}
        <div class="list-header" style="margin-bottom: 1.5rem;">
          <h3 style="margin-bottom: 0;">Aufstellung (Spielfeld)</h3>
          ${isCoach ? `<button class="filter-reset-btn" onclick="clearLineup()">Leeren</button>` : ''}
        </div>
        
        ${pitchHTML}
        <p style="text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-top: 0.5rem;">Startelf: ${currentLineup.pitchPlayers.length} / 11</p>

        <h4 style="color: var(--warning); margin-top: 1.5rem; margin-bottom: 0.5rem;">Bank (${currentLineup.bench.length})</h4>
        <div class="participant-list" style="border:none; padding:0; margin:0 0 1.5rem 0;">
          ${currentLineup.bench.map(p => `
            <div class="player-row" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);">
              <span>${p} ${p === currentLineup.captain ? '👑' : ''}</span>
              ${isCoach ? `<button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="removeFromLineup('${p}')">X</button>` : ''}
            </div>
          `).join('')}
          ${currentLineup.bench.length === 0 ? '<p style="color:var(--text-muted); font-size:0.9rem;">Keine Spieler auf der Bank.</p>' : ''}
        </div>

        ${captainSelect}
      </div>
    `;
  }

  appContent.innerHTML = `
    <div class="section-header" style="margin-bottom: 1rem;">
      <div>
        <h2>Mannschaft & Aufstellung</h2>
        <p>Ziehe verfügbare Spieler auf das Spielfeld.</p>
      </div>
    </div>
    <div class="split-view">
      <div class="left-col">${rosterHTML}</div>
      <div class="right-col">${lineupHTML}</div>
    </div>
  `;
}

// --- Stats View ---
function renderStatsView() {
  const isCoach = state.isCoach;

  // Compute Attendance
  const attendance = {};
  const players = getTeamUsers().filter(u => getUserRole(u) === 'player');
  // Only count non-canceled events
  const activeEvents = getTeamEvents().filter(e => !e.isCanceled);

  players.forEach(u => attendance[u.name] = { yes: 0, total: activeEvents.length });

  activeEvents.forEach(e => {
    // With opt-out, player is 'yes' unless they are explicitly in the declined list
    const declinedNames = e.playerDetails.filter(p => p.status === 'no').map(p => p.name);
    players.forEach(u => {
      if (!declinedNames.includes(u.name)) {
        if (attendance[u.name]) attendance[u.name].yes++;
      }
    });
  });

  const attendanceArr = players.map(p => ({
    name: p.name,
    yes: attendance[p.name].yes,
    total: attendance[p.name].total,
    percent: attendance[p.name].total === 0 ? 0 : Math.round((attendance[p.name].yes / attendance[p.name].total) * 100)
  })).sort((a, b) => b.percent - a.percent);

  let attendanceHTML = `
    <div class="glass-panel" style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1.5rem; color: var(--primary);">Trainings- & Spielpräsenz 📈</h3>
      <div class="participant-list" style="border:none; padding:0; margin:0;">
        ${attendanceArr.map((a, i) => `
          <div class="player-row" style="background: rgba(255,255,255,0.05); border: 1px solid var(--surface-border);">
            <div style="display:flex; align-items:center; gap: 0.5rem;">
              <span style="font-weight: 800; font-size: 1.2rem; color: ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? '#cd7f32' : 'var(--text-muted)'}; width: 20px;">#${i + 1}</span>
              <span style="font-weight: 600;">${a.name}</span>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 700; color: ${a.percent >= 80 ? 'var(--success)' : a.percent <= 40 ? 'var(--danger)' : 'white'};">${a.percent}%</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${a.yes} von ${a.total}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Compute Goals
  const goalsArr = [...players].sort((a, b) => {
    const aGoals = a.memberships?.find(m => m.teamId === state.currentTeamId)?.goals ?? a.goals ?? 0;
    const bGoals = b.memberships?.find(m => m.teamId === state.currentTeamId)?.goals ?? b.goals ?? 0;
    return bGoals - aGoals;
  });
  let goalsHTML = `
    <div class="glass-panel" style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1.5rem; color: var(--success);">Torschützenkönig ⚽️</h3>
      <div class="participant-list" style="border:none; padding:0; margin:0;">
        ${goalsArr.map((p, i) => `
          <div class="player-row" style="background: rgba(255,255,255,0.05); border: 1px solid var(--surface-border);">
            <div style="display:flex; align-items:center; gap: 0.5rem;">
              <span style="font-weight: 800; font-size: 1.2rem; color: ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? '#cd7f32' : 'var(--text-muted)'}; width: 20px;">#${i + 1}</span>
              <span style="font-weight: 600;">${p.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap: 1rem;">
              <span style="font-size: 1.2rem; font-weight: 700; color: white;">${p.memberships?.find(m => m.teamId === state.currentTeamId)?.goals ?? p.goals ?? 0}</span>
              ${isCoach ? `
                <div style="display:flex; gap:0.25rem;">
                  <button class="btn" style="padding: 0.2rem 0.5rem; font-size: 0.8rem; background:rgba(255,255,255,0.1); color:white;" onclick="addGoal(${p.id}, -1)">- Tor</button>
                  <button class="btn btn-success" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="addGoal(${p.id}, 1)">+ Tor</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const motmArr = [...players].sort((a, b) => {
    const aMotm = a.memberships?.find(m => m.teamId === state.currentTeamId)?.motmCount ?? a.motmCount ?? 0;
    const bMotm = b.memberships?.find(m => m.teamId === state.currentTeamId)?.motmCount ?? b.motmCount ?? 0;
    return bMotm - aMotm;
  });
  let motmHTML = `
    <div class="glass-panel">
      <h3 style="margin-bottom: 1.5rem; color: gold;">Man of the Match 🏆</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Meiste "Spieler des Spiels" Auszeichnungen</p>
      <div class="participant-list" style="border:none; padding:0; margin:0;">
        ${motmArr.map((p, i) => `
          <div class="player-row" style="background: rgba(255,215,0,0.05); border: 1px solid rgba(255,215,0,0.2);">
            <div style="display:flex; align-items:center; gap: 0.5rem;">
              <span style="font-weight: 800; font-size: 1.2rem; color: ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? '#cd7f32' : 'var(--text-muted)'}; width: 20px;">#${i + 1}</span>
              <span style="font-weight: 600;">${p.name}</span>
            </div>
            <div style="display:flex; align-items:center; gap: 1rem;">
              <span style="font-size: 1.2rem; font-weight: 700; color: gold;">${p.memberships?.find(m => m.teamId === state.currentTeamId)?.motmCount ?? p.motmCount ?? 0}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  appContent.innerHTML = `
    <div class="section-header" style="margin-bottom: 1rem;">
      <div>
        <h2>Statistiken & Rankings</h2>
        <p>Wer ist am fleißigsten? Wer schießt die meisten Tore?</p>
      </div>
    </div>
    <div class="split-view">
      <div class="left-col">${attendanceHTML}</div>
      <div class="right-col">
        ${goalsHTML}
        ${motmHTML}
      </div>
    </div>
  `;
}

window.addGoal = async (userId, amount) => {
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/goals`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    if (res.ok) {
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    alert("Fehler beim Hinzufügen des Tors");
  }
};

window.setMotm = async (eventId, username) => {
  try {
    const res = await fetch(`${API_BASE}/api/events/${eventId}/motm`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (res.ok) {
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    alert("Fehler beim Speichern des MotM");
  }
};

window.openMatchReportModal = (eventId) => {
  tempEventId = eventId;
  const event = state.events.find(e => e.id === eventId);
  if (!event) return;

  document.getElementById('report-res-home').value = event.result?.home ?? '';
  document.getElementById('report-res-away').value = event.result?.away ?? '';

  const teamPlayers = getTeamUsers().filter(u => getUserRole(u) === 'player');
  const select = document.getElementById('report-event-player');
  select.innerHTML = '<option value="">-- Spieler --</option>' + teamPlayers.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  document.getElementById('report-event-minute').value = '';

  renderReportEventsList();

  document.getElementById('match-report-modal').style.display = 'flex';
};

window.closeMatchReportModal = () => {
  document.getElementById('match-report-modal').style.display = 'none';
  tempEventId = null;
};

function renderReportEventsList() {
  const event = state.events.find(e => e.id === tempEventId);
  const container = document.getElementById('report-events-list');
  if (!event || !event.matchEvents || event.matchEvents.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size: 0.9rem;">Noch keine Ereignisse eingetragen.</p>';
    return;
  }

  const sortedEvents = [...event.matchEvents].sort((a, b) => a.minute - b.minute);
  let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
  sortedEvents.forEach(me => {
    let icon = me.type === 'goal' ? '⚽️' : me.type === 'yellow' ? '🟨' : '🟥';
    html += `
      <div style="background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 0.25rem; display: flex; align-items: center; justify-content: space-between;">
        <span><b>${me.minute}'</b> ${icon} ${me.player}</span>
        ${(state.isCoach || state.isAdmin) ? `<button style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 0 0.5rem; font-weight: bold; font-size: 1.1rem;" onclick="deleteMatchEvent(${me.id})">✕</button>` : ''}
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

window.deleteMatchEvent = async (matchEventId) => {
  if (!confirm("Ereignis wirklich löschen?")) return;
  try {
    const res = await fetch(`${API_BASE}/api/events/${tempEventId}/match-events/${matchEventId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error("Fehler beim Löschen des Ereignisses");
    const updatedEvent = await res.json();
    const idx = state.events.findIndex(e => e.id === updatedEvent.id);
    if (idx !== -1) state.events[idx] = updatedEvent;
    
    // Refresh user stats if a goal was deleted
    const usersRes = await fetch(`${API_BASE}/api/users`);
    state.users = await usersRes.json();
    
    renderReportEventsList();
    renderCurrentView();
  } catch (err) {
    alert(err.message);
  }
};

window.addEventToReport = async () => {
  if (!tempEventId) return;
  const player = document.getElementById('report-event-player').value;
  const type = document.getElementById('report-event-type').value;
  const minute = document.getElementById('report-event-minute').value;

  if (!player || !minute) return alert("Bitte Spieler und Minute angeben.");

  let homeVal = parseInt(document.getElementById('report-res-home').value) || 0;
  let awayVal = parseInt(document.getElementById('report-res-away').value) || 0;

  if (type === 'goal') {
    homeVal += 1;
    document.getElementById('report-res-home').value = homeVal;
  }

  try {
    const res = await fetch(`${API_BASE}/api/events/${tempEventId}/match-events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, player, minute })
    });
    if (res.ok) {
      const currentEvent = state.events.find(e => e.id === tempEventId);
      const isPlayed = currentEvent?.result?.isPlayed || false;

      await fetch(`${API_BASE}/api/events/${tempEventId}/result`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home: homeVal, away: awayVal, isPlayed: isPlayed })
      });

      document.getElementById('report-event-minute').value = '';
      await syncData();
      renderReportEventsList();
    }
  } catch (e) {
    alert("Fehler beim Hinzufügen des Ereignisses");
  }
};

window.saveMatchReport = async () => {
  if (!tempEventId) return;
  const homeStr = document.getElementById('report-res-home').value;
  const awayStr = document.getElementById('report-res-away').value;

  if (homeStr === '' || awayStr === '') return alert("Bitte Endresultat eingeben.");

  try {
    const res = await fetch(`${API_BASE}/api/events/${tempEventId}/result`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home: parseInt(homeStr), away: parseInt(awayStr), isPlayed: true })
    });
    if (res.ok) {
      alert("Spielbericht gespeichert!");
      closeMatchReportModal();
      await syncData();
      renderCurrentView();
    }
  } catch (e) { alert("Fehler beim Speichern"); }
};

// --- Coach View ---
function renderCoachView() {
  let formHTML = `
    <div class="glass-panel" style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1.5rem;">Neuen Termin anlegen</h3>
      <div class="form-group">
        <label>Titel des Events</label>
        <input type="text" id="new-title" class="text-input" placeholder="z.B. Auswärtsspiel vs. FC Zürich">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Typ</label>
          <select id="new-type" class="select-input">
            <option value="Training">Training</option>
            <option value="Spiel">Spiel</option>
          </select>
        </div>
        <div class="form-group">
          <label>Datum</label>
          <input type="date" id="new-date" class="text-input" value="${getOffsetDateString(1)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Beginn (Zeit)</label>
          <input type="text" id="new-time" class="text-input" placeholder="z.B. 19:30 - 21:00">
        </div>
        <div class="form-group">
          <label>Treffpunkt (Zeit)</label>
          <input type="text" id="new-meeting" class="text-input" placeholder="z.B. 18:45">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ort (Spielfeld / Halle)</label>
          <input type="text" id="new-location" class="text-input" placeholder="z.B. Sportplatz Au">
        </div>
        <div class="form-group">
          <label>Wiederholung</label>
          <select id="new-repeat-type" class="select-input" onchange="document.getElementById('repeat-duration-group').style.display = this.value === 'none' ? 'none' : 'block'">
            <option value="none">Keine Wiederholung</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </div>
      </div>
      <div class="form-row" id="repeat-duration-group" style="display:none;">
        <div class="form-group">
          <label>Wie lange wiederholen?</label>
          <select id="new-repeat-duration" class="select-input">
            <option value="1">1 Monat</option>
            <option value="3">3 Monate</option>
            <option value="6">6 Monate</option>
            <option value="12">1 Jahr</option>
            <option value="24">2 Jahre</option>
            <option value="999">Unendlich (Vorausplanung max. 5 Jahre)</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary" onclick="addEvent()" style="width: 100%; margin-top: 1rem;">Termin speichern</button>
    </div>
  `;

  let eventListHTML = `<h3 style="margin-bottom: 1rem;">Alle Termine & Ausfälle</h3>`;
  let coachEvents = getTeamEvents();
  
  // Hide past events by default
  const todayStr = getOffsetDateString(0);
  coachEvents = coachEvents.filter(e => e.date >= todayStr);
  
  // Sort coach events strictly by date, then by time
  coachEvents.sort((a, b) => {
    if (a.date === b.date) {
      return (a.time || "").localeCompare(b.time || "");
    }
    return a.date.localeCompare(b.date);
  });

  coachEvents.forEach(e => {
    eventListHTML += generateEventCardHTML(e, true);
  });

  appContent.innerHTML = `
    <div class="section-header" style="margin-bottom: 1rem;">
      <div>
        <h2>Coach-Zentrale</h2>
        <p>Erstelle Termine und prüfe die Abmeldungen.</p>
      </div>
    </div>
    <div class="split-view coach-view-split">
      <div class="left-col">${formHTML}</div>
      <div class="right-col">${eventListHTML}</div>
    </div>
  `;
}

// --- Admin View ---
function renderAdminView() {
  let userFormHTML = `
    <div class="glass-panel" style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1.5rem;">Neuen Benutzer erstellen</h3>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="new-user-name" class="text-input" placeholder="z.B. Kevin Meier">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Rolle</label>
          <select id="new-user-role" class="select-input">
            <option value="player">Spieler</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label>Team zuweisen</label>
          <select id="new-user-team" class="select-input">
            ${state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary" onclick="addUser()" style="width: 100%; margin-top: 1rem;">Benutzer erstellen</button>

      <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 2rem 0;">

      <h3 style="margin-bottom: 1.5rem;">Bestehendem Benutzer neues Team zuweisen</h3>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Ermöglicht es einem Benutzer (z.B. Spielertrainer), in mehreren Teams gleichzeitig aktiv zu sein.</p>
      <div class="form-row">
        <div class="form-group">
          <label>Benutzer</label>
          <select id="assign-user-id" class="select-input">
            ${state.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Rolle</label>
          <select id="assign-user-role" class="select-input">
            <option value="player">Spieler</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Team</label>
        <select id="assign-user-team" class="select-input">
          ${state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" onclick="assignMembership()" style="width: 100%; margin-top: 1rem;">Team zuweisen</button>
    </div>
  `;

  let teamFormHTML = `
    <div class="glass-panel" style="margin-bottom: 2rem;">
      <h3 style="margin-bottom: 1.5rem;">Neue Mannschaft (Team) erstellen</h3>
      <div class="form-group">
        <label>Team Name</label>
        <input type="text" id="new-team-name" class="text-input" placeholder="z.B. 2. Mannschaft">
      </div>
      <button class="btn btn-primary" onclick="addTeam()" style="width: 100%; margin-top: 1rem;">Team erstellen</button>
    </div>
  `;

  let usersHTML = `
    <div class="glass-panel">
      <h3 style="margin-bottom: 1.5rem;">Registrierte Benutzer</h3>
      <div class="participant-list" style="border:none; padding:0; margin:0; display:flex; flex-direction:column; gap:1.5rem;">
        ${state.teams.map(team => {
          // Find all users that belong to this team
          const teamUsers = state.users.filter(u => 
            u.teamId === team.id || (u.memberships && u.memberships.find(m => m.teamId === team.id))
          );
          
          if (teamUsers.length === 0) return '';
          
          return `
            <div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 0.5rem; border: 1px solid rgba(255,255,255,0.05);">
              <h4 style="margin-bottom: 1rem; color: var(--primary); font-size: 1.1rem;">${team.name}</h4>
              <div style="display:flex; flex-direction:column; gap: 0.5rem;">
                ${teamUsers.map(u => {
                  let roleBadge = '';
                  const mRole = u.memberships?.find(m => m.teamId === team.id)?.role || u.role;
                  if (mRole === 'admin') roleBadge = '<span class="status-badge status-no">Admin</span>';
                  else if (mRole === 'coach') roleBadge = '<span class="status-badge status-pending">Coach</span>';
                  else roleBadge = '<span class="status-badge status-yes">Spieler</span>';

                  return `
                    <div class="player-row" style="background: rgba(255,255,255,0.05); border: 1px solid var(--surface-border); display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <span style="font-weight: 600;">${u.name}</span>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">(ID: ${u.id})</div>
                      </div>
                      <div style="display:flex; align-items:center; gap: 0.5rem;">
                        ${roleBadge}
                        <button class="btn" style="padding: 0.3rem 0.5rem; font-size: 0.8rem; background: rgba(255,255,255,0.1); color: white;" onclick="openAdminEditUserModal(${u.id}, ${team.id})">✏️</button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  appContent.innerHTML = `
    <div class="section-header" style="margin-bottom: 1rem;">
      <div>
        <h2>Admin-Bereich</h2>
        <p>System-, Team- und Benutzerverwaltung.</p>
      </div>
    </div>
    <div class="split-view">
      <div class="left-col">
        ${teamFormHTML}
        ${userFormHTML}
      </div>
      <div class="right-col">${usersHTML}</div>
    </div>
  `;
}

// --- API Actions ---
window.addTeam = async () => {
  const name = document.getElementById('new-team-name').value.trim();
  if (!name) return alert("Bitte Team-Namen eingeben.");

  try {
    const res = await fetch(`${API_BASE}/api/teams`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      alert("Team erstellt!");
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    alert("Fehler beim Speichern");
  }
};

window.addEvent = async () => {
  const title = document.getElementById('new-title').value;
  const type = document.getElementById('new-type').value;
  const date = document.getElementById('new-date').value;
  const time = document.getElementById('new-time').value;
  const meetingTime = document.getElementById('new-meeting').value;
  const location = document.getElementById('new-location').value;
  const repeatType = document.getElementById('new-repeat-type').value;
  const repeatDuration = parseInt(document.getElementById('new-repeat-duration').value) || 1;

  if (!title || !date || !time) {
    alert("Bitte fülle Titel, Datum und Zeit aus.");
    return;
  }

  try {
    let eventDates = [new Date(date)];

    if (repeatType !== 'none') {
      const maxDate = new Date(date);
      if (repeatDuration === 999) {
        maxDate.setFullYear(maxDate.getFullYear() + 5);
      } else {
        maxDate.setMonth(maxDate.getMonth() + repeatDuration);
      }

      let curr = new Date(date);
      while (true) {
        if (repeatType === 'weekly') curr.setDate(curr.getDate() + 7);
        else if (repeatType === 'monthly') curr.setMonth(curr.getMonth() + 1);
        else if (repeatType === 'yearly') curr.setFullYear(curr.getFullYear() + 1);

        if (curr > maxDate) break;
        if (eventDates.length >= 260) break; // Hard limit for safety
        eventDates.push(new Date(curr));
      }
    }

    // Sequential saving to avoid overloading the server
    for (let d of eventDates) {
      const dateString = d.toISOString().split('T')[0];
      const newEvent = {
        teamId: state.currentTeamId,
        date: dateString, time: time, meetingTime: meetingTime, location: location || "Unbekannt",
        type: type, title: title, coach: state.currentUser
      };

      await fetch(`${API_BASE}/api/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
    }

    alert(eventDates.length > 1 ? `${eventDates.length} Termine erfolgreich hinzugefügt!` : "Erfolgreich hinzugefügt!");
    await syncData();
    renderCurrentView();
  } catch (e) {
    console.error(e);
    alert("Fehler beim Speichern");
  }
};

window.addUser = async () => {
  const name = document.getElementById('new-user-name').value.trim();
  const role = document.getElementById('new-user-role').value;
  const teamId = parseInt(document.getElementById('new-user-team').value);
  if (!name) return alert("Bitte Namen eingeben.");

  try {
    const res = await fetch(`${API_BASE}/api/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, teamId })
    });
    if (res.ok) {
      alert("Benutzer erstellt!");
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    console.error(e);
    alert("Fehler beim Speichern");
  }
};

window.assignMembership = async () => {
  const userId = document.getElementById('assign-user-id').value;
  const role = document.getElementById('assign-user-role').value;
  const teamId = document.getElementById('assign-user-team').value;

  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/membership`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, role })
    });
    if (res.ok) {
      alert("Team erfolgreich zugewiesen!");
      await syncData();
      renderCurrentView();
    } else {
      let errText = "Unbekannt";
      try {
        const errData = await res.json();
        errText = errData.error || errText;
      } catch (err) {
        errText = await res.text();
      }
      alert("Fehler vom Server: " + errText);
    }
  } catch (e) {
    alert("Netzwerk-Fehler beim Zuweisen des Teams");
  }
};

window.openAdminEditUserModal = (userId, teamId) => {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;
  
  document.getElementById('edit-user-id').value = userId;
  document.getElementById('edit-user-team-id').value = teamId;
  document.getElementById('edit-user-name').value = user.name;
  
  const mRole = user.memberships?.find(m => m.teamId === teamId)?.role || user.role;
  document.getElementById('edit-user-role').value = mRole;
  
  document.getElementById('admin-edit-user-modal').style.display = 'flex';
};

window.closeAdminEditUserModal = () => {
  document.getElementById('admin-edit-user-modal').style.display = 'none';
};

window.saveAdminEditUser = async () => {
  const userId = document.getElementById('edit-user-id').value;
  const teamId = document.getElementById('edit-user-team-id').value;
  const newName = document.getElementById('edit-user-name').value.trim();
  const newRole = document.getElementById('edit-user-role').value;
  
  if (!newName) return alert("Bitte Namen eingeben.");
  
  try {
    // 1. Update global name
    await fetch(`${API_BASE}/api/users/${userId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    
    // 2. Update role in this team
    await fetch(`${API_BASE}/api/users/${userId}/membership`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, role: newRole })
    });
    
    closeAdminEditUserModal();
    await syncData();
    renderCurrentView();
  } catch (e) {
    alert("Fehler beim Speichern der Benutzerdaten.");
  }
};

window.removeUserFromTeam = async () => {
  if (!confirm("Soll dieser Benutzer wirklich aus der aktuellen Mannschaft entfernt werden? (Wenn es seine letzte Mannschaft ist, wird er keinen Zugriff mehr haben).")) return;
  
  const userId = document.getElementById('edit-user-id').value;
  const teamId = document.getElementById('edit-user-team-id').value;
  
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/membership/${teamId}`, { method: 'DELETE' });
    if (res.ok) {
      closeAdminEditUserModal();
      await syncData();
      renderCurrentView();
    } else {
      alert("Fehler vom Server.");
    }
  } catch (e) {
    alert("Fehler beim Entfernen des Teams.");
  }
};

window.deleteUserCompletely = async () => {
  if (!confirm("ACHTUNG! Soll dieser Benutzer komplett gelöscht werden? Er verliert alle Tore, Anwesenheiten und Zugehörigkeiten zu allen Teams. Dies kann nicht rückgängig gemacht werden!")) return;
  
  const userId = document.getElementById('edit-user-id').value;
  
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}`, { method: 'DELETE' });
    if (res.ok) {
      closeAdminEditUserModal();
      await syncData();
      renderCurrentView();
    } else {
      alert("Fehler vom Server.");
    }
  } catch (e) {
    alert("Fehler beim Löschen des Benutzers.");
  }
};

window.sendMessage = async () => {
  const input = document.getElementById('new-msg-input');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, author: state.currentUser, teamId: state.currentTeamId })
    });
    if (res.ok) {
      input.value = '';
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    alert("Fehler beim Senden der Nachricht");
  }
};

window.deleteMessage = async (msgId) => {
  if (confirm("Nachricht löschen?")) {
    try {
      const res = await fetch(`${API_BASE}/api/messages/${msgId}`, { method: 'DELETE' });
      if (res.ok) {
        await syncData();
        renderCurrentView();
      }
    } catch (e) {
      alert("Fehler beim Löschen");
    }
  }
};

window.reactMessage = async (msgId, emoji) => {
  try {
    const res = await fetch(`${API_BASE}/api/messages/${msgId}/react`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, username: state.currentUser })
    });
    if (res.ok) {
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    alert("Fehler beim Reagieren");
  }
};

window.coachUpdateStatus = async (eventId, username, status, reason) => {
  try {
    const res = await fetch(`${API_BASE}/api/events/${eventId}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, status: status, reason: reason })
    });
    if (res.ok) {
      await syncData();
      renderCurrentView();
    }
  } catch (e) {
    alert("Fehler beim Aktualisieren");
  }
};

window.cancelEvent = async (id) => {
  if (confirm("Möchtest du diesen Termin wirklich absagen? (Er bleibt im Kalender als 'Abgesagt' sichtbar)")) {
    const e = state.events.find(ev => ev.id === id);
    if (e) e.isCanceled = true;
    renderCurrentView();

    try {
      const res = await fetch(`${API_BASE}/api/events/${id}/cancel`, { method: 'PUT' });
      if (res.ok) {
        await syncData();
      }
    } catch (err) {
      alert("Fehler beim Absagen");
    }
  }
};

window.adminDeleteEvent = async (id) => {
  if (confirm("🚨 ACHTUNG: Möchtest du diesen Termin ENDGÜLTIG aus der Datenbank löschen?")) {
    try {
      const res = await fetch(`${API_BASE}/api/events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        state.events = state.events.filter(e => e.id !== id);
        renderCurrentView();
        await syncData();
      }
    } catch (err) {
      alert("Fehler beim Löschen");
    }
  }
};

window.confirmYes = async (id) => {
  try {
    const res = await fetch(`${API_BASE}/api/events/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: state.currentUser, status: 'pending', reason: '' })
    });
    if (res.ok) {
      await syncData();
      renderCurrentView();
      animateCard(id);
    }
  } catch (e) {
    alert("Konnte Status nicht aktualisieren");
  }
};

window.promptDecline = (id) => {
  tempDeclineId = id;
  document.getElementById('reason-input').value = '';
  reasonModal.style.display = 'flex';
};

document.getElementById('cancel-reason-btn').addEventListener('click', () => {
  reasonModal.style.display = 'none';
  tempDeclineId = null;
});

document.getElementById('submit-reason-btn').addEventListener('click', async () => {
  const reason = document.getElementById('reason-input').value.trim();
  if (!reason) {
    alert("Bitte gib einen Grund an.");
    return;
  }

  if (tempDeclineId !== null) {
    try {
      const res = await fetch(`${API_BASE}/api/events/${tempDeclineId}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: state.currentUser, status: 'no', reason: reason })
      });
      if (res.ok) {
        reasonModal.style.display = 'none';
        const updatedId = tempDeclineId;
        tempDeclineId = null;
        await syncData();
        renderCurrentView();
        animateCard(updatedId);
      }
    } catch (e) {
      alert("Fehler beim Abmelden");
    }
  }
});

// --- Lineup Drag & Drop API ---
window.saveLineup = async () => {
  renderCurrentView();
  const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
  if (!selectedMatch) return;

  try {
    const res = await fetch(`${API_BASE}/api/events/${state.lineupEventId}/lineup`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedMatch.lineup)
    });
    if (res.ok) {
      await syncData();
    }
  } catch (e) {
    console.error(e);
  }
};

window.placingPlayer = null;

window.startPlacingPlayer = (name) => {
  window.placingPlayer = name;
  const match = state.events.find(m => m.id === state.lineupEventId);
  if (match && match.lineup) {
    if (match.lineup.pitchPlayers.length >= 11 && !match.lineup.pitchPlayers.find(p => p.name === name)) {
      alert("Die Startelf ist voll (11 Spieler)!");
      window.placingPlayer = null;
      return;
    }
  }
  renderCurrentView(); // Re-render to show the banner
};

window.cancelPlacingPlayer = () => {
  window.placingPlayer = null;
  renderCurrentView();
};

window.handlePitchClick = (event) => {
  if (!window.placingPlayer) return;
  const name = window.placingPlayer;
  
  const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
  if (!selectedMatch || !selectedMatch.lineup) return;
  const lineup = selectedMatch.lineup;

  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  lineup.bench = lineup.bench.filter(n => n !== name);
  lineup.pitchPlayers = lineup.pitchPlayers.filter(p => p.name !== name);

  lineup.pitchPlayers.push({ name, x, y });
  window.placingPlayer = null;
  saveLineup();
};

window.handlePitchDrop = (event) => {
  event.preventDefault();
  const name = event.dataTransfer.getData('name');
  if (!name) return;

  const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
  if (!selectedMatch || !selectedMatch.lineup) return;
  const lineup = selectedMatch.lineup;

  if (lineup.pitchPlayers.length >= 11 && !lineup.pitchPlayers.find(p => p.name === name)) {
    alert("Die Startelf ist voll (11 Spieler)!");
    return;
  }

  const rect = event.target.closest('.pitch-container').getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  lineup.bench = lineup.bench.filter(n => n !== name);
  lineup.pitchPlayers = lineup.pitchPlayers.filter(p => p.name !== name);

  lineup.pitchPlayers.push({ name, x, y });
  saveLineup();
};

window.addToLineup = (name, type) => {
  const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
  if (!selectedMatch || !selectedMatch.lineup) return;
  const lineup = selectedMatch.lineup;

  if (type === 'bench') {
    lineup.pitchPlayers = lineup.pitchPlayers.filter(p => p.name !== name);
    if (!lineup.bench.includes(name)) lineup.bench.push(name);
    saveLineup();
  }
};

window.removeFromLineup = (name) => {
  const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
  if (!selectedMatch || !selectedMatch.lineup) return;
  const lineup = selectedMatch.lineup;

  lineup.pitchPlayers = lineup.pitchPlayers.filter(p => p.name !== name);
  lineup.bench = lineup.bench.filter(n => n !== name);
  if (lineup.captain === name) lineup.captain = "";
  saveLineup();
};

window.setCaptain = (name) => {
  const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
  if (!selectedMatch || !selectedMatch.lineup) return;
  selectedMatch.lineup.captain = name;
  saveLineup();
};

window.clearLineup = () => {
  if (confirm("Ganze Aufstellung für dieses Spiel zurücksetzen?")) {
    const selectedMatch = state.events.find(m => m.id === state.lineupEventId);
    if (selectedMatch && selectedMatch.lineup) {
      selectedMatch.lineup.bench = [];
      selectedMatch.lineup.pitchPlayers = [];
      selectedMatch.lineup.captain = "";
      saveLineup();
    }
  }
};

function animateCard(id) {
  setTimeout(() => {
    const el = document.getElementById('event-' + id);
    if (el) {
      el.classList.add('pop-anim');
      setTimeout(() => el.classList.remove('pop-anim'), 300);
    }
  }, 50);
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Determine the actual clicked button (handles clicks on nested SVGs)
    const targetBtn = e.target.closest('.nav-btn');
    if (!targetBtn) return;
    
    // Toggle back from notifications if already open
    if (targetBtn.dataset.view === 'notifications' && state.currentView === 'notifications') {
      state.currentView = state.previousView || 'calendar';
      
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      const prevBtn = document.querySelector(`.nav-btn[data-view="${state.currentView}"]`);
      if (prevBtn) prevBtn.classList.add('active');
      
      renderCurrentView();
      return;
    }
    
    if (state.currentView !== 'notifications') {
      state.previousView = state.currentView;
    }
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    targetBtn.classList.add('active');

    state.currentView = targetBtn.dataset.view;
    renderCurrentView();
    
    // Close mobile menu if it's open
    const mainNav = document.getElementById('main-nav');
    if (mainNav) mainNav.classList.remove('mobile-open');
  });
});

// Mobile Hamburger Menu
const mobileBtn = document.getElementById('mobile-menu-btn');
if (mobileBtn) {
  mobileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const mainNav = document.getElementById('main-nav');
    if (mainNav) mainNav.classList.toggle('mobile-open');
  });
}
