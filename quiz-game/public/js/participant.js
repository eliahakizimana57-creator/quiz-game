/* ── Participant client logic ───────────────────────── */
const socket = io();

let myScore = 0;
let currentQuestionIndex = -1;
let timerInterval = null;
let hasAnswered = false;

// ── Pre-fill PIN from QR code URL param ────────────
(function prefillPin() {
  const params = new URLSearchParams(window.location.search);
  const pin = params.get('pin');
  if (pin) {
    document.getElementById('pin-input').value = pin;
    // Focus name field so user just types their name
    setTimeout(() => document.getElementById('player-name').focus(), 200);
  }
})();

// ── Screen management ──────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMsg(text, type = 'error') {
  const el = document.getElementById('join-msg');
  el.className = `msg ${type}`;
  el.textContent = text;
}

// ── Join room ──────────────────────────────────────
function joinRoom() {
  const pin  = document.getElementById('pin-input').value.trim();
  const name = document.getElementById('player-name').value.trim();

  if (pin.length !== 6 || isNaN(Number(pin))) {
    showMsg('Please enter a valid 6-digit PIN.'); return;
  }
  if (!name) {
    showMsg('Please enter your name.'); return;
  }

  socket.emit('participant:join', { pin, name });
}

socket.on('participant:joined', ({ pin, name }) => {
  document.getElementById('p-pin-display').textContent  = pin;
  document.getElementById('p-name-display').textContent = name;
  showScreen('screen-lobby');
});

// ── Question received ──────────────────────────────
socket.on('game:question', ({ questionIndex, total, question, options, timeLimit }) => {
  currentQuestionIndex = questionIndex;
  hasAnswered = false;
  clearInterval(timerInterval);
  showScreen('screen-question');

  document.getElementById('p-q-number').textContent = `Q ${questionIndex + 1} / ${total}`;
  document.getElementById('p-question-text').textContent = question;
  document.getElementById('p-score-display').textContent = `Score: ${myScore}`;

  // Progress bar
  const pct = (questionIndex / total) * 100;
  document.getElementById('p-progress').style.width = pct + '%';

  // Render answer options
  renderOptions(options);

  // Countdown timer
  let t = timeLimit;
  const timerEl = document.getElementById('p-q-timer');
  timerEl.textContent = t;
  timerEl.classList.remove('urgent');

  timerInterval = setInterval(() => {
    t--;
    timerEl.textContent = t;
    if (t <= 5) timerEl.classList.add('urgent');
    if (t <= 0) {
      clearInterval(timerInterval);
      // Time's up — disable all options
      if (!hasAnswered) {
        disableOptions();
        showMsg('⏰ Time\'s up!', 'info');
      }
    }
  }, 1000);
});

// ── Render answer buttons ──────────────────────────
function renderOptions(options) {
  const colors = ['option-a', 'option-b', 'option-c', 'option-d'];
  const labels = ['A', 'B', 'C', 'D'];
  document.getElementById('p-options').innerHTML = options
    .map((opt, i) => `
      <button
        class="option-btn ${colors[i]}"
        onclick="submitAnswer(${i})"
        id="opt-${i}"
      >
        <strong>${labels[i]}.</strong> ${escHtml(opt)}
      </button>`)
    .join('');
}

function disableOptions() {
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
}

// ── Submit answer ──────────────────────────────────
function submitAnswer(index) {
  if (hasAnswered) return;
  hasAnswered = true;
  clearInterval(timerInterval);

  disableOptions();
  // Highlight selected
  const btn = document.getElementById(`opt-${index}`);
  if (btn) btn.classList.add('selected');

  socket.emit('participant:answer', {
    questionIndex: currentQuestionIndex,
    answerIndex: index
  });

  // Show waiting screen
  document.getElementById('p-waiting-score').textContent = `Score so far: ${myScore}`;
  showScreen('screen-waiting');
}

// ── Answer result ──────────────────────────────────
socket.on('participant:answer_result', ({ isCorrect, correctIndex, points, totalScore }) => {
  myScore = totalScore;
  document.getElementById('p-waiting-score').textContent = `Score: ${myScore}`;
});

// ── Question results (from server after everyone answers / timer) ──
socket.on('game:question_results', ({ correctIndex, correctAnswer, leaderboard }) => {
  clearInterval(timerInterval);

  // Result banner
  const banner = document.getElementById('p-result-banner');
  const title  = document.getElementById('p-result-title');
  const sub    = document.getElementById('p-result-sub');

  // Determine if user got it right by checking their stored answer
  // We rely on the answer_result event already setting myScore
  // For the banner, check if they answered at all
  if (hasAnswered) {
    // We'll use a flag set in answer_result
    const correct = window._lastAnswerCorrect;
    banner.className = `result-banner ${correct ? 'correct' : 'wrong'}`;
    title.textContent = correct ? '✅ Correct!' : '❌ Wrong!';
    sub.textContent   = correct
      ? `+100 points — Total: ${myScore}`
      : `No points — Total: ${myScore}`;
  } else {
    banner.className = 'result-banner wrong';
    title.textContent = '⏰ Time\'s Up!';
    sub.textContent = `Total: ${myScore}`;
  }

  document.getElementById('p-correct-ans').textContent = correctAnswer;
  renderLeaderboard('p-result-lb', leaderboard);
  showScreen('screen-answer-result');
});

// Store correct/wrong flag when answer result arrives
socket.on('participant:answer_result', ({ isCorrect }) => {
  window._lastAnswerCorrect = isCorrect;
});

// ── Game finished ──────────────────────────────────
socket.on('game:finished', ({ leaderboard }) => {
  clearInterval(timerInterval);
  renderLeaderboard('p-final-lb', leaderboard);
  document.getElementById('p-final-score').textContent = `Your final score: ${myScore} pts`;
  showScreen('screen-final');
});

// ── Host disconnected ──────────────────────────────
socket.on('game:host_left', ({ message }) => {
  clearInterval(timerInterval);
  alert(message);
  location.href = '/join.html';
});

// ── Error handling ─────────────────────────────────
socket.on('error', ({ message }) => {
  showMsg(message);
});

// ── Helpers ────────────────────────────────────────
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

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Allow pressing Enter to join
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id === 'screen-join') joinRoom();
  }
});
