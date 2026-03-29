export class PlayerSprite {
  constructor(snapshot) {
    this.id = snapshot.id;
    this.applySnapshot(snapshot, true);
  }

  applySnapshot(snapshot, instant = false) {
    this.snapshot = { ...snapshot };
    if (instant || this.drawX === undefined) {
      this.drawX = snapshot.x;
      this.drawY = snapshot.y;
      this.drawAngle = snapshot.angle;
    }
    this.targetX = snapshot.x;
    this.targetY = snapshot.y;
    this.targetAngle = snapshot.angle;
  }

  tick(alpha = 0.18) {
    this.drawX += (this.targetX - this.drawX) * alpha;
    this.drawY += (this.targetY - this.drawY) * alpha;
    this.drawAngle += (this.targetAngle - this.drawAngle) * alpha;
  }

  draw(ctx, camera, selfToken, teamMode, localTeam) {
    const { snapshot } = this;
    if (snapshot.spectator) return;
    const x = this.drawX - camera.x;
    const y = this.drawY - camera.y;

    const ally = snapshot.token === selfToken || (teamMode && snapshot.team === localTeam);
    const ring = snapshot.token === selfToken ? "#ffffff" : ally ? "#00FF88" : "#FF3344";
    const fill = snapshot.token === selfToken ? "#1d4ed8" : snapshot.color || "#475569";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.drawAngle || 0);
    ctx.fillStyle = "rgba(10,10,15,0.95)";
    ctx.fillRect(-4, -6, 34, 12);
    ctx.fillStyle = ally ? "#94f8c5" : "#ff8d97";
    ctx.fillRect(8, -4, 26, 8);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ring;
    ctx.stroke();

    if (snapshot.armor > 0) {
      const armorFraction = snapshot.armor / snapshot.maxArmor;
      ctx.save();
      ctx.globalAlpha = 0.18 + armorFraction * 0.25;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(x, y, 24 + armorFraction * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (snapshot.speedBoostUntil && snapshot.speedBoostUntil > Date.now()) {
      ctx.save();
      const pulseAlpha = 0.3 + 0.3 * Math.sin(Date.now() / 120);
      ctx.globalAlpha = pulseAlpha;
      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(snapshot.name, x, y - 34);

    if (snapshot.killStreak >= 3) {
      const streakColor = snapshot.killStreak >= 7 ? "#facc15" : snapshot.killStreak >= 5 ? "#fb923c" : "#f87171";
      const streakText = snapshot.killStreak >= 7 ? `🔥${snapshot.killStreak}` : `★${snapshot.killStreak}`;
      ctx.save();
      ctx.fillStyle = streakColor;
      ctx.font = "10px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(streakText, x, y - 46);
      ctx.restore();
    }

    if (snapshot.speedBoostUntil && snapshot.speedBoostUntil > Date.now()) {
      ctx.save();
      ctx.fillStyle = "#c084fc";
      ctx.font = "14px 'Share Tech Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("⚡", x + 28, y - 34);
      ctx.restore();
    }

    const hpWidth = 44;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x - hpWidth / 2, y - 28, hpWidth, 5);
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(x - hpWidth / 2, y - 28, hpWidth * (snapshot.hp / snapshot.maxHp), 5);
    if (snapshot.armor > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - hpWidth / 2, y - 20, hpWidth, 4);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(x - hpWidth / 2, y - 20, hpWidth * (snapshot.armor / snapshot.maxArmor), 4);
    }
  }
}
