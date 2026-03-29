export class BulletSprite {
  constructor(snapshot) {
    this.id = snapshot.id;
    this.update(snapshot, true);
    this.trail = [];
  }

  update(snapshot, instant = false) {
    this.snapshot = { ...snapshot };
    if (instant || this.drawX === undefined) {
      this.drawX = snapshot.x;
      this.drawY = snapshot.y;
    }
    this.targetX = snapshot.x;
    this.targetY = snapshot.y;
  }

  tick(alpha = 0.25) {
    this.trail.push({ x: this.drawX, y: this.drawY, life: 0.15 });
    this.trail = this.trail.map((point) => ({ ...point, life: point.life - 1 / 60 })).filter((point) => point.life > 0);
    this.drawX += (this.targetX - this.drawX) * alpha;
    this.drawY += (this.targetY - this.drawY) * alpha;
  }

  draw(ctx, camera) {
    for (const point of this.trail) {
      ctx.fillStyle = `rgba(255,255,255,${point.life / 0.15 * 0.35})`;
      ctx.beginPath();
      ctx.arc(point.x - camera.x, point.y - camera.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(this.drawX - camera.x, this.drawY - camera.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
