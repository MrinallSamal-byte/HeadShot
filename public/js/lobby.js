import {
  createSocket,
  emitAck,
  loadProfile,
  loadLifetimeStats,
  saveProfile,
  loadSession,
  saveSession,
  clearSession,
  getJoinCodeFromUrl,
  setJoinCodeInUrl
} from "./socket-client.js";
import { showToast } from "./ui.js";

const COLORS = ["#00FF88", "#FF3344", "#FFB800", "#7DD3FC", "#C084FC", "#F97316"];

const socket = createSocket();
let profile = loadProfile();
let currentRoom = null;
let currentPlayer = null;
let lobbyPingTimer = null;

const refs = {
  landingView: document.getElementById("landingView"),
  lobbyView: document.getElementById("lobbyView"),
  motdBanner: document.getElementById("motdBanner"),
  playerNameInput: document.getElementById("playerNameInput"),
  joinCodeInput: document.getElementById("joinCodeInput"),
  quickPlayBtn: document.getElementById("quickPlayBtn"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  landingHowToBtn: document.getElementById("landingHowToBtn"),
  howToBtn: document.getElementById("howToBtn"),
  mobileHint: document.getElementById("mobileHint"),
  lifetimeStatsHost: document.getElementById("lifetimeStatsHost"),
  colorPicker: document.getElementById("colorPicker"),
  roomCodeLabel: document.getElementById("roomCodeLabel"),
  copyRoomBtn: document.getElementById("copyRoomBtn"),
  shareLinkBtn: document.getElementById("shareLinkBtn"),
  leaveLobbyBtn: document.getElementById("leaveLobbyBtn"),
  lobbyStatusText: document.getElementById("lobbyStatusText"),
  teamRedList: document.getElementById("teamRedList"),
  teamBlueList: document.getElementById("teamBlueList"),
  teamSoloList: document.getElementById("teamSoloList"),
  startGameBtn: document.getElementById("startGameBtn"),
  readyBtn: document.getElementById("readyBtn"),
  lobbyMotd: document.getElementById("lobbyMotd"),
  hostBadge: document.getElementById("hostBadge"),
  howToModal: document.getElementById("howToModal"),
  closeHowToBtn: document.getElementById("closeHowToBtn"),
  settingMode: document.getElementById("settingMode"),
  settingMap: document.getElementById("settingMap"),
  settingTime: document.getElementById("settingTime"),
  settingKillLimit: document.getElementById("settingKillLimit"),
  settingMaxPlayers: document.getElementById("settingMaxPlayers"),
  settingRespawn: document.getElementById("settingRespawn"),
  settingHp: document.getElementById("settingHp"),
  settingFriendlyFire: document.getElementById("settingFriendlyFire"),
  settingPickups: document.getElementById("settingPickups"),
  settingRegen: document.getElementById("settingRegen"),
  modeDescHost: document.getElementById("modeDescHost"),
  queueOverlay: document.getElementById("queueOverlay"),
  queueTitle: document.getElementById("queueTitle"),
  queueSubtitle: document.getElementById("queueSubtitle")
};

const modeDescriptions = {
  ffa: "Free For All - every player for themselves. Highest kills wins.",
  tdm: "Team Deathmatch - Red vs Blue. Most team kills wins.",
  koth: "King of the Hill - capture and hold the zone. 100 points to win."
};

function selectedSettingsFromDom() {
  return {
    mode: refs.settingMode.value,
    mapId: refs.settingMap.value,
    timeLimit: refs.settingTime.value ? Number(refs.settingTime.value) : null,
    killLimit: refs.settingKillLimit.value ? Number(refs.settingKillLimit.value) : null,
    maxPlayers: Number(refs.settingMaxPlayers.value),
    respawnTime: Number(refs.settingRespawn.value),
    startHp: Number(refs.settingHp.value),
    friendlyFire: refs.settingFriendlyFire.value === "true",
    allowPickups: refs.settingPickups.value === "true",
    regenEnabled: refs.settingRegen.value === "true"
  };
}

function syncSettingsToDom(settings) {
  refs.settingMode.value = settings.mode;
  refs.settingMap.value = settings.mapId;
  refs.settingTime.value = settings.timeLimit ? String(settings.timeLimit) : "";
  refs.settingKillLimit.value = settings.killLimit ? String(settings.killLimit) : "";
  refs.settingMaxPlayers.value = String(settings.maxPlayers);
  refs.settingRespawn.value = String(settings.respawnTime);
  refs.settingHp.value = String(settings.startHp);
  refs.settingFriendlyFire.value = String(settings.friendlyFire);
  refs.settingPickups.value = String(settings.allowPickups);
  refs.settingRegen.value = String(settings.regenEnabled);
  renderModeDescription();
}

function renderModeDescription() {
  let desc = document.getElementById("modeDesc");
  if (!desc || desc.parentElement !== refs.modeDescHost) {
    if (desc) desc.remove();
    desc = document.createElement("p");
    desc.id = "modeDesc";
    desc.style.cssText = "color:#94a3b8;font-size:0.8rem;margin:0;line-height:1.5;";
    refs.modeDescHost.appendChild(desc);
  }
  desc.textContent = modeDescriptions[refs.settingMode.value] || "";
}

function renderLifetimeStats() {
  const stats = loadLifetimeStats();
  let element = document.getElementById("lifetimeStats");
  if (!stats.matches) {
    element?.remove();
    if (refs.lifetimeStatsHost) {
      refs.lifetimeStatsHost.textContent = "No matches logged yet. Deploy to build your record.";
    }
    return;
  }
  if (!element) {
    element = document.createElement("div");
    element.id = "lifetimeStats";
    element.style.cssText = "color:#cbd5e1;font-size:0.78rem;line-height:1.6;";
    refs.lifetimeStatsHost.innerHTML = "";
    refs.lifetimeStatsHost.appendChild(element);
  }
  const kd = stats.deaths ? (stats.kills / stats.deaths).toFixed(2) : stats.kills || 0;
  element.textContent = `Career: ${stats.matches} matches · ${stats.kills || 0} kills · ${stats.deaths || 0} deaths · K/D ${kd} · ${(stats.damage || 0).toLocaleString()} damage`;
}

function showQueueOverlay(title, subtitle) {
  refs.queueTitle.textContent = title;
  refs.queueSubtitle.textContent = subtitle;
  refs.queueOverlay.hidden = false;
}

function hideQueueOverlay() {
  refs.queueOverlay.hidden = true;
}

function refreshQueueOverlay(room) {
  if (!room?.publicRoom || room.status === "playing") {
    hideQueueOverlay();
    return;
  }
  const players = room.players.filter((player) => !player.spectator).length;
  showQueueOverlay(
    "Matchmaking",
    players >= 2
      ? `Match found. Syncing ${players} operators and deploying to ${room.settings.mapId.toUpperCase()}...`
      : `Searching for operators... ${players}/${room.settings.maxPlayers} ready in queue.`
  );
}

function renderColors() {
  refs.colorPicker.innerHTML = "";
  for (const color of COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `color-swatch ${profile.color === color ? "active" : ""}`;
    button.style.background = color;
    button.addEventListener("click", () => {
      profile.color = color;
      saveProfile(profile);
      renderColors();
    });
    refs.colorPicker.appendChild(button);
  }
}

function persistProfileFromInput() {
  profile.playerName = refs.playerNameInput.value.trim() || profile.playerName;
  saveProfile(profile);
}

function roomSessionPayload() {
  persistProfileFromInput();
  return {
    playerName: profile.playerName,
    color: profile.color,
    playerToken: profile.playerToken,
    selectedGunId: profile.selectedGunId
  };
}

function saveRoomSession(room, player) {
  saveSession({
    roomCode: room.code,
    playerToken: player.token,
    playerId: player.id,
    playerName: player.name,
    color: player.color
  });
}

function showLobby(room, player) {
  currentRoom = room;
  currentPlayer = player;
  refs.landingView.hidden = true;
  refs.lobbyView.hidden = false;
  refs.roomCodeLabel.textContent = room.code;
  refs.lobbyMotd.textContent = room.motd;
  syncSettingsToDom(room.settings);
  renderLobbyPlayers(room);
  updateLobbyControls(room);
  refreshQueueOverlay(room);
  setJoinCodeInUrl(room.publicRoom ? "" : room.code);
}

function resetToLanding() {
  currentRoom = null;
  currentPlayer = null;
  refs.landingView.hidden = false;
  refs.lobbyView.hidden = true;
  hideQueueOverlay();
  clearSession();
  setJoinCodeInUrl("");
}

function renderPlayerRow(player) {
  const isHost = currentRoom?.hostId === currentPlayer?.token;
  const row = document.createElement("div");
  row.className = "player-row";
  const readyBadge = player.ready
    ? `<span style="color:#00ff88;font-size:0.75rem;">● READY</span>`
    : `<span style="color:#475569;font-size:0.75rem;">○ WAITING</span>`;
  row.innerHTML = `
    <span class="status-pill" style="background:${player.color}22;color:${player.color}">${player.name}</span>
    ${readyBadge}
    ${player.isHost ? '<span style="color:#ffb800;font-size:0.75rem;">HOST</span>' : ""}
    <span style="color:#64748b">${player.connected ? "" : "RECONNECTING "}${player.ping || 0}ms</span>
  `;

  if (isHost && !player.isHost && currentRoom.settings.mode !== "ffa" && !player.spectator) {
    const teamBtn = document.createElement("button");
    teamBtn.type = "button";
    teamBtn.textContent = player.team === "red" ? "→ BLUE" : "→ RED";
    teamBtn.addEventListener("click", () => socket.emit("room:team", {
      token: player.token,
      team: player.team === "red" ? "blue" : "red"
    }));
    row.appendChild(teamBtn);
  }

  if (isHost && !player.isHost) {
    const kickBtn = document.createElement("button");
    kickBtn.type = "button";
    kickBtn.textContent = "Kick";
    kickBtn.addEventListener("click", () => socket.emit("room:kick", { token: player.token }));
    row.appendChild(kickBtn);
  }

  return row;
}

function renderLobbyPlayers(room) {
  refs.teamRedList.innerHTML = "";
  refs.teamBlueList.innerHTML = "";
  refs.teamSoloList.innerHTML = "";

  for (const player of room.players) {
    const row = renderPlayerRow(player);
    if (player.spectator || room.settings.mode === "ffa" || player.team === "solo") {
      refs.teamSoloList.appendChild(row);
    } else if (player.team === "red") {
      refs.teamRedList.appendChild(row);
    } else {
      refs.teamBlueList.appendChild(row);
    }
  }
}

function updateLobbyControls(room) {
  const isHost = room.hostId === currentPlayer?.token;
  refs.hostBadge.textContent = isHost ? "You are the host" : "Host controls locked";
  refs.lobbyStatusText.textContent = room.publicRoom
    ? `${room.players.length}/${room.settings.maxPlayers} queued`
    : `${room.players.length}/${room.settings.maxPlayers} in room`;
  refs.startGameBtn.disabled = !isHost || !room.canStart;
  refs.startGameBtn.title = !isHost
    ? "Only the host can start"
    : !room.canStart
      ? "Waiting for all players to ready up"
      : "Start the match";
  refs.readyBtn.disabled = isHost || room.publicRoom;

  for (const element of [
    refs.settingMode,
    refs.settingMap,
    refs.settingTime,
    refs.settingKillLimit,
    refs.settingMaxPlayers,
    refs.settingRespawn,
    refs.settingHp,
    refs.settingFriendlyFire,
    refs.settingPickups,
    refs.settingRegen
  ]) {
    element.disabled = !isHost;
  }
}

function navigateToGame(room, player) {
  saveRoomSession(room, player);
  window.location.href = "/game.html";
}

async function createRoom() {
  showQueueOverlay("Deploying Private Room", "Provisioning a private lobby and synchronizing room rules...");
  try {
    const response = await emitAck(socket, "room:create", {
      ...roomSessionPayload(),
      settings: selectedSettingsFromDom()
    });
    currentPlayer = response.player;
    profile.playerToken = response.player.token;
    profile.playerName = response.player.name;
    saveProfile(profile);
    saveRoomSession(response.room, response.player);
    showLobby(response.room, response.player);
  } catch (error) {
    hideQueueOverlay();
    throw error;
  }
}

async function quickPlay() {
  showQueueOverlay("Matchmaking", "Searching for an active public combat room...");
  try {
    const response = await emitAck(socket, "room:quickplay", roomSessionPayload());
    currentPlayer = response.player;
    profile.playerToken = response.player.token;
    profile.playerName = response.player.name;
    saveProfile(profile);
    saveRoomSession(response.room, response.player);
    showLobby(response.room, response.player);
  } catch (error) {
    hideQueueOverlay();
    throw error;
  }
}

async function joinRoom() {
  const code = refs.joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast("Enter a room code first", "error");
    return;
  }
  showQueueOverlay("Joining Room", `Authenticating team code ${code} and downloading the current room state...`);
  try {
    const response = await emitAck(socket, "room:join", {
      ...roomSessionPayload(),
      code
    });
    currentPlayer = response.player;
    profile.playerToken = response.player.token;
    profile.playerName = response.player.name;
    saveProfile(profile);
    saveRoomSession(response.room, response.player);
    if (response.room.status === "playing") {
      navigateToGame(response.room, response.player);
      return;
    }
    showLobby(response.room, response.player);
  } catch (error) {
    hideQueueOverlay();
    throw error;
  }
}

function bindEvents() {
  refs.playerNameInput.value = profile.playerName;
  refs.joinCodeInput.value = getJoinCodeFromUrl();
  refs.quickPlayBtn.addEventListener("click", () => quickPlay().catch((error) => showToast(error.message, "error")));
  refs.createRoomBtn.addEventListener("click", () => createRoom().catch((error) => showToast(error.message, "error")));
  refs.joinRoomBtn.addEventListener("click", () => joinRoom().catch((error) => showToast(error.message, "error")));
  refs.landingHowToBtn?.addEventListener("click", () => {
    refs.howToModal.hidden = false;
  });
  refs.copyRoomBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentRoom.code);
      showToast("Room code copied");
    } catch (_error) {
      showToast("Clipboard copy failed", "error");
    }
  });
  refs.shareLinkBtn.addEventListener("click", async () => {
    const url = `${window.location.origin}/?join=${currentRoom.code}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Room link copied to clipboard");
    } catch (_error) {
      showToast(`Copy failed - link: ${url}`, "error");
    }
  });
  refs.leaveLobbyBtn.addEventListener("click", () => {
    socket.emit("room:leave");
    resetToLanding();
  });
  refs.readyBtn.addEventListener("click", () => socket.emit("room:ready", {
    ready: !currentRoom.players.find((player) => player.token === currentPlayer.token)?.ready
  }));
  refs.startGameBtn.addEventListener("click", () => {
    showQueueOverlay("Deploying Match", "Loading the map, syncing loadouts, and briefing the room...");
    socket.emit("room:start", {}, (response) => {
      if (response?.ok === false) {
        hideQueueOverlay();
        showToast(response.message || "Unable to start match", "error");
      }
    });
  });
  refs.howToBtn.addEventListener("click", () => {
    refs.howToModal.hidden = false;
  });
  refs.closeHowToBtn.addEventListener("click", () => {
    refs.howToModal.hidden = true;
  });

  refs.settingMode.addEventListener("change", () => {
    renderModeDescription();
    socket.emit("room:settings", selectedSettingsFromDom());
  });
  for (const element of [
    refs.settingMap,
    refs.settingTime,
    refs.settingKillLimit,
    refs.settingMaxPlayers,
    refs.settingRespawn,
    refs.settingHp,
    refs.settingFriendlyFire,
    refs.settingPickups,
    refs.settingRegen
  ]) {
    element.addEventListener("change", () => socket.emit("room:settings", selectedSettingsFromDom()));
  }

  refs.playerNameInput.addEventListener("change", persistProfileFromInput);

  document.querySelectorAll("[data-coming-soon]").forEach((button) => {
    button.addEventListener("click", () => {
      showToast(`${button.dataset.comingSoon || "Feature"} is not wired into this build yet`);
    });
  });
}

function bindSocket() {
  socket.on("server:config", (payload) => {
    refs.motdBanner.textContent = payload.motd;
    refs.lobbyMotd.textContent = payload.motd;
  });

  socket.on("room:update", (room) => {
    if (!currentPlayer && room.players?.length) {
      const session = loadSession();
      if (session) {
        currentPlayer = room.players.find((player) => player.token === session.playerToken) || currentPlayer;
      }
    }
    currentRoom = room;
    if (room.status === "playing" && currentPlayer) {
      navigateToGame(room, currentPlayer);
      return;
    }
    if (currentPlayer) {
      showLobby(room, currentPlayer);
    }
  });

  socket.on("net:pong", ({ latency }) => {
    const dot = document.getElementById("lobbyPingDot");
    const ms = document.getElementById("lobbyPingMs");
    if (!dot || !ms) return;
    ms.textContent = `${Math.round(latency)} ms`;
    dot.className = `ping-dot${latency > 120 ? " high" : latency > 60 ? " medium" : ""}`;
  });

  socket.on("room:error", (payload) => {
    hideQueueOverlay();
    showToast(payload.message || "Server error", "error");
  });

  socket.on("room:kicked", () => {
    hideQueueOverlay();
    showToast("You were removed from the room", "error");
    resetToLanding();
  });

  socket.on("game:start", () => {
    if (currentRoom && currentPlayer) {
      navigateToGame(currentRoom, currentPlayer);
    }
  });
}

async function resumeIfPossible() {
  const session = loadSession();
  if (!session) return;
  try {
    const response = await new Promise((resolve, reject) => {
      socket.emit("session:resume", {
        roomCode: session.roomCode,
        playerToken: session.playerToken,
        page: "lobby"
      }, (result) => {
        if (!result?.ok) {
          reject(new Error(result?.message || "Unable to resume"));
          return;
        }
        resolve(result);
      });
    });
    currentPlayer = response.player;
    saveProfile({
      ...profile,
      playerToken: response.player.token,
      playerName: response.player.name,
      color: response.player.color
    });
    if (response.room.status === "playing") {
      navigateToGame(response.room, response.player);
      return;
    }
    showLobby(response.room, response.player);
  } catch (_error) {
    clearSession();
  }
}

function init() {
  if ("ontouchstart" in window) {
    refs.mobileHint.hidden = false;
  }
  bindEvents();
  bindSocket();
  renderColors();
  renderModeDescription();
  renderLifetimeStats();
  resumeIfPossible();

  if (!lobbyPingTimer) {
    lobbyPingTimer = setInterval(() => {
      socket.emit("net:ping", { sentAt: Date.now() }, () => {});
    }, 2000);
  }

  const joinCode = getJoinCodeFromUrl();
  if (joinCode) {
    refs.joinCodeInput.value = joinCode;
  }
}

init();
