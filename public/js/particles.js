export class ParticlePool {
  constructor(max = 500) {
    this.max = max;
    this.items = [];
  }

  emit(type, options = {}) {
    const countByType = {
      muzzle: 8,
      wall: 6,
      blood: 8,
      explosion: 20,
      death: 12,
      heal: 1,
      pickup: 8,
      dust: 4
    };
    const count = countByType[type] || 1;
    for (let index = 0; index < count; index += 1) {
      if (this.items.length >= this.max) {
        this.items.shift();
      }
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.6;
      const speed = type === "explosion" ? 120 + Math.random() * 160 : 40 + Math.random() * 100;
      const colorMap = {
        muzzle: "#fff7b0",
        wall: "#ffb800",
        blood: "#ff3344",
        explosion: index % 2 === 0 ? "#ffedd5" : "#fb923c",
        death: "#ff3344",
        heal: "#00ff88",
        pickup: options.color || "#ffffff",
        dust: "#94a3b8"
      };
      this.items.push({
        type,
        x: options.x,
        y: options.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: type === "explosion" ? 4 + Math.random() * 3 : 2 + Math.random() * 2,
        life: type === "heal" ? 1 : type === "muzzle" ? 0.08 : type === "explosion" ? 0.45 : 0.3 + Math.random() * 0.2,
        maxLife: type === "heal" ? 1 : type === "muzzle" ? 0.08 : type === "explosion" ? 0.45 : 0.3 + Math.random() * 0.2,
        color: colorMap[type]
      });
    }
  }

  addDamageNumber(x, y, value) {
    this.items.push({
      type: "number",
      x,
      y,
      vx: 0,
      vy: -28,
      radius: 0,
      value,
      life: 0.7,
      maxLife: 0.7,
      color: "#ff5d73"
    });
  }

  addKillConfirm(screenX, screenY) {
    this.items.push({
      type: "killConfirm",
      x: screenX,
      y: screenY,
      vx: 0,
      vy: -50,
      radius: 0,
      life: 1.2,
      maxLife: 1.2,
      color: "#00ff88"
    });
  }

  update(delta) {
    for (const particle of this.items) {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      if (particle.type === "heal") {
        particle.radius += 24 * delta;
      }
    }
    this.items = this.items.filter((particle) => particle.life > 0);
  }

  draw(ctx, camera) {
    for (const particle of this.items) {
      const x = particle.x - camera.x;
      const y = particle.y - camera.y;
      const alpha = particle.life / particle.maxLife;
      if (particle.type === "number") {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = particle.color;
        ctx.font = `bold ${14 + Math.min(particle.value / 10, 12)}px 'Share Tech Mono', monospace`;
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        ctx.fillText(`-${particle.value}`, x, y);
        ctx.shadowBlur = 0;
        ctx.restore();
        continue;
      }
      if (particle.type === "killConfirm") {
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 1.4);
        ctx.fillStyle = "#00ff88";
        ctx.font = "bold 22px 'Share Tech Mono', monospace";
        ctx.textAlign = "center";
        ctx.shadowColor = "#00ff88";
        ctx.shadowBlur = 8;
        ctx.fillText("+1 KILL", particle.x, particle.y);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
      if (particle.type === "heal") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
