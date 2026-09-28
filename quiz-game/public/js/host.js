/* ── Host client logic ─────────────────────────────── */
const socket = io();

let currentPin = null;
let timerInterval = null;
let countdownInterval = null;
let totalQuestions = 10;

// ── Screen management ──────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMsg(elId, text, type = 'error') {
  const el = document.getElementById(elId);
  el.className = `msg ${type}`;
  el.textContent = text;
}

// ── Create room ────────────────────────────────────
function createRoom() {
  const name = document.getElementById('host-name').value.trim();
  if (!name) { showMsg('setup-msg', 'Please enter your name.'); return; }
  socket.emit('host:create', { hostName: name });
}

socket.on('host:room_created', async ({ pin }) => {
  currentPin = pin;
  document.getElementById('pin-display').textContent = pin;
  showScreen('screen-lobby');

  // Fetch QR code
  try {
    const res = await fetch(`/api/qr/${pin}`);
    const data = await res.json();
    document.getElementById('qr-img').src = data.qr;
    document.getElementById('qr-url').textContent = data.url;
  } catch (e) {
    document.getElementById('qr-url').textContent = 'Could not load QR code.';
  }
});

// ── Participant joined ─────────────────────────────
socket.on('host:participant_joined', ({ participants }) => {
  updatePlayerList(participants);
  document.getElementById('btn-start').disabled = participants.length === 0;
});

socket.on('host:participant_left', ({ name, participants }) => {
  updatePlayerList(participants);
  document.getElementById('btn-start').disabled = participants.length === 0;
});

function updatePlayerList(participants) {
  const list = document.getElementById('player-list');
  const count = document.getElementById('player-count');
  list.innerHTML = participants
    .map(p => `<li class="player-chip">${escHtml(p.name)}</li>`)
    .join('');
  count.textContent = participants.length;
  document.getElementById('btn-start').disabled = participants.length === 0;
}

// ── Start game ─────────────────────────────────────
function startGame() {
  socket.emit('host:start');
}

// ── Question arrives ───────────────────────────────
socket.on('game:question', ({ questionIndex, total, question, options, timeLimit }) => {
  totalQuestions = total;
  showScreen('screen-question');
  clearTimers();

  document.getElementById('h-q-number').textContent =
    `Q ${questionIndex + 1} / ${total}`;
  document.getElementById('h-question-text').textContent = question;
  document.getElementById('h-answered').textContent = 'Waiting for answers…';

  // Progress bar
  const pct = (questionIndex / total) * 100;
  document.getElementById('h-progress').style.width = pct + '%';

  // Render options (no correct highlight yet)
  renderOptions(options, -1);

  // Timer
  let t = timeLimit;
  document.getElementById('h-q-timer').textContent = t;
  document.getElementById('h-q-timer').classList.remove('urgent');

  timerInterval = setInterval(() => {
    t--;
    const el = document.getElementById('h-q-timer');
    el.textContent = t;
    if (t <= 5) el.classList.add('urgent');
    if (t <= 0) clearInterval(timerInterval);
  }, 1000);
});

// Host receives correct answer index
socket.on('host:question_answer', ({ correct }) => {
  // Store so we can highlight after results come in
  window._correctIndex = correct;
});

// ── Live score updates ─────────────────────────────
socket.on('host:scores_update', ({ leaderboard, answeredCount }) => {
  renderLeaderboard('h-live-lb', leaderboard);
  const total = leaderboard.length;
  document.getElementById('h-answered').textContent =
    `${answeredCount} / ${total} answered`;
});

// ── Question results ───────────────────────────────
socket.on('game:question_results', ({ correctIndex, correctAnswer, leaderboard }) => {
  clearTimers();
  showScreen('screen-qresults');

  document.getElementById('h-correct-ans').textContent =
    `✅ Correct answer: ${correctAnswer}`;
  renderLeaderboard('h-results-lb', leaderboard);

  // Also highlight on the question screen (not visible but good state)
  renderOptions(window._options || [], correctIndex);

  // Countdown for auto-advance
  let c = 5;
  document.getElementById('h-countdown').textContent = c;
  countdownInterval = setInterval(() => {
    c--;
    const el = document.getElementById('h-countdown');
    if (el) el.textContent = c;
    if (c <= 0) clearInterval(countdownInterval);
  }, 1000);
});

// ── Next question (manual) ─────────────────────────
function hostNext() {
  clearTimers();
  socket.emit('host:next');
}

// ── Game finished ──────────────────────────────────
socket.on('game:finished', ({ leaderboard }) => {
  clearTimers();
  showScreen('screen-final');
  renderLeaderboard('h-final-lb', leaderboard);
});

// ── Host left / error ──────────────────────────────
socket.on('error', ({ message }) => {
  showMsg('setup-msg', message);
  showMsg('lobby-msg', message);
});

socket.on('game:host_left', ({ message }) => {
  alert(message);
  location.href = '/host.html';
});

// ── Helpers ────────────────────────────────────────
function renderOptions(options, correctIndex) {
  const colors = ['option-a', 'option-b', 'option-c', 'option-d'];
  const labels = ['A', 'B', 'C', 'D'];
  window._options = options;
  document.getElementById('h-options').innerHTML = options
    .map((opt, i) => {
      const cls = correctIndex >= 0
        ? (i === correctIndex ? 'correct' : 'wrong')
        : '';
      return `<button class="option-btn ${colors[i]} ${cls}" disabled>
        <strong>${labels[i]}.</strong> ${escHtml(opt)}
      </button>`;
    }).join('');
}

function renderLeaderboard(elId, lb) {
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById(elId).innerHTML = lb
    .map((p, i) => `
      <li>
        <span class="lb-rank">${medals[i] || (i + 1)}</span>
        <span class="lb-name">${escHtml(p.name)}</span>
        <span class="lb-score">${p.score} pts</span>
      </li>`)
    .join('');
}

function clearTimers() {
  clearInterval(timerInterval);
  clearInterval(countdownInterval);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
