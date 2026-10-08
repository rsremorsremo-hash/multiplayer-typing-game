const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, "public")));

const PASSAGES = [
  "Speed and precision pave the road to victory in every arena.",
  "Technology empowers mind over matter when execution meets focus.",
  "Mastery of the keyboard opens doors to effortless creative momentum.",
  "Consistency beats intensity when building long term typing speed.",
  "Practice and patience turn raw effort into steady, confident momentum.",
  "Every keystroke sharpens rhythm, focus, and the path to success."
];

const rooms = {};

function randomPassage() {
  return PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
}

function createRoom(roomId) {
  return {
    id: roomId,
    passage: randomPassage(),
    players: {}
  };
}

function sortPlayers(players) {
  return Object.values(players).sort((a, b) => {
    if (a.finished !== b.finished) return Number(b.finished) - Number(a.finished);
    if (b.progress !== a.progress) return b.progress - a.progress;
    return b.wpm - a.wpm;
  });
}

function emitRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.ranking = sortPlayers(room.players);
  io.to(roomId).emit("gameState", room);
}

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ roomId, username }) => {
    const safeRoomId = String(roomId || "").trim().toUpperCase();
    const safeUsername = String(username || "Racer")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 18) || "Racer";

    if (!safeRoomId) {
      socket.emit("errorMessage", "Please enter a valid room code.");
      return;
    }

    socket.join(safeRoomId);

    if (!rooms[safeRoomId]) {
      rooms[safeRoomId] = createRoom(safeRoomId);
    }

    const room = rooms[safeRoomId];

    room.players[socket.id] = {
      id: socket.id,
      username: safeUsername,
      progress: 0,
      wpm: 0,
      finished: false,
      shield: false,
      slow: false
    };

    emitRoomState(safeRoomId);
  });

  socket.on("updateProgress", ({ roomId, progress, wpm, finished }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const player = room.players[socket.id];
    player.progress = Math.max(0, Math.min(100, Number(progress) || 0));
    player.wpm = Math.max(0, Number(wpm) || 0);

    if (finished || player.progress >= 100) {
      player.finished = true;
      player.progress = 100;
    }

    emitRoomState(roomId);
  });

  socket.on("usePowerUp", ({ roomId, type, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const source = room.players[socket.id];
    if (!source) return;

    if (type === "shield") {
      source.shield = true;
      io.to(roomId).emit("gameState", room);
      return;
    }

    if (!targetId) return;

    const target = room.players[targetId];
    if (!target) return;

    if (target.shield) {
      target.shield = false;
      io.to(targetId).emit("powerUpBlocked", { type });
      io.to(roomId).emit("gameState", room);
      return;
    }

    if (type === "slow") {
      target.slow = true;
      setTimeout(() => {
        const activeRoom = rooms[roomId];
        if (activeRoom && activeRoom.players[targetId]) {
          activeRoom.players[targetId].slow = false;
          emitRoomState(roomId);
        }
      }, 4000);
    }

    if (type === "nuke") {
      target.progress = Math.max(0, target.progress - 12);
    }

    io.to(roomId).emit("gameState", room);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room || !room.players[socket.id]) continue;

      delete room.players[socket.id];

      if (Object.keys(room.players).length === 0) {
        delete rooms[roomId];
      } else {
        emitRoomState(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
