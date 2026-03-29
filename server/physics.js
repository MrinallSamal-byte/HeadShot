function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(aX, aY, bX, bY) {
  return Math.hypot(bX - aX, bY - aY);
}

function circleIntersectsRect(x, y, radius, rect) {
  const nearestX = clamp(x, rect.x, rect.x + rect.w);
  const nearestY = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function segmentIntersectsCircle(start, end, circleX, circleY, radius) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - circleX;
  const fy = start.y - circleY;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0 || a === 0) {
    return null;
  }

  const sqrt = Math.sqrt(discriminant);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);
  const candidates = [t1, t2].filter((value) => value >= 0 && value <= 1).sort((aT, bT) => aT - bT);

  if (!candidates.length) {
    return null;
  }

  const t = candidates[0];
  return {
    t,
    x: start.x + dx * t,
    y: start.y + dy * t
  };
}

function rayIntersectAABB(start, end, rect) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let tMin = 0;
  let tMax = 1;
  let normal = { x: 0, y: 0 };

  if (dx === 0) {
    if (start.x < rect.x || start.x > rect.x + rect.w) {
      return null;
    }
  } else {
    const invDx = 1 / dx;
    let t1 = (rect.x - start.x) * invDx;
    let t2 = (rect.x + rect.w - start.x) * invDx;
    let nx = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      nx = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      normal = { x: nx, y: 0 };
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return null;
    }
  }

  if (dy === 0) {
    if (start.y < rect.y || start.y > rect.y + rect.h) {
      return null;
    }
  } else {
    const invDy = 1 / dy;
    let t1 = (rect.y - start.y) * invDy;
    let t2 = (rect.y + rect.h - start.y) * invDy;
    let ny = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      ny = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      normal = { x: 0, y: ny };
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return null;
    }
  }

  if (tMin < 0 || tMin > 1) {
    return null;
  }

  return {
    t: tMin,
    x: start.x + dx * tMin,
    y: start.y + dy * tMin,
    normal
  };
}

function moveCircle(x, y, dx, dy, radius, rects, bounds) {
  let nextX = x + dx;
  let nextY = y;

  if (bounds) {
    nextX = clamp(nextX, radius, bounds.width - radius);
  }

  for (const rect of rects) {
    if (!rect.active) {
      continue;
    }
    if (circleIntersectsRect(nextX, nextY, radius, rect)) {
      if (dx > 0) {
        nextX = rect.x - radius;
      } else if (dx < 0) {
        nextX = rect.x + rect.w + radius;
      }
    }
  }

  nextY = y + dy;
  if (bounds) {
    nextY = clamp(nextY, radius, bounds.height - radius);
  }

  for (const rect of rects) {
    if (!rect.active) {
      continue;
    }
    if (circleIntersectsRect(nextX, nextY, radius, rect)) {
      if (dy > 0) {
        nextY = rect.y - radius;
      } else if (dy < 0) {
        nextY = rect.y + rect.h + radius;
      }
    }
  }

  return { x: nextX, y: nextY };
}

function reflectAngle(angle, normal) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const dot = dirX * normal.x + dirY * normal.y;
  const outX = dirX - 2 * dot * normal.x;
  const outY = dirY - 2 * dot * normal.y;
  return Math.atan2(outY, outX);
}

function resolvePlayerOverlaps(players) {
  const list = players.filter((player) => player.alive && !player.spectator);
  for (let index = 0; index < list.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < list.length; compareIndex += 1) {
      const a = list[index];
      const b = list[compareIndex];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;
      if (!dist || dist >= minDist) {
        continue;
      }

      const overlap = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
    }
  }
}

module.exports = {
  clamp,
  distance,
  circleIntersectsRect,
  segmentIntersectsCircle,
  rayIntersectAABB,
  moveCircle,
  reflectAngle,
  resolvePlayerOverlaps
};
