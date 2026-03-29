import {
  createSocket,
  emitAck,
  loadProfile,
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

const refs = {
  landingView: document.getElementById("landingView"),
  lobbyView: document.getElementById("lobbyView"),
  motdBanner: document.getElementById("motdBanner"),
  playerNameInput: document.getElementById("playerNameInput"),
  joinCodeInput: document.getElementById("joinCodeInput"),
  quickPlayBtn: document.getElementById("quickPlayBtn"),
  createRoomBtn: document.getElementById("createRoomBtn"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  howToBtn: document.getElementById("howToBtn"),
  mobileHint: document.getElementById("mobileHint"),
  colorPicker: document.getElementById("colorPicker"),
  roomCodeLabel: document.getElementById("roomCodeLabel"),
  copyRoomBtn: document.getElementById("copyRoomBtn"),
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
  settingRegen: document.getElementById("settingRegen")
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
  setJoinCodeInUrl(room.publicRoom ? "" : room.code);
}

function resetToLanding() {
  currentRoom = null;
  currentPlayer = null;
  refs.landingView.hidden = false;
  refs.lobbyView.hidden = true;
  clearSession();
  setJoinCodeInUrl("");
}

function renderPlayerRow(player) {
  const isHost = currentRoom?.hostId === currentPlayer?.token;
  const row = document.createElement("div");
  row.className = "player-row";
  row.innerHTML = `
    <span class="status-pill" style="background:${player.color}22;color:${player.color}">${player.name}</span>
    <span>${player.connected ? "ONLINE" : "RECONNECTING"} ${player.ready ? "READY" : ""} ${player.isHost ? "HOST" : ""}</span>
    <span>${player.ping || 0}ms</span>
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
  refs.lobbyStatusText.textContent = `${room.players.length}/${room.settings.maxPlayers} players`;
  refs.startGameBtn.disabled = !isHost || !room.canStart;
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
}

async function quickPlay() {
  const response = await emitAck(socket, "room:quickplay", roomSessionPayload());
  currentPlayer = response.player;
  profile.playerToken = response.player.token;
  profile.playerName = response.player.name;
  saveProfile(profile);
  saveRoomSession(response.room, response.player);
  showLobby(response.room, response.player);
}

async function joinRoom() {
  const code = refs.joinCodeInput.value.trim().toUpperCase();
  if (!code) {
    showToast("Enter a room code first", "error");
    return;
  }
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
}

function bindEvents() {
  refs.playerNameInput.value = profile.playerName;
  refs.joinCodeInput.value = getJoinCodeFromUrl();
  refs.quickPlayBtn.addEventListener("click", () => quickPlay().catch((error) => showToast(error.message, "error")));
  refs.createRoomBtn.addEventListener("click", () => createRoom().catch((error) => showToast(error.message, "error")));
  refs.joinRoomBtn.addEventListener("click", () => joinRoom().catch((error) => showToast(error.message, "error")));
  refs.copyRoomBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentRoom.code);
      showToast("Room code copied");
    } catch (_error) {
      showToast("Clipboard copy failed", "error");
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
    socket.emit("room:start", {}, (response) => {
      if (response?.ok === false) {
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
    element.addEventListener("change", () => socket.emit("room:settings", selectedSettingsFromDom()));
  }

  refs.playerNameInput.addEventListener("change", persistProfileFromInput);
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

  socket.on("room:error", (payload) => {
    showToast(payload.message || "Server error", "error");
  });

  socket.on("room:kicked", () => {
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
  resumeIfPossible();

  const joinCode = getJoinCodeFromUrl();
  if (joinCode) {
    refs.joinCodeInput.value = joinCode;
  }
}

init();
