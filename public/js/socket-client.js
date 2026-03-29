export const STORAGE_KEYS = {
  profile: "headshot.profile",
  session: "headshot.session",
  settings: "headshot.settings",
  stats: "headshot.stats"
};

export function randomName() {
  return `Player_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function loadProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) || "{}");
    return {
      playerToken: parsed.playerToken || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
      playerName: parsed.playerName || randomName(),
      color: parsed.color || "#00FF88",
      selectedGunId: parsed.selectedGunId || 2
    };
  } catch (_error) {
    return {
      playerToken: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
      playerName: randomName(),
      color: "#00FF88",
      selectedGunId: 2
    };
  }
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEYS.session) || "null");
  } catch (_error) {
    return null;
  }
}

export function saveSession(session) {
  sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.session);
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
  } catch (_error) {
    return {};
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

export function loadLifetimeStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.stats) || "{}");
  } catch (_error) {
    return {};
  }
}

export function saveLifetimeStats(stats) {
  localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
}

export function addMatchToStats(kills, deaths, damage) {
  const current = loadLifetimeStats();
  const next = {
    matches: (current.matches || 0) + 1,
    kills: (current.kills || 0) + (kills || 0),
    deaths: (current.deaths || 0) + (deaths || 0),
    damage: (current.damage || 0) + (damage || 0)
  };
  saveLifetimeStats(next);
  return next;
}

export function createSocket() {
  return window.io({
    autoConnect: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 8000
  });
}

export function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (!response?.ok) {
        reject(new Error(response?.message || "Request failed"));
        return;
      }
      resolve(response);
    });
  });
}

export function getJoinCodeFromUrl() {
  const url = new URL(window.location.href);
  return (url.searchParams.get("join") || "").trim().toUpperCase();
}

export function setJoinCodeInUrl(code) {
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set("join", code);
  } else {
    url.searchParams.delete("join");
  }
  history.replaceState({}, "", url);
}
