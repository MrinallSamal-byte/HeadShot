const { GameState } = require("./game-state");

const DEFAULT_SETTINGS = {
  mode: "ffa",
  mapId: "warehouse",
  timeLimit: 300,
  killLimit: 20,
  maxPlayers: 8,
  friendlyFire: false,
  respawnTime: 3,
  startHp: 100,
  allowPickups: true,
  regenEnabled: true
};

function sanitizeName(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/[^\w]/g, "_")
    .slice(0, 16);
  return cleaned || `Player_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function sanitizeColor(color) {
  const allowed = ["#00FF88", "#FF3344", "#FFB800", "#7DD3FC", "#C084FC", "#F97316"];
  return allowed.includes(color) ? color : "#00FF88";
}

function makeToken(token) {
  return token && token.length >= 8 ? token : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSettings(settings = {}) {
  const next = { ...DEFAULT_SETTINGS };
  if (["ffa", "tdm", "koth"].includes(settings.mode)) {
    next.mode = settings.mode;
  }
  if (["warehouse", "city", "bunker"].includes(settings.mapId)) {
    next.mapId = settings.mapId;
  }
  if ([null, 180, 300, 600, 900].includes(settings.timeLimit) || Number.isFinite(settings.timeLimit)) {
    next.timeLimit = settings.timeLimit ? Math.max(0, Number(settings.timeLimit)) : null;
  }
  if ([null, 10, 20, 30, 50].includes(settings.killLimit) || Number.isFinite(settings.killLimit)) {
    next.killLimit = settings.killLimit ? Math.max(0, Number(settings.killLimit)) : null;
  }
  if ([2, 4, 6, 8, 10, 16].includes(Number(settings.maxPlayers))) {
    next.maxPlayers = Number(settings.maxPlayers);
  }
  if ([0, 3, 5, 10].includes(Number(settings.respawnTime))) {
    next.respawnTime = Number(settings.respawnTime);
  }
  if ([50, 75, 100, 150, 200].includes(Number(settings.startHp))) {
    next.startHp = Number(settings.startHp);
  }
  if (typeof settings.friendlyFire === "boolean") {
    next.friendlyFire = settings.friendlyFire;
  }
  if (typeof settings.allowPickups === "boolean") {
    next.allowPickups = settings.allowPickups;
  }
  if (typeof settings.regenEnabled === "boolean") {
    next.regenEnabled = settings.regenEnabled;
  }
  return next;
}

class RoomManager {
  constructor(io, options = {}) {
    this.io = io;
    this.options = {
      motd: options.motd || "Welcome to HEADSHOT. Host sets the rules. Last squad standing wins the bragging rights."
    };
    this.rooms = new Map();
    this.socketIndex = new Map();
    this.disconnectTimers = new Map();
    this.roomCleanupTimers = new Map();
    this.publicStartTimers = new Map();
  }

  generateCode() {
    let code = "";
    do {
      code = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (this.rooms.has(code));
    return code;
  }

  listPlayers(room) {
    return Array.from(room.players.values()).map((player) => ({
      id: player.id,
      token: player.token,
      name: player.name,
      ready: player.ready,
      isHost: player.isHost,
      connected: player.connected,
      team: player.team,
      color: player.color,
      ping: player.ping || 0,
      spectator: !!player.spectator,
      selectedGunId: player.selectedGunId || 1
    }));
  }

  buildRoomPayload(room) {
    return {
      code: room.code,
      publicRoom: room.publicRoom,
      status: room.status,
      motd: room.motd,
      hostId: room.hostToken,
      settings: room.settings,
      players: this.listPlayers(room),
      canStart: this.canStart(room),
      lastResult: room.lastResult || null
    };
  }

  broadcastRoomUpdate(room) {
    this.io.to(room.code).emit("room:update", this.buildRoomPayload(room));
  }

  uniqueName(room, desiredName, token) {
    const base = sanitizeName(desiredName);
    const occupied = new Set(
      Array.from(room.players.values())
        .filter((player) => player.token !== token)
        .map((player) => player.name.toLowerCase())
    );

    if (!occupied.has(base.toLowerCase())) {
      return base;
    }

    let suffix = 2;
    while (occupied.has(`${base}_${suffix}`.toLowerCase())) {
      suffix += 1;
    }
    return `${base}_${suffix}`;
  }

  createRoomRecord(code, publicRoom = false, settings = {}) {
    const room = {
      code,
      publicRoom,
      motd: this.options.motd,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "lobby",
      hostToken: null,
      settings: normalizeSettings(settings),
      players: new Map(),
      gameState: null,
      lastResult: null
    };
    this.rooms.set(code, room);
    return room;
  }

  assignBalancedTeam(room) {
    const counts = { red: 0, blue: 0 };
    for (const player of room.players.values()) {
      if (player.team === "red") counts.red += 1;
      if (player.team === "blue") counts.blue += 1;
    }
    return counts.red <= counts.blue ? "red" : "blue";
  }

  attachSocket(room, player, socket) {
    if (player.socketId && player.socketId !== socket.id) {
      this.socketIndex.delete(player.socketId);
    }
    player.socketId = socket.id;
    player.connected = true;
    room.updatedAt = Date.now();
    this.socketIndex.set(socket.id, { roomCode: room.code, token: player.token });
    socket.join(room.code);

    const disconnectTimerKey = `${room.code}:${player.token}`;
    if (this.disconnectTimers.has(disconnectTimerKey)) {
      clearTimeout(this.disconnectTimers.get(disconnectTimerKey));
      this.disconnectTimers.delete(disconnectTimerKey);
    }
  }

  createOrReusePlayer(room, socket, payload, isHost = false, spectator = false) {
    const token = makeToken(payload.playerToken);
    const existing = room.players.get(token);
    if (existing) {
      existing.name = this.uniqueName(room, payload.playerName || existing.name, token);
      existing.color = sanitizeColor(payload.color || existing.color);
      existing.spectator = spectator;
      if (isHost) {
        existing.isHost = true;
      }
      this.attachSocket(room, existing, socket);
      return existing;
    }

    const player = {
      id: token.slice(-8),
      token,
      name: this.uniqueName(room, payload.playerName, token),
      color: sanitizeColor(payload.color),
      joinedAt: Date.now(),
      ready: room.publicRoom,
      isHost,
      connected: true,
      socketId: socket.id,
      team: room.settings.mode === "ffa" ? "solo" : this.assignBalancedTeam(room),
      ping: 0,
      spectator,
      selectedGunId: Number(payload.selectedGunId) || 1
    };
    room.players.set(token, player);
    this.attachSocket(room, player, socket);
    return player;
  }

  findPublicRoom() {
    return Array.from(this.rooms.values()).find(
      (room) => room.publicRoom && room.status === "lobby" && room.players.size < room.settings.maxPlayers
    );
  }

  quickPlay(socket, payload = {}) {
    const room = this.findPublicRoom() || this.createRoomRecord(this.generateCode(), true, {
      ...DEFAULT_SETTINGS,
      mode: "ffa",
      maxPlayers: 8
    });
    if (!room.hostToken) {
      const host = this.createOrReusePlayer(room, socket, payload, true, false);
      room.hostToken = host.token;
    } else {
      this.createOrReusePlayer(room, socket, payload, false, false);
    }
    this.broadcastRoomUpdate(room);
    this.schedulePublicStart(room);
    return room;
  }

  createRoom(socket, payload = {}) {
    const room = this.createRoomRecord(this.generateCode(), false, payload.settings || {});
    const player = this.createOrReusePlayer(room, socket, payload, true, false);
    room.hostToken = player.token;
    this.broadcastRoomUpdate(room);
    return { room, player };
  }

  joinRoom(socket, payload = {}) {
    const code = String(payload.code || "").trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error("Room not found or expired");
    }

    if (room.status === "playing" && !room.players.has(makeToken(payload.playerToken))) {
      const player = this.createOrReusePlayer(room, socket, payload, false, true);
      this.broadcastRoomUpdate(room);
      return { room, player, spectator: true };
    }

    if (room.players.size >= room.settings.maxPlayers && !room.players.has(makeToken(payload.playerToken))) {
      throw new Error(`Room is full (${room.players.size}/${room.settings.maxPlayers} players)`);
    }

    const player = this.createOrReusePlayer(room, socket, payload, false, false);
    if (room.settings.mode !== "ffa") {
      player.team = this.assignBalancedTeam(room);
    }
    this.broadcastRoomUpdate(room);
    return { room, player, spectator: false };
  }

  resume(socket, payload = {}) {
    const room = this.rooms.get(String(payload.roomCode || "").trim().toUpperCase());
    if (!room) {
      throw new Error("Room not found or expired");
    }

    const player = room.players.get(makeToken(payload.playerToken));
    if (!player) {
      throw new Error("Session expired");
    }

    this.attachSocket(room, player, socket);
    this.broadcastRoomUpdate(room);
    return { room, player };
  }

  consumeEvent(socketId) {
    const entry = this.socketIndex.get(socketId);
    if (!entry) {
      return true;
    }
    const now = Date.now();
    const room = this.rooms.get(entry.roomCode);
    const player = room?.players.get(entry.token);
    if (!player) {
      return true;
    }
    if (!player.rateWindowStart || now - player.rateWindowStart > 1000) {
      player.rateWindowStart = now;
      player.rateCount = 0;
      player.rateViolations = 0;
    }
    player.rateCount += 1;
    if (player.rateCount > 120) {
      player.rateViolations = (player.rateViolations || 0) + 1;
      if (player.rateViolations >= 3) {
        return false;
      }
    }
    return true;
  }

  getRoomBySocket(socketId) {
    const entry = this.socketIndex.get(socketId);
    if (!entry) {
      return null;
    }
    const room = this.rooms.get(entry.roomCode);
    if (!room) {
      return null;
    }
    return { room, player: room.players.get(entry.token) };
  }

  canStart(room) {
    if (room.status === "playing") {
      return false;
    }
    const players = Array.from(room.players.values()).filter((player) => !player.spectator);
    if (!players.length) {
      return false;
    }
    if (room.publicRoom) {
      return players.length >= 2;
    }
    return players.every((player) => player.isHost || player.ready);
  }

  updateSettings(socketId, patch = {}) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    if (!player.isHost || room.status === "playing") {
      return;
    }
    room.settings = normalizeSettings({ ...room.settings, ...patch });
    for (const member of room.players.values()) {
      if (room.settings.mode === "ffa") {
        member.team = "solo";
      } else if (member.team !== "red" && member.team !== "blue") {
        member.team = this.assignBalancedTeam(room);
      }
    }
    this.broadcastRoomUpdate(room);
  }

  setReady(socketId, ready) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    if (room.publicRoom) {
      player.ready = true;
      this.schedulePublicStart(room);
      return;
    }
    if (player.isHost) {
      return;
    }
    player.ready = !!ready;
    this.broadcastRoomUpdate(room);
  }

  changeTeam(socketId, targetToken, team) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    if (!player.isHost || room.settings.mode === "ffa") {
      return;
    }
    const target = room.players.get(targetToken);
    if (!target) {
      return;
    }
    target.team = team === "blue" ? "blue" : "red";
    this.broadcastRoomUpdate(room);
  }

  autoBalance(room) {
    if (!["tdm", "koth"].includes(room.settings.mode)) {
      return;
    }
    const players = Array.from(room.players.values()).filter((player) => !player.spectator);
    const red = players.filter((player) => player.team === "red");
    const blue = players.filter((player) => player.team === "blue");
    if (Math.abs(red.length - blue.length) < 2) {
      return;
    }
    const larger = red.length > blue.length ? red : blue;
    const smallerTeam = red.length > blue.length ? "blue" : "red";
    const newest = larger
      .filter((player) => !player.isHost)
      .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))[0];
    if (newest) {
      newest.team = smallerTeam;
      this.io.to(room.code).emit("match:announcement", {
        text: `${newest.name} moved to Team ${smallerTeam === "red" ? "Red" : "Blue"} for balance`,
        type: "balance"
      });
      this.broadcastRoomUpdate(room);
    }
  }

  startRoom(socketId) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      throw new Error("No room session found");
    }
    const { room, player } = context;
    if (!player.isHost) {
      throw new Error("Only the host can start the match");
    }
    if (!this.canStart(room)) {
      throw new Error("All players must be ready");
    }
    return this.startGame(room);
  }

  startGame(room) {
    if (room.gameState) {
      room.gameState.stop();
    }
    room.status = "playing";
    room.lastResult = null;
    room.gameState = new GameState(room, this.io, {
      onEnd: (result) => {
        room.status = "ended";
        room.lastResult = result;
        this.broadcastRoomUpdate(room);
      }
    });
    room.gameState.start();
    this.broadcastRoomUpdate(room);
    this.io.to(room.code).emit("game:start", {
      roomCode: room.code,
      mapId: room.settings.mapId,
      mode: room.settings.mode,
      timeLimit: room.settings.timeLimit,
      settings: room.settings
    });
    return room;
  }

  playAgain(socketId) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    if (!player.isHost) {
      return;
    }
    this.startGame(room);
  }

  leave(socketId, immediate = false) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    player.connected = false;
    this.socketIndex.delete(socketId);

    const removeNow = () => {
      room.players.delete(player.token);
      if (room.gameState) {
        room.gameState.removePlayer(player.token);
      }
      if (room.hostToken === player.token) {
        const nextHost = Array.from(room.players.values())[0];
        room.hostToken = nextHost ? nextHost.token : null;
        if (nextHost) {
          nextHost.isHost = true;
        }
      }
      if (!room.players.size) {
        this.scheduleRoomCleanup(room.code);
      } else {
        this.autoBalance(room);
        this.broadcastRoomUpdate(room);
      }
    };

    if (immediate) {
      removeNow();
      return;
    }

    const key = `${room.code}:${player.token}`;
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      if (!room.players.get(player.token)?.connected) {
        removeNow();
      }
    }, 15000);
    this.disconnectTimers.set(key, timer);
    this.broadcastRoomUpdate(room);
  }

  scheduleRoomCleanup(code) {
    if (this.roomCleanupTimers.has(code)) {
      return;
    }
    const timer = setTimeout(() => {
      this.roomCleanupTimers.delete(code);
      const room = this.rooms.get(code);
      if (!room || room.players.size > 0) {
        return;
      }
      if (room.gameState) {
        room.gameState.stop();
      }
      this.rooms.delete(code);
    }, 10 * 60 * 1000);
    this.roomCleanupTimers.set(code, timer);
  }

  schedulePublicStart(room) {
    if (!room.publicRoom || room.status !== "lobby" || room.players.size < 2) {
      return;
    }
    if (this.publicStartTimers.has(room.code)) {
      return;
    }
    const timer = setTimeout(() => {
      this.publicStartTimers.delete(room.code);
      if (room.status === "lobby" && room.players.size >= 2) {
        this.startGame(room);
      }
    }, 4000);
    this.publicStartTimers.set(room.code, timer);
  }

  kick(socketId, targetToken) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    if (!player.isHost || targetToken === player.token) {
      return;
    }
    const target = room.players.get(targetToken);
    if (!target) {
      return;
    }
    if (target.socketId) {
      this.io.to(target.socketId).emit("room:kicked", { code: room.code });
      const targetSocket = this.io.sockets.sockets.get(target.socketId);
      targetSocket?.leave(room.code);
    }
    room.players.delete(target.token);
    room.gameState?.removePlayer(target.token);
    this.broadcastRoomUpdate(room);
  }

  handlePing(socketId, sentAt) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { player } = context;
    const latency = Math.max(0, Date.now() - Number(sentAt || Date.now()));
    player.ping = latency;
    this.io.to(socketId).emit("net:pong", { sentAt, latency });
  }

  sendChat(socketId, text) {
    const context = this.getRoomBySocket(socketId);
    if (!context) {
      return;
    }
    const { room, player } = context;
    const cleaned = String(text || "").trim().slice(0, 140);
    if (!cleaned) {
      return;
    }
    const teamOnly = cleaned.startsWith("[T]") || cleaned.startsWith("/t ");
    const payload = {
      sender: player.name,
      text: cleaned.replace(/^\[T\]\s*/i, "").replace(/^\/t\s*/i, ""),
      team: teamOnly,
      color: player.color
    };
    if (teamOnly && player.team !== "solo") {
      for (const member of room.players.values()) {
        if (member.team === player.team && member.connected && member.socketId) {
          this.io.to(member.socketId).emit("chat:message", payload);
        }
      }
    } else {
      this.io.to(room.code).emit("chat:message", payload);
    }
  }
}

module.exports = {
  RoomManager,
  DEFAULT_SETTINGS,
  sanitizeName,
  sanitizeColor,
  makeToken
};
