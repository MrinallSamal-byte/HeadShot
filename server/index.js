const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { RoomManager, sanitizeName, sanitizeColor } = require("./room-manager");

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const roomManager = new RoomManager(io, {
  motd: "MOTD: Match data resets every round. Host can kick, rebalance, and replay without rebuilding the room."
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    rooms: roomManager.rooms.size
  });
});

function withRateLimit(socket, handler) {
  return (...args) => {
    if (!roomManager.consumeEvent(socket.id)) {
      socket.emit("room:error", { message: "Too many messages per second. Disconnecting." });
      socket.disconnect(true);
      return;
    }
    try {
      handler(...args);
    } catch (error) {
      socket.emit("room:error", { message: error.message || "Unexpected server error" });
    }
  };
}

io.on("connection", (socket) => {
  socket.emit("server:config", {
    motd: roomManager.options.motd
  });

  socket.on("session:resume", withRateLimit(socket, (payload = {}, ack) => {
    const result = roomManager.resume(socket, payload);
    ack?.({
      ok: true,
      room: roomManager.buildRoomPayload(result.room),
      player: {
        token: result.player.token,
        id: result.player.id,
        name: result.player.name,
        color: result.player.color
      }
    });
    if (result.room.status === "playing" || result.room.status === "ended") {
      socket.emit("game:start", {
        roomCode: result.room.code,
        mapId: result.room.settings.mapId,
        mode: result.room.settings.mode,
        timeLimit: result.room.settings.timeLimit,
        settings: result.room.settings
      });
      result.room.gameState?.sendSnapshotTo(socket);
      if (result.room.status === "ended" && result.room.lastResult) {
        socket.emit("game:end", result.room.lastResult);
      }
    }
  }));

  socket.on("room:create", withRateLimit(socket, (payload = {}, ack) => {
    const { room, player } = roomManager.createRoom(socket, {
      playerName: sanitizeName(payload.playerName),
      color: sanitizeColor(payload.color),
      playerToken: payload.playerToken,
      selectedGunId: payload.selectedGunId,
      settings: payload.settings
    });
    ack?.({
      ok: true,
      room: roomManager.buildRoomPayload(room),
      player: {
        token: player.token,
        id: player.id,
        name: player.name,
        color: player.color
      }
    });
  }));

  socket.on("room:quickplay", withRateLimit(socket, (payload = {}, ack) => {
    const room = roomManager.quickPlay(socket, {
      playerName: sanitizeName(payload.playerName),
      color: sanitizeColor(payload.color),
      playerToken: payload.playerToken,
      selectedGunId: payload.selectedGunId
    });
    const player = room.players.get(Array.from(room.players.keys()).find((token) => room.players.get(token).socketId === socket.id));
    ack?.({
      ok: true,
      room: roomManager.buildRoomPayload(room),
      player: {
        token: player.token,
        id: player.id,
        name: player.name,
        color: player.color
      }
    });
  }));

  socket.on("room:join", withRateLimit(socket, (payload = {}, ack) => {
    const result = roomManager.joinRoom(socket, {
      code: payload.code,
      playerName: sanitizeName(payload.playerName),
      color: sanitizeColor(payload.color),
      playerToken: payload.playerToken,
      selectedGunId: payload.selectedGunId
    });
    ack?.({
      ok: true,
      room: roomManager.buildRoomPayload(result.room),
      player: {
        token: result.player.token,
        id: result.player.id,
        name: result.player.name,
        color: result.player.color
      },
      spectator: result.spectator
    });
  }));

  socket.on("room:settings", withRateLimit(socket, (patch) => {
    roomManager.updateSettings(socket.id, patch);
  }));

  socket.on("room:ready", withRateLimit(socket, (payload) => {
    roomManager.setReady(socket.id, payload?.ready);
  }));

  socket.on("room:start", withRateLimit(socket, (_payload, ack) => {
    roomManager.startRoom(socket.id);
    ack?.({ ok: true });
  }));

  socket.on("room:playAgain", withRateLimit(socket, () => {
    roomManager.playAgain(socket.id);
  }));

  socket.on("room:team", withRateLimit(socket, (payload) => {
    roomManager.changeTeam(socket.id, payload?.token, payload?.team);
  }));

  socket.on("room:kick", withRateLimit(socket, (payload) => {
    roomManager.kick(socket.id, payload?.token);
  }));

  socket.on("room:leave", withRateLimit(socket, () => {
    roomManager.leave(socket.id, true);
  }));

  socket.on("player:move", withRateLimit(socket, (payload) => {
    const context = roomManager.getRoomBySocket(socket.id);
    context?.room.gameState?.handleMove(context.player.token, payload);
  }));

  socket.on("player:fire", withRateLimit(socket, (payload) => {
    const context = roomManager.getRoomBySocket(socket.id);
    context?.room.gameState?.handleFire(context.player.token, payload);
  }));

  socket.on("player:reload", withRateLimit(socket, () => {
    const context = roomManager.getRoomBySocket(socket.id);
    context?.room.gameState?.startReload(context.player.token);
  }));

  socket.on("player:respawn", withRateLimit(socket, (payload) => {
    const context = roomManager.getRoomBySocket(socket.id);
    context?.room.gameState?.handleRespawn(context.player.token, payload?.gunId);
  }));

  socket.on("chat:send", withRateLimit(socket, (payload) => {
    roomManager.sendChat(socket.id, payload?.text);
  }));

  socket.on("net:ping", withRateLimit(socket, (payload) => {
    roomManager.handlePing(socket.id, payload?.sentAt);
  }));

  socket.on("disconnect", () => {
    roomManager.leave(socket.id, false);
  });
});

server.listen(PORT, () => {
  process.stdout.write(`HEADSHOT server running on http://localhost:${PORT}\n`);
});
