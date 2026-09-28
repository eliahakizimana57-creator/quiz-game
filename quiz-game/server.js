const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const path = require('path');
const questions = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ──────────────────────────────────────────────
// In-memory game state
// ──────────────────────────────────────────────
const rooms = {}; // { [pin]: RoomState }

function generatePin() {
  let pin;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms[pin]);
  return pin;
}

function createRoom(hostSocketId, hostName) {
  const pin = generatePin();
  const roomId = uuidv4();
  rooms[pin] = {
    pin,
    roomId,
    hostSocketId,
    hostName,
    participants: {},      // { socketId: { name, score, answers } }
    status: 'lobby',       // lobby | question | results | finished
    currentQuestion: -1,
    questionTimer: null,
    scores: {}
  };
  return rooms[pin];
}

function getRoomByPin(pin) {
  return rooms[pin] || null;
}

function getRoomByHost(socketId) {
  return Object.values(rooms).find(r => r.hostSocketId === socketId) || null;
}

function getRoomByParticipant(socketId) {
  return Object.values(rooms).find(r => r.participants[socketId]) || null;
}

function safeQuestion(q) {
  // Strip correct answer before sending to participants
  return { id: q.id, question: q.question, options: q.options, timeLimit: q.timeLimit };
}

function leaderboard(room) {
  return Object.values(room.participants)
    .map(p => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

// ──────────────────────────────────────────────
// REST – generate QR code data URL for a PIN
// ──────────────────────────────────────────────
app.get('/api/qr/:pin', async (req, res) => {
  const { pin } = req.params;
  const joinUrl = `${req.protocol}://${req.get('host')}/join.html?pin=${pin}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 300, margin: 2 });
    res.json({ qr: qrDataUrl, url: joinUrl });
  } catch (err) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// ──────────────────────────────────────────────
// Socket.io events
// ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // ── HOST: create a new room ──
  socket.on('host:create', ({ hostName }) => {
    const room = createRoom(socket.id, hostName || 'Host');
    socket.join(room.pin);
    socket.emit('host:room_created', { pin: room.pin });
    console.log(`Room created PIN=${room.pin} by ${hostName}`);
  });

  // ── PARTICIPANT: join a room by PIN ──
  socket.on('participant:join', ({ pin, name }) => {
    const room = getRoomByPin(pin);
    if (!room) {
      socket.emit('error', { message: 'Room not found. Check your PIN.' });
      return;
    }
    if (room.status !== 'lobby') {
      socket.emit('error', { message: 'Game has already started.' });
      return;
    }
    if (!name || name.trim().length === 0) {
      socket.emit('error', { message: 'Please enter your name.' });
      return;
    }

    // Prevent duplicate names
    const nameTaken = Object.values(room.participants).some(
      p => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (nameTaken) {
      socket.emit('error', { message: 'That name is already taken in this room.' });
      return;
    }

    room.participants[socket.id] = { name: name.trim(), score: 0, answers: [] };
    socket.join(pin);

    socket.emit('participant:joined', { pin, name: name.trim() });

    // Notify host
    io.to(room.hostSocketId).emit('host:participant_joined', {
      participants: Object.values(room.participants).map(p => ({ name: p.name, score: p.score }))
    });

    console.log(`${name} joined room ${pin}`);
  });

  // ── HOST: start the game ──
  socket.on('host:start', () => {
    const room = getRoomByHost(socket.id);
    if (!room) return;
    if (Object.keys(room.participants).length === 0) {
      socket.emit('error', { message: 'Need at least one participant to start.' });
      return;
    }
    room.status = 'question';
    room.currentQuestion = 0;
    sendQuestion(room);
  });

  // ── HOST: next question (manual advance) ──
  socket.on('host:next', () => {
    const room = getRoomByHost(socket.id);
    if (!room) return;
    advanceQuestion(room);
  });

  // ── PARTICIPANT: submit answer ──
  socket.on('participant:answer', ({ questionIndex, answerIndex }) => {
    const room = getRoomByParticipant(socket.id);
    if (!room) return;
    if (room.status !== 'question') return;
    if (room.currentQuestion !== questionIndex) return;

    const participant = room.participants[socket.id];
    if (!participant) return;

    // Prevent double-answering
    if (participant.answers[questionIndex] !== undefined) return;

    const q = questions[questionIndex];
    const isCorrect = answerIndex === q.correct;
    const points = isCorrect ? 100 : 0;

    participant.answers[questionIndex] = answerIndex;
    participant.score += points;

    socket.emit('participant:answer_result', {
      questionIndex,
      isCorrect,
      correctIndex: q.correct,
      points,
      totalScore: participant.score
    });

    // Notify host of updated scores
    io.to(room.hostSocketId).emit('host:scores_update', {
      leaderboard: leaderboard(room),
      answeredCount: countAnswered(room, questionIndex)
    });

    // Auto-advance if everyone has answered
    const total = Object.keys(room.participants).length;
    const answered = countAnswered(room, questionIndex);
    if (answered >= total) {
      clearTimeout(room.questionTimer);
      setTimeout(() => showQuestionResults(room), 1000);
    }
  });

  // ── Disconnect cleanup ──
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    const room = getRoomByHost(socket.id);
    if (room) {
      // Host left — notify all participants
      io.to(room.pin).emit('game:host_left', { message: 'The host disconnected. Game over.' });
      clearTimeout(room.questionTimer);
      delete rooms[room.pin];
    } else {
      const pRoom = getRoomByParticipant(socket.id);
      if (pRoom) {
        const name = pRoom.participants[socket.id]?.name;
        delete pRoom.participants[socket.id];
        io.to(pRoom.hostSocketId).emit('host:participant_left', {
          name,
          participants: Object.values(pRoom.participants).map(p => ({ name: p.name, score: p.score }))
        });
      }
    }
  });
});

// ──────────────────────────────────────────────
// Game flow helpers
// ──────────────────────────────────────────────
function countAnswered(room, questionIndex) {
  return Object.values(room.participants).filter(
    p => p.answers[questionIndex] !== undefined
  ).length;
}

function sendQuestion(room) {
  const q = questions[room.currentQuestion];
  const payload = {
    questionIndex: room.currentQuestion,
    total: questions.length,
    ...safeQuestion(q)
  };

  // Tell everyone in the room
  io.to(room.pin).emit('game:question', payload);

  // Host also gets the correct answer index
  io.to(room.hostSocketId).emit('host:question_answer', { correct: q.correct });

  // Auto-advance after time limit
  room.questionTimer = setTimeout(() => {
    showQuestionResults(room);
  }, (q.timeLimit + 1) * 1000);
}

function showQuestionResults(room) {
  clearTimeout(room.questionTimer);
  const q = questions[room.currentQuestion];

  io.to(room.pin).emit('game:question_results', {
    questionIndex: room.currentQuestion,
    correctIndex: q.correct,
    correctAnswer: q.options[q.correct],
    leaderboard: leaderboard(room)
  });

  // Host decides when to advance (or auto after 5s)
  room.questionTimer = setTimeout(() => {
    advanceQuestion(room);
  }, 5000);
}

function advanceQuestion(room) {
  clearTimeout(room.questionTimer);
  room.currentQuestion++;

  if (room.currentQuestion >= questions.length) {
    endGame(room);
  } else {
    sendQuestion(room);
  }
}

function endGame(room) {
  room.status = 'finished';
  io.to(room.pin).emit('game:finished', {
    leaderboard: leaderboard(room)
  });
  console.log(`Game finished in room ${room.pin}`);
}

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎮 Quiz Game running at http://localhost:${PORT}`);
  console.log(`   Host:  http://localhost:${PORT}/host.html`);
  console.log(`   Join:  http://localhost:${PORT}/join.html\n`);
});
