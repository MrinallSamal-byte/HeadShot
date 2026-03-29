import { renderGunCarousel } from "./guns.js";

export function showToast(message, type = "info") {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

export class GameUI {
  constructor(settings) {
    this.settings = settings;
    this.deathModal = document.getElementById("deathModal");
    this.deathBody = document.getElementById("deathBody");
    this.announcement = document.getElementById("announcement");
    this.connectionOverlay = document.getElementById("connectionOverlay");
    this.connectionText = document.getElementById("connectionText");
    this.chatInputWrap = document.getElementById("chatInputWrap");
    this.chatInput = document.getElementById("chatInput");
    this.settingsModal = document.getElementById("settingsModal");
    this.settingsVolume = document.getElementById("settingsVolume");
    this.settingsSensitivity = document.getElementById("settingsSensitivity");
    this.settingsFps = document.getElementById("settingsFps");
    this.settingsPing = document.getElementById("settingsPing");
    this.settingsCrosshair = document.getElementById("settingsCrosshair");
  }

  initSettings(onChange, onQuit) {
    this.settingsVolume.value = this.settings.volume ?? 0.6;
    this.settingsSensitivity.value = this.settings.sensitivity ?? 1;
    this.settingsFps.checked = this.settings.showFps ?? true;
    this.settingsPing.checked = this.settings.showPing ?? true;
    this.settingsCrosshair.value = this.settings.crosshair ?? "+";

    const apply = () => {
      this.settings.volume = Number(this.settingsVolume.value);
      this.settings.sensitivity = Number(this.settingsSensitivity.value);
      this.settings.showFps = this.settingsFps.checked;
      this.settings.showPing = this.settingsPing.checked;
      this.settings.crosshair = this.settingsCrosshair.value;
      onChange?.(this.settings);
    };

    [this.settingsVolume, this.settingsSensitivity, this.settingsFps, this.settingsPing, this.settingsCrosshair]
      .forEach((control) => control.addEventListener("input", apply));

    document.getElementById("resumeBtn").addEventListener("click", () => this.toggleSettings(false));
    document.getElementById("quitMatchBtn").addEventListener("click", () => onQuit?.());
  }

  toggleSettings(show) {
    this.settingsModal.hidden = !show;
  }

  showAnnouncement(text, type = "neutral") {
    this.announcement.textContent = text;
    this.announcement.dataset.type = type;
    this.announcement.classList.add("visible");
    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => this.announcement.classList.remove("visible"), 2000);
  }

  setConnectionState(text, visible) {
    this.connectionText.textContent = text;
    this.connectionOverlay.hidden = !visible;
  }

  showChatInput(show) {
    this.chatInputWrap.hidden = !show;
    if (show) {
      this.chatInput.focus();
      this.chatInput.select();
    } else {
      this.chatInput.blur();
    }
  }

  bindChatSubmit(handler) {
    this.chatInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const text = this.chatInput.value.trim();
      if (text) handler(text);
      this.chatInput.value = "";
      this.showChatInput(false);
    });
  }

  renderDeathScreen(data, selectedGunId, onSelect, onRespawn) {
    this.deathModal.hidden = false;
    this.deathBody.innerHTML = `
      <h2>You Were Killed</h2>
      <p>By: ${data.killerName} with ${data.gunName}</p>
      <div class="death-stats">
        <span>Kills: ${data.kills}</span>
        <span>Deaths: ${data.deaths}</span>
        <span>Damage: ${data.damage}</span>
        <span>K/D: ${data.deaths ? (data.kills / data.deaths).toFixed(2) : data.kills.toFixed(2)}</span>
      </div>
      <h3>Select Your Gun</h3>
      <div id="deathGunPicker" class="gun-grid"></div>
      <div class="death-footer">
        <div id="deathCountdown">Respawning in 0...</div>
        <button id="respawnBtn" class="primary" disabled>Respawn Now</button>
      </div>
    `;
    const picker = this.deathBody.querySelector("#deathGunPicker");
    renderGunCarousel(picker, selectedGunId, onSelect);
    this.deathBody.querySelector("#respawnBtn").addEventListener("click", () => onRespawn?.());
  }

  updateDeathCountdown(seconds, unlocked) {
    const countdown = this.deathBody.querySelector("#deathCountdown");
    const button = this.deathBody.querySelector("#respawnBtn");
    if (!countdown || !button) return;
    countdown.textContent = unlocked ? "Respawn ready" : `Respawning in ${seconds}...`;
    button.disabled = !unlocked;
  }

  hideDeathScreen() {
    this.deathModal.hidden = true;
  }
}
