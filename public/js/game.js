import {
  createSocket,
  addMatchToStats,
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
const SELF_ID = session.playerToken.slice(-8);
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

const socket = createSocket();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const spectatorBanner = document.getElementById("spectatorBanner");
const specTargetName = document.getElementById("specTargetName");
const specTargetHp = document.getElementById("specTargetHp");
const specTargetGun = document.getElementById("specTargetGun");
const respawnCountdown = document.getElementById("respawnCountdown");
const respawnSecs = document.getElementById("respawnSecs");
const mobileControls = document.getElementById("mobileControls");
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownNumber = document.getElementById("countdownNumber");
const matchFoundOverlay = document.getElementById("matchFoundOverlay");
const matchFoundTitle = document.getElementById("matchFoundTitle");
const matchFoundSubtitle = document.getElementById("matchFoundSubtitle");
const roomCodePill = document.getElementById("roomCodePill");
const inGameRoomCode = document.getElementById("inGameRoomCode");
const damageDirections = document.getElementById("damageDirections");

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
  reloading: false,
  lastFireAt: 0,
  lastEmptyClickAt: 0,
  lastHeartbeatAt: 0,
  lastBoostParticleAt: 0,
  hitMarkerAt: 0,
  justKilledId: null,
  lastPing: 0,
  alive: false,
  spectatingToken: null,
  warmupUntil: 0
};
const camera = {
  x: 0,
  y: 0,
  zoom: 1
};

let scoreboardHeld = false;
let deathState = null;
let currentAnnouncement = null;
let matchFoundTimer = null;
let lastFrame = performance.now();
let fps = 0;
let fpsAccumulator = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function getLocalPlayer() {
  const serverPlayer = latestState.players.find((player) => player.token === session.playerToken);
  if (!serverPlayer) return null;

  if (serverPlayer.reloading && !localRuntime.reloading) {
    localRuntime.reloadStartAt = serverPlayer.reloadEndAt - getGun(serverPlayer.gunId).reloadTime * 1000;
    sounds.play("reload", { x: localRuntime.x, y: localRuntime.y });
  }
  if (!serverPlayer.reloading && localRuntime.reloading) {
    sounds.play("reload_done", { x: localRuntime.x, y: localRuntime.y });
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
      if (latestState.mode === "koth" && b.kothScore !== a.kothScore) {
        return b.kothScore - a.kothScore;
      }
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
      team: player.team,
      hillScore: player.kothScore || 0
    }));
}

function setRoomState(room) {
  roomInfo = room;
  if (room && !room.publicRoom && room.code) {
    roomCodePill.hidden = false;
    inGameRoomCode.textContent = room.code;
  } else {
    roomCodePill.hidden = true;
  }
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
    if (response.room.status === "lobby") {
      window.location.href = "/index.html";
    }
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
  const hitAge = performance.now() - (localRuntime.hitMarkerAt || 0);
  if (hitAge < 120) {
    ctx.strokeStyle = `rgba(255,51,68,${1 - hitAge / 120})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(6, 6);
    ctx.moveTo(6, -6);
    ctx.lineTo(-6, 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGrenadeTrajectory(localPlayer) {
  if (!localPlayer?.alive || localPlayer.gunId !== 8) return;

  const angle = getAimAngle();
  const maxRange = 1000;
  const stepSize = 20;
  const colliders = mapRenderer.data.walls.concat((latestState.destructibles || []).filter((item) => item.active));

  ctx.save();
  ctx.strokeStyle = "rgba(192,132,252,0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();

  let x = localRuntime.x - camera.x;
  let y = localRuntime.y - camera.y;
  let vx = Math.cos(angle);
  let vy = Math.sin(angle);
  let bounced = false;
  let traveled = 0;

  ctx.moveTo(x, y);
  while (traveled < maxRange) {
    const nx = x + vx * stepSize;
    const ny = y + vy * stepSize;
    let blocked = false;

    for (const wall of colliders) {
      const worldX = nx + camera.x;
      const worldY = ny + camera.y;
      if (worldX < wall.x || worldX > wall.x + wall.w || worldY < wall.y || worldY > wall.y + wall.h) {
        continue;
      }
      if (!bounced) {
        const fromLeft = x + camera.x < wall.x;
        const fromTop = y + camera.y < wall.y;
        if (
          Math.abs(worldX - (fromLeft ? wall.x : wall.x + wall.w))
          < Math.abs(worldY - (fromTop ? wall.y : wall.y + wall.h))
        ) {
          vx = -vx;
        } else {
          vy = -vy;
        }
        bounced = true;
      }
      blocked = true;
      break;
    }

    if (!blocked) {
      x = nx;
      y = ny;
      ctx.lineTo(x, y);
    } else if (bounced) {
      ctx.lineTo(x, y);
      break;
    }
    traveled += stepSize;
  }

  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(192,132,252,0.7)";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function showDamageDirection(fromWorldX, fromWorldY) {
  const angle = Math.atan2(fromWorldY - localRuntime.y, fromWorldX - localRuntime.x);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = Math.min(cx, cy) * 0.72;
  const indicatorX = cx + Math.cos(angle) * radius;
  const indicatorY = cy + Math.sin(angle) * radius;

  const arrow = document.createElement("div");
  arrow.className = "damage-arrow";
  arrow.style.cssText = `
    left: ${indicatorX}px;
    top: ${indicatorY}px;
    transform: translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad);
    border-bottom-color: #ff3344;
    border-top: 0;
  `;
  damageDirections.appendChild(arrow);
  requestAnimationFrame(() => arrow.classList.add("visible"));
  setTimeout(() => arrow.remove(), 900);
}

function formatModeName(mode) {
  if (mode === "tdm") return "Team Deathmatch";
  if (mode === "koth") return "King Of The Hill";
  return "Free For All";
}

function formatMapName(mapId) {
  if (mapId === "city") return "City Block";
  if (mapId === "bunker") return "Bunker";
  return "Warehouse";
}

function showMatchFound(payload) {
  matchFoundTitle.textContent = "Match Found";
  matchFoundSubtitle.textContent = `${formatModeName(payload.mode)} · ${formatMapName(payload.mapId)} · Operators syncing`;
  matchFoundOverlay.hidden = false;
  clearTimeout(matchFoundTimer);
  matchFoundTimer = setTimeout(() => {
    matchFoundOverlay.hidden = true;
  }, 1250);
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
  if (Date.now() < (localRuntime.warmupUntil || 0)) {
    return;
  }

  const gun = getGun(localPlayer.gunId);
  if (localPlayer.ammoInMag <= 0 && !localPlayer.reloading) {
    const now = performance.now();
    if (now - localRuntime.lastEmptyClickAt > 400) {
      localRuntime.lastEmptyClickAt = now;
      sounds.play("empty_click", { x: localRuntime.x, y: localRuntime.y });
    }
    return;
  }
  if (localPlayer.ammoInMag <= 0 && localPlayer.reloading) {
    return;
  }
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
  const scoped = localPlayer?.gunId === 4 && (input.scoped || mouse.right) && localPlayer?.alive;
  const target = localPlayer?.alive ? localPlayer : spectatingTarget || { x: mapRenderer.data.width / 2, y: mapRenderer.data.height / 2 };
  updateCamera(target, scoped);
  sounds.setListener(target.x, target.y);

  const viewWidth = canvas.width / camera.zoom;
  const viewHeight = canvas.height / camera.zoom;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  mapRenderer.drawFloor(ctx, camera, viewWidth, viewHeight);
  mapRenderer.drawHill(ctx, camera, latestState.hill);
  if (mapRenderer.data.spawns) {
    const allSpawns = latestState.mode === "ffa"
      ? mapRenderer.data.spawns.all || []
      : [
          ...(mapRenderer.data.spawns.red || []).map((spawn) => ({ ...spawn, team: "red" })),
          ...(mapRenderer.data.spawns.blue || []).map((spawn) => ({ ...spawn, team: "blue" }))
        ];
    for (const spawn of allSpawns) {
      const sx = spawn.x - camera.x;
      const sy = spawn.y - camera.y;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = spawn.team === "red" ? "#ff3344" : spawn.team === "blue" ? "#00a2ff" : "#00ff88";
      ctx.beginPath();
      ctx.arc(sx, sy, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(sx, sy, 48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
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

  drawGrenadeTrajectory(localPlayer);
  particles.drawWorld(ctx, camera);
  ctx.restore();

  particles.drawScreen(ctx);

  if (scoped) {
    const grad = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.18,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.62
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.88)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
  }

  if (!localPlayer?.alive) {
    if (!spectatingTarget) {
      ctx.fillStyle = "rgba(10,10,15,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
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
    if (localPlayer.speedBoostUntil > Date.now()) {
      const now = performance.now();
      if (!localRuntime.lastBoostParticleAt || now - localRuntime.lastBoostParticleAt > 100) {
        localRuntime.lastBoostParticleAt = now;
        particles.emit("dust", { x: localRuntime.x, y: localRuntime.y, color: "#c084fc" });
      }
    }
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
    if (localPlayer.alive && localPlayer.hp <= 25 && localPlayer.hp > 0) {
      const now = performance.now();
      if (!localRuntime.lastHeartbeatAt || now - localRuntime.lastHeartbeatAt > 900) {
        localRuntime.lastHeartbeatAt = now;
        sounds.play("low_health", { x: localRuntime.x, y: localRuntime.y });
      }
    }
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

  if (deathState && !localPlayer?.alive) {
    const secs = Math.max(0, Math.ceil((deathState.unlockAt - Date.now()) / 1000));
    respawnCountdown.hidden = false;
    respawnSecs.textContent = secs;
  } else {
    respawnCountdown.hidden = true;
  }

  if (!localPlayer?.alive && spectatingTarget) {
    spectatorBanner.hidden = false;
    specTargetName.textContent = spectatingTarget.name;
    specTargetHp.textContent = `${Math.round(spectatingTarget.hp)} HP`;
    specTargetGun.textContent = getGun(spectatingTarget.gunId).name;
  } else {
    spectatorBanner.hidden = true;
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
  if (isTouchDevice) {
    mobileControls.hidden = false;
    const leftZone = document.getElementById("joystickLeft");
    const leftThumb = document.getElementById("joystickLeftThumb");
    const rightZone = document.getElementById("joystickRight");
    const rightThumb = document.getElementById("joystickRightThumb");
    const fireBtn = document.getElementById("fireBtn");
    let leftOrigin = null;
    let rightOrigin = null;
    const DEAD_ZONE = 12;
    const MAX_RADIUS = 60;

    leftZone.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      const rect = leftZone.getBoundingClientRect();
      leftOrigin = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
      leftThumb.style.left = `${touch.clientX - rect.left}px`;
      leftThumb.style.top = `${touch.clientY - rect.top}px`;
      event.preventDefault();
    }, { passive: false });

    leftZone.addEventListener("touchmove", (event) => {
      if (!leftOrigin) return;
      const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === leftOrigin.id);
      if (!touch) return;
      const dx = touch.clientX - leftOrigin.x;
      const dy = touch.clientY - leftOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(dist, MAX_RADIUS);
      const nx = dist > DEAD_ZONE ? dx / dist : 0;
      const ny = dist > DEAD_ZONE ? dy / dist : 0;
      input.left = nx < -0.3;
      input.right = nx > 0.3;
      input.up = ny < -0.3;
      input.down = ny > 0.3;
      const rect = leftZone.getBoundingClientRect();
      leftThumb.style.left = `${leftOrigin.x - rect.left + nx * clampedDist}px`;
      leftThumb.style.top = `${leftOrigin.y - rect.top + ny * clampedDist}px`;
      event.preventDefault();
    }, { passive: false });

    leftZone.addEventListener("touchend", (event) => {
      input.left = false;
      input.right = false;
      input.up = false;
      input.down = false;
      leftOrigin = null;
      leftThumb.style.left = "50%";
      leftThumb.style.top = "50%";
      event.preventDefault();
    }, { passive: false });

    rightZone.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      const rect = rightZone.getBoundingClientRect();
      rightOrigin = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
      rightThumb.style.left = `${touch.clientX - rect.left}px`;
      rightThumb.style.top = `${touch.clientY - rect.top}px`;
      mouse.x = touch.clientX;
      mouse.y = touch.clientY;
      event.preventDefault();
    }, { passive: false });

    rightZone.addEventListener("touchmove", (event) => {
      if (!rightOrigin) return;
      const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === rightOrigin.id);
      if (!touch) return;
      const dx = touch.clientX - rightOrigin.x;
      const dy = touch.clientY - rightOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(dist, MAX_RADIUS);
      const nx = dist > DEAD_ZONE ? dx / dist : 0;
      const ny = dist > DEAD_ZONE ? dy / dist : 0;
      const rect = rightZone.getBoundingClientRect();
      rightThumb.style.left = `${rightOrigin.x - rect.left + nx * clampedDist}px`;
      rightThumb.style.top = `${rightOrigin.y - rect.top + ny * clampedDist}px`;
      mouse.x = touch.clientX;
      mouse.y = touch.clientY;
      event.preventDefault();
    }, { passive: false });

    rightZone.addEventListener("touchend", (event) => {
      rightOrigin = null;
      rightThumb.style.left = "50%";
      rightThumb.style.top = "50%";
      event.preventDefault();
    }, { passive: false });

    fireBtn.addEventListener("touchstart", (event) => {
      mouse.down = true;
      event.preventDefault();
    }, { passive: false });
    fireBtn.addEventListener("touchend", (event) => {
      mouse.down = false;
      event.preventDefault();
    }, { passive: false });
  }
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
      {
        const localPlayer = getLocalPlayer();
        if (
          localPlayer?.alive
          && !localPlayer.reloading
          && localPlayer.ammoInMag < getGun(localPlayer.gunId).magazine
        ) {
          socket.emit("player:reload");
          sounds.play("reload_start", { x: localRuntime.x, y: localRuntime.y });
        }
        break;
      }
      case "1":
      case "2":
      case "3":
      case "4":
      case "5":
      case "6":
      case "7":
      case "8": {
        const gunId = Number(event.key);
        const localPlayer = getLocalPlayer();
        if (localPlayer?.alive && gunId !== localPlayer.gunId && ui.settingsModal.hidden === true) {
          profile.selectedGunId = gunId;
          saveProfile(profile);
          socket.emit("player:switchGun", { gunId });
        }
        break;
      }
      case "z":
        input.scoped = true;
        break;
      case "m":
        showToast(sounds.toggleMute() ? "Muted" : "Audio on");
        break;
      case "f":
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
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
    localRuntime.warmupUntil = Date.now() + 3000;
    if (roomInfo) roomInfo.settings = payload.settings;
    showMatchFound(payload);
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

  socket.on("player:hit", ({ victimId, damage, x, y, attackerId }) => {
    particles.addDamageNumber(x, y, damage);
    if (victimId === SELF_ID) {
      localRuntime.lastDamageAt = Date.now();
      if (attackerId) {
        const attackerSprite = playerSprites.get(attackerId);
        if (attackerSprite) {
          showDamageDirection(attackerSprite.drawX, attackerSprite.drawY);
        }
      }
    } else if (attackerId === SELF_ID && victimId !== localRuntime.justKilledId) {
      localRuntime.hitMarkerAt = performance.now();
    }
    if (localRuntime.justKilledId && victimId === localRuntime.justKilledId) {
      localRuntime.justKilledId = null;
    }
  });

  socket.on("player:killed", (payload) => {
    if (payload.killerId === SELF_ID) {
      localRuntime.justKilledId = payload.victimId;
      localRuntime.hitMarkerAt = performance.now();
      sounds.play("kill_confirm");
      const killedSprite = playerSprites.get(payload.victimId);
      if (killedSprite) {
        const screenX = (killedSprite.drawX - camera.x) * camera.zoom;
        const screenY = (killedSprite.drawY - camera.y) * camera.zoom - 60;
        particles.addKillConfirm(screenX, screenY);
      }
    }
    if (payload.victimId === SELF_ID) {
      localRuntime.spectatingToken = latestState.players.find((player) => player.id === payload.killerId)?.token || null;
      openDeathScreen(payload);
      sounds.play("death");
    }
  });

  socket.on("player:spawned", ({ playerId }) => {
    if (playerId === SELF_ID) {
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

  socket.on("match:countdown", ({ seconds }) => {
    if (seconds > 0) {
      countdownOverlay.hidden = false;
      countdownNumber.textContent = seconds;
      countdownNumber.style.color = "#ffb800";
      countdownNumber.style.animation = "none";
      countdownNumber.offsetHeight;
      countdownNumber.style.animation = "";
    } else {
      countdownOverlay.hidden = false;
      countdownNumber.textContent = "GO!";
      countdownNumber.style.color = "#00ff88";
      countdownNumber.style.animation = "none";
      countdownNumber.offsetHeight;
      countdownNumber.style.animation = "";
      setTimeout(() => {
        countdownOverlay.hidden = true;
        countdownNumber.style.color = "";
      }, 800);
    }
  });

  socket.on("net:pong", ({ latency }) => {
    localRuntime.lastPing = latency;
  });

  socket.on("game:end", (result) => {
    const selfRow = result.leaderboard?.find((row) => row.playerId === SELF_ID);
    if (selfRow) {
      addMatchToStats(selfRow.kills || 0, selfRow.deaths || 0, selfRow.damage || 0);
    }
    const modal = document.getElementById("leaderboardModal");
    modal.hidden = false;
    renderLeaderboard(modal, result, session.playerToken, getCurrentTeam());
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
  document.getElementById("copyInGameCode")?.addEventListener("click", async () => {
    const code = inGameRoomCode?.textContent;
    if (!code) return;
    await navigator.clipboard.writeText(code).catch(() => {});
    showToast("Room code copied");
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
