function formatTime(ms) {
  if (ms === null || ms === undefined) return "∞";
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export class HUD {
  constructor() {
    this.healthText = document.getElementById("healthText");
    this.healthFill = document.getElementById("healthFill");
    this.armorWrap = document.getElementById("armorWrap");
    this.armorText = document.getElementById("armorText");
    this.armorFill = document.getElementById("armorFill");
    this.regenLabel = document.getElementById("regenLabel");
    this.gunName = document.getElementById("gunName");
    this.ammoFill = document.getElementById("ammoFill");
    this.ammoText = document.getElementById("ammoText");
    this.reloadWrap = document.getElementById("reloadWrap");
    this.reloadFill = document.getElementById("reloadFill");
    this.killFeed = document.getElementById("killFeed");
    this.timer = document.getElementById("matchTimer");
    this.scoreBrief = document.getElementById("scoreBrief");
    this.fpsPing = document.getElementById("fpsPing");
    this.minimap = document.getElementById("minimap");
    this.chatLog = document.getElementById("chatLog");
    this.scoreboard = document.getElementById("scoreboard");
    this.scoreboardBody = document.getElementById("scoreboardBody");
    this.messages = [];
    this.prevTeamScores = { red: 0, blue: 0 };
    this.redFlashTimer = null;
    this.blueFlashTimer = null;
    this._prevHp = -1;
    this._prevArmor = -1;
    this._prevAmmo = -1;
    this._prevReserveAmmo = null;
    this._prevGunId = null;
    this._prevRemaining = null;
  }

  updatePlayer(localPlayer, gun, remaining, teamScores, roomMode) {
    if (!localPlayer) return;
    const hp = Math.round(localPlayer.hp);
    if (hp !== this._prevHp) {
      this.healthFill.style.width = `${(localPlayer.hp / localPlayer.maxHp) * 100}%`;
      this.healthText.textContent = `${hp} HP`;
      this._prevHp = hp;
    }
    this.regenLabel.textContent = localPlayer.hp < Math.min(70, localPlayer.maxHp) && localPlayer.lastDamageAt ? "REGEN READY" : "";

    if (localPlayer.armor > 0) {
      this.armorWrap.hidden = false;
      const armor = Math.round(localPlayer.armor);
      if (armor !== this._prevArmor) {
        this.armorFill.style.width = `${(localPlayer.armor / localPlayer.maxArmor) * 100}%`;
        this.armorText.textContent = `${armor} ARM`;
        this._prevArmor = armor;
      }
    } else {
      this.armorWrap.hidden = true;
      this._prevArmor = 0;
    }

    if (this._prevGunId !== gun.id) {
      this.gunName.textContent = gun.name;
      this._prevGunId = gun.id;
    }
    const ammo = localPlayer.ammoInMag;
    if (ammo !== this._prevAmmo || localPlayer.reserveAmmo !== this._prevReserveAmmo) {
      this.ammoText.textContent = localPlayer.reserveAmmo < 0
        ? `${ammo}/∞`
        : `${ammo}/${localPlayer.reserveAmmo}`;
      this.ammoFill.style.width = `${(ammo / gun.magazine) * 100}%`;
      this._prevAmmo = ammo;
      this._prevReserveAmmo = localPlayer.reserveAmmo;
    }
    const lowAmmo = localPlayer.ammoInMag / gun.magazine < 0.2 && localPlayer.ammoInMag > 0;
    this.ammoFill.classList.toggle("low", lowAmmo);
    if (localPlayer.reloading && localPlayer.reloadEndAt) {
      this.reloadWrap.hidden = false;
      const totalMs = gun.reloadTime * 1000;
      const elapsed = Date.now() - (localPlayer.reloadEndAt - totalMs);
      this.reloadFill.style.width = `${Math.min(100, Math.max(0, (elapsed / totalMs) * 100))}%`;
    } else {
      this.reloadWrap.hidden = true;
    }

    if (roomMode === "tdm" || roomMode === "koth") {
      this.scoreBrief.textContent = `RED ${teamScores.red} : ${teamScores.blue} BLUE`;
      if (teamScores.red > this.prevTeamScores.red) {
        this.scoreBrief.classList.add("score-flash-red");
        clearTimeout(this.redFlashTimer);
        this.redFlashTimer = setTimeout(() => this.scoreBrief.classList.remove("score-flash-red"), 600);
      }
      if (teamScores.blue > this.prevTeamScores.blue) {
        this.scoreBrief.classList.add("score-flash-blue");
        clearTimeout(this.blueFlashTimer);
        this.blueFlashTimer = setTimeout(() => this.scoreBrief.classList.remove("score-flash-blue"), 600);
      }
      this.prevTeamScores = { ...teamScores };
    } else {
      this.scoreBrief.textContent = `You: ${localPlayer.kills}K / ${localPlayer.deaths}D`;
    }

    if (remaining !== this._prevRemaining) {
      this.timer.textContent = `⏱ ${formatTime(remaining)}`;
      this._prevRemaining = remaining;
    }
    this.timer.className = remaining !== null && remaining <= 30000
      ? "timer-pill critical"
      : remaining !== null && remaining <= 60000
        ? "timer-pill warning"
        : "timer-pill";
  }

  updateKillFeed(feed = []) {
    this.killFeed.innerHTML = feed
      .map((entry, index) => `<div class="kf-entry" style="animation-delay:${index * 0.05}s">${entry.killerName} ☠ ${entry.victimName} <small>(${entry.gunName})</small></div>`)
      .join("");
  }

  updatePerf(fps, ping) {
    this.fpsPing.textContent = `${fps.toFixed(0)} FPS | ${Math.round(ping)} ms`;
    this.fpsPing.style.color = ping > 120 ? "#ff3344" : ping > 60 ? "#ffb800" : "#00ff88";
  }

  addChatMessage(message) {
    this.messages.unshift({ ...message, createdAt: Date.now() });
    this.messages = this.messages.slice(0, 8);
    this.renderChat();
  }

  renderChat() {
    this.messages = this.messages.filter((message) => Date.now() - message.createdAt < 6000);
    this.chatLog.innerHTML = this.messages
      .map((message) => {
        const prefix = message.team ? "[T]" : "[A]";
        const nameColor = message.color ? `style="color:${message.color}"` : "";
        return `<div><span style="color:#475569">${prefix}</span> <span ${nameColor}>${message.sender}</span>: ${message.text}</div>`;
      })
      .join("");
  }

  renderMinimap(map, snapshot, selfToken, localTeam) {
    const ctx = this.minimap.getContext("2d");
    const width = this.minimap.width;
    const height = this.minimap.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(10,10,15,0.94)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#ffb800";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    const scaleX = width / map.data.width;
    const scaleY = height / map.data.height;

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    for (const wall of map.data.walls) {
      ctx.strokeRect(wall.x * scaleX, wall.y * scaleY, wall.w * scaleX, wall.h * scaleY);
    }

    for (const pickup of snapshot.pickups || []) {
      if (!pickup.active) continue;
      ctx.fillStyle = pickup.type === "health" ? "#22c55e" : pickup.type === "armor" ? "#38bdf8" : pickup.type === "ammo" ? "#f59e0b" : "#a855f7";
      ctx.fillRect(pickup.x * scaleX - 2, pickup.y * scaleY - 2, 4, 4);
    }

    for (const player of snapshot.players || []) {
      if (!player.alive || player.spectator) continue;
      const ally = player.token === selfToken || (localTeam !== "solo" && player.team === localTeam);
      ctx.fillStyle = player.token === selfToken ? "#ffffff" : ally ? "#00FF88" : "#FF3344";
      ctx.beginPath();
      ctx.arc(player.x * scaleX, player.y * scaleY, player.token === selfToken ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  showScoreboard(rows, selfToken, roomMode) {
    this.scoreboard.hidden = false;
    this.scoreboardBody.innerHTML = rows
      .map((row) => `
        <tr class="${row.playerId === selfToken.slice(-8) ? "self" : ""} ${roomMode !== "ffa" ? row.team : ""}">
          <td>${row.rank}</td>
          <td>${row.name}</td>
          <td>${row.kills}</td>
          <td>${row.deaths}</td>
          <td>${row.damage}</td>
          <td>${row.kd}</td>
          <td>${row.ping}ms</td>
        </tr>
      `)
      .join("");
  }

  hideScoreboard() {
    this.scoreboard.hidden = true;
  }
}
