import {
  createSocket,
  loadProfile,
  saveProfile,
  loadSession,
  clearSession,
  loadSettings,
  saveSettings
} from "./socket-client.js";
import { getGun } from "./guns.js";
import { MapRenderer, moveCircleLocal } from "./map.js";
import { PlayerSprite } from "./player.js";
import { BulletSprite } from "./bullet.js";
import { ParticlePool } from "./particles.js";
import { SoundManager } from "./sounds.js";
import { HUD } from "./hud.js";
import { renderLeaderboard } from "./leaderboard.js";
import { GameUI, showToast } from "./ui.js";

const session = loadSession();
if (!session?.roomCode || !session?.playerToken) {
  window.location.href = "/";
}

const socket = createSocket();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hud = new HUD();
const settings = {
  volume: 0.6,
  sensitivity: 1,
  showFps: true,
  showPing: true,
  crosshair: "+",
  ...loadSettings()
};
const ui = new GameUI(settings);
const sounds = new SoundManager(settings);
const particles = new ParticlePool(500);

let profile = loadProfile();
let roomInfo = null;
let latestState = {
  players: [],
  bullets: [],
  pickups: [],
  destructibles: [],
  killfeed: [],
  teamScores: { red: 0, blue: 0 },
  hill: null,
  mode: "ffa",
  remaining: null
};

let mapRenderer = new MapRenderer("warehouse");
const playerSprites = new Map();
const bulletSprites = new Map();
const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  scoped: false
};
const mouse = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  down: false,
  right: false
};
const localRuntime = {
  x: 0,
  y: 0,
  angle: 0,
  lastDamageAt: 0,
  reloadStartAt: 0,
  lastFireAt: 0,
  lastPing: 0,
  alive: false,
  spectatingToken: null
};
const camera = {
  x: 0,
  y: 0,
  zoom: 1
};

let scoreboardHeld = false;
let deathState = null;
let currentAnnouncement = null;
let lastFrame = performance.now();
let fps = 0;
let fpsAccumulator = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function getSelfId() {
  return session.playerId || session.playerToken.slice(-8);
}

function getLocalPlayer() {
  const serverPlayer = latestState.players.find((player) => player.token === session.playerToken);
  if (!serverPlayer) return null;

  if (serverPlayer.reloading && !localRuntime.reloading) {
    localRuntime.reloadStartAt = Date.now();
  }
  if (!serverPlayer.reloading) {
    localRuntime.reloadStartAt = 0;
  }
  localRuntime.reloading = serverPlayer.reloading;
  localRuntime.alive = serverPlayer.alive;

  return {
    ...serverPlayer,
    x: localRuntime.x,
    y: localRuntime.y,
    angle: localRuntime.angle,
    lastDamageAt: localRuntime.lastDamageAt,
    reloadStartAt: localRuntime.reloadStartAt
  };
}

function getAimAngle() {
  const viewWidth = canvas.width / camera.zoom;
  const viewHeight = canvas.height / camera.zoom;
  const worldX = camera.x + mouse.x / camera.zoom;
  const worldY = camera.y + mouse.y / camera.zoom;
  return Math.atan2(worldY - localRuntime.y, worldX - localRuntime.x);
}

function getCurrentTeam() {
  const self = latestState.players.find((player) => player.token === session.playerToken);
  return self?.team || "solo";
}

function getRows() {
  return latestState.players
    .filter((player) => !player.spectator)
    .sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
      return a.deaths - b.deaths;
    })
    .map((player, index) => ({
      rank: index + 1,
      playerId: player.id,
      name: player.name,
      kills: player.kills,
      deaths: player.deaths,
      damage: player.damageDealt,
      kd: player.deaths ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2),
      ping: player.ping,
      team: player.team
    }));
}

function setRoomState(room) {
  roomInfo = room;
}

function resyncSession() {
  socket.emit("session:resume", {
    roomCode: session.roomCode,
    playerToken: session.playerToken,
    page: "game"
  }, (response) => {
    if (!response?.ok) {
      ui.setConnectionState("Connection lost. Returning to menu...", true);
      setTimeout(() => {
        clearSession();
        window.location.href = "/";
      }, 1500);
      return;
    }
    setRoomState(response.room);
    profile.playerToken = response.player.token;
    saveProfile(profile);
  });
}

function applyState(snapshot) {
  latestState = snapshot;
  if (snapshot.mapId && snapshot.mapId !== mapRenderer.data.id) {
    mapRenderer.setMap(snapshot.mapId);
  }

  for (const player of snapshot.players) {
    const sprite = playerSprites.get(player.id) || new PlayerSprite(player);
    sprite.applySnapshot(player, !playerSprites.has(player.id));
    playerSprites.set(player.id, sprite);

    if (player.token === session.playerToken) {
      if (!localRuntime.alive || Math.hypot(localRuntime.x - player.x, localRuntime.y - player.y) > 50) {
        localRuntime.x = player.x;
        localRuntime.y = player.y;
      } else {
        localRuntime.x += (player.x - localRuntime.x) * 0.16;
        localRuntime.y += (player.y - localRuntime.y) * 0.16;
      }
      localRuntime.angle = player.angle;
      localRuntime.spectatingToken = player.spectating;
      if (!player.alive) {
        localRuntime.x = player.x;
        localRuntime.y = player.y;
      }
    }
  }

  for (const key of Array.from(playerSprites.keys())) {
    if (!snapshot.players.find((player) => player.id === key)) {
      playerSprites.delete(key);
    }
  }

  for (const bullet of snapshot.bullets) {
    const sprite = bulletSprites.get(bullet.id) || new BulletSprite(bullet);
    sprite.update(bullet, !bulletSprites.has(bullet.id));
    bulletSprites.set(bullet.id, sprite);
  }
  for (const key of Array.from(bulletSprites.keys())) {
    if (!snapshot.bullets.find((bullet) => bullet.id === key)) {
      bulletSprites.delete(key);
    }
  }

  hud.updateKillFeed(snapshot.killfeed);
  hud.renderMinimap(mapRenderer, snapshot, session.playerToken, getCurrentTeam());
}

function drawPickups() {
  for (const pickup of latestState.pickups || []) {
    if (!pickup.active) continue;
    const x = pickup.x - camera.x;
    const y = pickup.y - camera.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = pickup.type === "health"
      ? "#22c55e"
      : pickup.type === "armor"
        ? "#38bdf8"
        : pickup.type === "ammo"
          ? "#ffb800"
          : "#c084fc";
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0a0f";
    if (pickup.type === "health") {
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
    } else if (pickup.type === "armor") {
      ctx.fillRect(-6, -8, 12, 16);
    } else if (pickup.type === "ammo") {
      ctx.fillRect(-8, -8, 16, 16);
    } else {
      ctx.beginPath();
      ctx.moveTo(-4, -8);
      ctx.lineTo(3, -1);
      ctx.lineTo(-1, -1);
      ctx.lineTo(4, 8);
      ctx.lineTo(-3, 1);
      ctx.lineTo(1, 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawSpectatingBanner(target) {
  if (!target) return;
  ctx.save();
  ctx.fillStyle = "rgba(10,10,15,0.68)";
  ctx.fillRect(canvas.width / 2 - 160, 26, 320, 32);
  ctx.fillStyle = "#ffb800";
  ctx.font = "16px 'Share Tech Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`SPECTATING: ${target.name}`, canvas.width / 2, 48);
  ctx.restore();
}

function drawCrosshair(localPlayer) {
  const gun = getGun(localPlayer?.gunId || profile.selectedGunId || 1);
  const moving = input.up || input.down || input.left || input.right;
  const spread = 8 + gun.spreadDeg * 1.2 + (moving ? 8 : 0);

  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.translate(mouse.x, mouse.y);
  if (settings.crosshair === "x") {
    ctx.beginPath();
    ctx.moveTo(-spread, -spread);
    ctx.lineTo(-spread / 2, -spread / 2);
    ctx.moveTo(spread, spread);
    ctx.lineTo(spread / 2, spread / 2);
    ctx.moveTo(-spread, spread);
    ctx.lineTo(-spread / 2, spread / 2);
    ctx.moveTo(spread, -spread);
    ctx.lineTo(spread / 2, -spread / 2);
    ctx.stroke();
  } else if (settings.crosshair === "dot") {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-spread, 0);
    ctx.lineTo(-spread / 2, 0);
    ctx.moveTo(spread, 0);
    ctx.lineTo(spread / 2, 0);
    ctx.moveTo(0, -spread);
    ctx.lineTo(0, -spread / 2);
    ctx.moveTo(0, spread);
    ctx.lineTo(0, spread / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function updateCamera(target, scoped) {
  camera.zoom = scoped ? 2.5 : 1;
  const viewWidth = canvas.width / camera.zoom;
  const viewHeight = canvas.height / camera.zoom;
  camera.x = target.x - viewWidth / 2;
  camera.y = target.y - viewHeight / 2;
}

function updatePrediction(delta, localPlayer) {
  if (!localPlayer || !localPlayer.alive || ui.settingsModal.hidden === false || ui.chatInputWrap.hidden === false) {
    return;
  }

  let dirX = 0;
  let dirY = 0;
  if (input.left) dirX -= 1;
  if (input.right) dirX += 1;
  if (input.up) dirY -= 1;
  if (input.down) dirY += 1;
  const magnitude = Math.hypot(dirX, dirY) || 1;
  dirX /= magnitude;
  dirY /= magnitude;

  const gun = getGun(localPlayer.gunId);
  let speed = 220;
  if (gun.id === 4 && input.scoped) speed *= 0.4;
  if (gun.id === 6 && performance.now() - localRuntime.lastFireAt < 200) speed = 160;
  const colliders = mapRenderer.data.walls.concat((latestState.destructibles || []).filter((item) => item.active));
  const moved = moveCircleLocal(
    localRuntime.x,
    localRuntime.y,
    dirX * speed * delta,
    dirY * speed * delta,
    20,
    colliders,
    { width: mapRenderer.data.width, height: mapRenderer.data.height }
  );
  localRuntime.x = moved.x;
  localRuntime.y = moved.y;
  localRuntime.angle = getAimAngle();

  socket.emit("player:move", {
    x: localRuntime.x,
    y: localRuntime.y,
    angle: localRuntime.angle,
    keys: { ...input, scoped: input.scoped || mouse.right }
  });
}

function tryFire(localPlayer) {
  if (!mouse.down || !localPlayer || !localPlayer.alive || ui.chatInputWrap.hidden === false || ui.settingsModal.hidden === false) {
    return;
  }

  const gun = getGun(localPlayer.gunId);
  const now = performance.now();
  if (now - localRuntime.lastFireAt < 60000 / gun.rpm) {
    return;
  }

  const angle = getAimAngle();
  socket.emit("player:fire", {
    angle,
    gunId: localPlayer.gunId,
    timestamp: Date.now()
  });
  localRuntime.lastFireAt = now;
  particles.emit("muzzle", {
    x: localRuntime.x + Math.cos(angle) * 28,
    y: localRuntime.y + Math.sin(angle) * 28
  });
  const soundMap = {
    1: "pistol_fire",
    2: "ar_fire",
    3: "shotgun_fire",
    4: "sniper_fire",
    5: "smg_fire",
    6: "lmg_fire",
    7: "rocket_fire",
    8: "rocket_fire"
  };
  sounds.play(soundMap[gun.id], { x: localRuntime.x, y: localRuntime.y });
}

function renderWorld(localPlayer, spectatingTarget) {
  const target = localPlayer?.alive ? localPlayer : spectatingTarget || { x: mapRenderer.data.width / 2, y: mapRenderer.data.height / 2 };
  updateCamera(target, localPlayer?.gunId === 4 && (input.scoped || mouse.right) && localPlayer?.alive);
  sounds.setListener(target.x, target.y);

  const viewWidth = canvas.width / camera.zoom;
  const viewHeight = canvas.height / camera.zoom;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  mapRenderer.drawFloor(ctx, camera, viewWidth, viewHeight);
  mapRenderer.drawHill(ctx, camera, latestState.hill);
  drawPickups();
  mapRenderer.drawWalls(ctx, camera, latestState.destructibles);

  for (const bullet of bulletSprites.values()) {
    bullet.tick();
    bullet.draw(ctx, camera);
  }

  for (const sprite of playerSprites.values()) {
    sprite.tick();
    if (sprite.snapshot.token === session.playerToken && localPlayer?.alive) {
      sprite.drawX = localRuntime.x;
      sprite.drawY = localRuntime.y;
      sprite.drawAngle = localRuntime.angle;
    }
    sprite.draw(ctx, camera, session.playerToken, latestState.mode !== "ffa", getCurrentTeam());
  }

  particles.draw(ctx, camera);
  ctx.restore();

  if (!localPlayer?.alive) {
    drawSpectatingBanner(spectatingTarget);
    ctx.fillStyle = "rgba(10,10,15,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawCrosshair(localPlayer || { gunId: profile.selectedGunId });
}

function renderLoop(time) {
  const delta = Math.min(0.05, (time - lastFrame) / 1000);
  lastFrame = time;
  fpsAccumulator.push(1 / delta);
  fpsAccumulator = fpsAccumulator.slice(-20);
  fps = fpsAccumulator.reduce((sum, value) => sum + value, 0) / fpsAccumulator.length;

  const localPlayer = getLocalPlayer();
  if (localPlayer?.alive) {
    updatePrediction(delta, localPlayer);
    tryFire(localPlayer);
  }

  const spectatingTarget = !localPlayer?.alive
    ? latestState.players.find((player) => player.token === localRuntime.spectatingToken && player.alive)
      || latestState.players.find((player) => player.alive)
    : null;

  particles.update(delta);
  hud.renderChat();
  renderWorld(localPlayer, spectatingTarget);

  if (localPlayer) {
    const gun = getGun(localPlayer.gunId);
    hud.updatePlayer(localPlayer, gun, latestState.remaining, latestState.teamScores, latestState.mode);
  }

  hud.updatePerf(settings.showFps ? fps : 0, settings.showPing ? localRuntime.lastPing : 0);

  if (scoreboardHeld) {
    hud.showScoreboard(getRows(), session.playerToken, latestState.mode);
  } else {
    hud.hideScoreboard();
  }

  if (deathState) {
    const remaining = Math.max(0, Math.ceil((deathState.unlockAt - Date.now()) / 1000));
    ui.updateDeathCountdown(remaining, Date.now() >= deathState.unlockAt);
  }

  requestAnimationFrame(renderLoop);
}

function openDeathScreen(payload) {
  const killerName = payload.killerName || "Unknown";
  const gunName = getGun(payload.gunId).name;
  deathState = {
    killerName,
    gunName,
    unlockAt: Date.now() + (roomInfo?.settings?.respawnTime || 3) * 1000
  };

  const rerender = () => {
    const self = latestState.players.find((player) => player.token === session.playerToken) || { kills: 0, deaths: 0, damageDealt: 0 };
    ui.renderDeathScreen(
      {
        killerName,
        gunName,
        kills: self.kills,
        deaths: self.deaths,
        damage: self.damageDealt
      },
      profile.selectedGunId,
      (gunId) => {
        profile.selectedGunId = gunId;
        saveProfile(profile);
        rerender();
      },
      () => {
        if (Date.now() < deathState.unlockAt) return;
        socket.emit("player:respawn", { gunId: profile.selectedGunId });
      }
    );
  };

  rerender();
}

function bindInput() {
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  window.addEventListener("mousedown", (event) => {
    if (event.button === 0) mouse.down = true;
    if (event.button === 2) {
      mouse.right = true;
      input.scoped = true;
    }
  });
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) mouse.down = false;
    if (event.button === 2) {
      mouse.right = false;
      input.scoped = false;
    }
  });
  window.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("blur", () => {
    Object.assign(input, { up: false, down: false, left: false, right: false, scoped: false });
    mouse.down = false;
    mouse.right = false;
  });
  window.addEventListener("keydown", (event) => {
    if (ui.chatInputWrap.hidden === false && event.key !== "Escape") {
      return;
    }
    switch (event.key.toLowerCase()) {
      case "w":
      case "arrowup":
        input.up = true;
        break;
      case "s":
      case "arrowdown":
        input.down = true;
        break;
      case "a":
      case "arrowleft":
        input.left = true;
        break;
      case "d":
      case "arrowright":
        input.right = true;
        break;
      case "r":
        socket.emit("player:reload");
        break;
      case "z":
        input.scoped = true;
        break;
      case "m":
        showToast(sounds.toggleMute() ? "Muted" : "Audio on");
        break;
      case "enter":
        event.preventDefault();
        ui.showChatInput(true);
        break;
      case "escape":
        ui.toggleSettings(ui.settingsModal.hidden);
        break;
      case "tab":
        event.preventDefault();
        if (!getLocalPlayer()?.alive) {
          const alive = latestState.players.filter((player) => player.alive);
          if (!alive.length) break;
          const currentIndex = alive.findIndex((player) => player.token === localRuntime.spectatingToken);
          const next = alive[(currentIndex + 1 + alive.length) % alive.length];
          localRuntime.spectatingToken = next.token;
        } else {
          scoreboardHeld = true;
        }
        break;
      default:
        break;
    }
  });
  window.addEventListener("keyup", (event) => {
    switch (event.key.toLowerCase()) {
      case "w":
      case "arrowup":
        input.up = false;
        break;
      case "s":
      case "arrowdown":
        input.down = false;
        break;
      case "a":
      case "arrowleft":
        input.left = false;
        break;
      case "d":
      case "arrowright":
        input.right = false;
        break;
      case "z":
        input.scoped = false;
        break;
      case "tab":
        scoreboardHeld = false;
        break;
      default:
        break;
    }
  });
}

function bindSocket() {
  socket.on("connect", () => {
    ui.setConnectionState("Connected", false);
    resyncSession();
  });
  socket.on("disconnect", () => {
    ui.setConnectionState("Reconnecting...", true);
  });
  socket.io.on("reconnect_attempt", (attempt) => {
    ui.setConnectionState(`Reconnecting... (${attempt}/3)`, true);
  });
  socket.io.on("reconnect_failed", () => {
    ui.setConnectionState("Connection lost. Return to menu.", true);
  });

  socket.on("room:update", (room) => {
    setRoomState(room);
  });
  socket.on("room:kicked", () => {
    clearSession();
    window.location.href = "/";
  });
  socket.on("room:error", (payload) => showToast(payload.message || "Server error", "error"));

  socket.on("game:start", (payload) => {
    latestState.mode = payload.mode;
    mapRenderer.setMap(payload.mapId);
    if (roomInfo) roomInfo.settings = payload.settings;
  });

  socket.on("game:state", (snapshot) => {
    applyState(snapshot);
  });

  socket.on("timer:tick", (payload) => {
    latestState.remaining = payload.remaining;
  });

  socket.on("bullet:fired", ({ x, y, gunId }) => {
    particles.emit("muzzle", { x, y });
    if (gunId !== getLocalPlayer()?.gunId) {
      sounds.play(gunId === 4 ? "sniper_fire" : gunId === 3 ? "shotgun_fire" : gunId === 7 || gunId === 8 ? "rocket_fire" : "ar_fire", { x, y });
    }
  });

  socket.on("bullet:hit", ({ x, y, type }) => {
    if (type === "player") {
      particles.emit("blood", { x, y });
      sounds.play("hit_flesh", { x, y });
    } else if (type === "explosion") {
      particles.emit("explosion", { x, y });
      sounds.play("explosion", { x, y });
    } else {
      particles.emit("wall", { x, y });
      sounds.play("hit_wall", { x, y });
    }
  });

  socket.on("player:hit", ({ victimId, damage, x, y }) => {
    particles.addDamageNumber(x, y, damage);
    if (victimId === getSelfId()) {
      localRuntime.lastDamageAt = Date.now();
    }
  });

  socket.on("player:killed", (payload) => {
    if (payload.killerId === getSelfId()) {
      sounds.play("kill_confirm");
    }
    if (payload.victimId === getSelfId()) {
      localRuntime.spectatingToken = latestState.players.find((player) => player.id === payload.killerId)?.token || null;
      openDeathScreen(payload);
      sounds.play("death");
    }
  });

  socket.on("player:spawned", ({ playerId }) => {
    if (playerId === getSelfId()) {
      deathState = null;
      ui.hideDeathScreen();
    }
  });

  socket.on("pickup:taken", () => {
    sounds.play("pickup");
  });

  socket.on("chat:message", (message) => {
    hud.addChatMessage(message);
  });

  socket.on("match:announcement", ({ text, type }) => {
    currentAnnouncement = { text, type };
    ui.showAnnouncement(text, type);
  });

  socket.on("net:pong", ({ latency }) => {
    localRuntime.lastPing = latency;
  });

  socket.on("game:end", (result) => {
    const modal = document.getElementById("leaderboardModal");
    modal.hidden = false;
    renderLeaderboard(modal, result, session.playerToken);
    document.getElementById("playAgainBtn").addEventListener("click", () => {
      modal.hidden = true;
      socket.emit("room:playAgain");
    });
    document.getElementById("backLobbyBtn").addEventListener("click", () => {
      window.location.href = "/index.html";
    });
    document.getElementById("mainMenuBtn").addEventListener("click", () => {
      socket.emit("room:leave");
      clearSession();
      window.location.href = "/";
    });
  });
}

function initUI() {
  ui.initSettings((next) => {
    saveSettings(next);
    sounds.setVolume(next.volume);
  }, () => {
    socket.emit("room:leave");
    clearSession();
    window.location.href = "/";
  });
  ui.bindChatSubmit((text) => {
    socket.emit("chat:send", { text });
    ui.showChatInput(false);
  });
}

function startNetworkHeartbeat() {
  setInterval(() => {
    socket.emit("net:ping", { sentAt: Date.now() });
  }, 2000);
}

function init() {
  resizeCanvas();
  initUI();
  bindInput();
  bindSocket();
  startNetworkHeartbeat();
  requestAnimationFrame(renderLoop);
}

init();
