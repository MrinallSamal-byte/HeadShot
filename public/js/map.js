function createWall(list, x, y, w, h, type = "wall", depth = 24) {
  list.push({ id: `${type}-${list.length + 1}`, x, y, w, h, type, depth, active: true });
}

function createOuterWalls(list, width, height, thickness, doorways) {
  const edges = [
    ["top", "x", "w", width, 0, 0, thickness],
    ["bottom", "x", "w", width, 0, height - thickness, thickness],
    ["left", "y", "h", height, 0, 0, thickness],
    ["right", "y", "h", height, width - thickness, 0, thickness]
  ];

  for (const [edge, posKey, sizeKey, span, fixedX, fixedY, thicknessValue] of edges) {
    let cursor = 0;
    const doors = doorways[edge] || [];
    for (const door of doors) {
      if (edge === "top" || edge === "bottom") {
        createWall(list, cursor, fixedY, door.x - cursor, thicknessValue);
        cursor = door.x + door.w;
      } else {
        createWall(list, fixedX, cursor, thicknessValue, door.y - cursor);
        cursor = door.y + door.h;
      }
    }
    if (edge === "top" || edge === "bottom") {
      createWall(list, cursor, fixedY, span - cursor, thicknessValue);
    } else {
      createWall(list, fixedX, cursor, thicknessValue, span - cursor);
    }
  }
}

function warehouse() {
  const width = 2400;
  const height = 1800;
  const walls = [];
  createOuterWalls(walls, width, height, 56, {
    top: [{ x: 260, w: 160 }, { x: 1120, w: 160 }, { x: 1980, w: 160 }],
    bottom: [{ x: 260, w: 160 }, { x: 1120, w: 160 }, { x: 1980, w: 160 }],
    left: [{ y: 340, h: 160 }, { y: 820, h: 160 }, { y: 1300, h: 160 }],
    right: [{ y: 340, h: 160 }, { y: 820, h: 160 }, { y: 1300, h: 160 }]
  });
  for (const [originX, originY] of [[520, 380], [1560, 380], [520, 1140], [1560, 1140]]) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        createWall(walls, originX + column * 76, originY + row * 76, 64, 64, "crate", 18);
      }
    }
  }
  createWall(walls, 940, 360, 96, 280, "crate", 18);
  createWall(walls, 1364, 360, 96, 280, "crate", 18);
  createWall(walls, 940, 1160, 96, 280, "crate", 18);
  createWall(walls, 1364, 1160, 96, 280, "crate", 18);
  return {
    id: "warehouse",
    name: "Warehouse",
    width,
    height,
    walls,
    spawns: {
      red: [{ x: 180, y: 180 }, { x: 180, y: 1620 }],
      blue: [{ x: 2220, y: 180 }, { x: 2220, y: 1620 }],
      all: [{ x: 180, y: 180 }, { x: 180, y: 1620 }, { x: 2220, y: 180 }, { x: 2220, y: 1620 }]
    },
    hillPoints: [{ x: 1200, y: 900, radius: 120 }, { x: 1200, y: 420, radius: 120 }, { x: 1200, y: 1380, radius: 120 }]
  };
}

function city() {
  const width = 2800;
  const height = 2000;
  const walls = [];
  createOuterWalls(walls, width, height, 56, {
    top: [{ x: 1260, w: 280 }],
    bottom: [{ x: 1260, w: 280 }],
    left: [{ y: 900, h: 220 }],
    right: [{ y: 900, h: 220 }]
  });
  createWall(walls, 260, 260, 420, 320, "building", 34);
  createWall(walls, 1170, 560, 460, 340, "building", 34);
  createWall(walls, 1960, 260, 520, 440, "building", 34);
  for (const [x, y] of [[760, 300], [760, 460], [960, 1220], [1140, 1320], [1720, 1360], [1990, 1100], [2240, 1220]]) {
    createWall(walls, x, y, 120, 60, "car", 14);
  }
  return {
    id: "city",
    name: "City Block",
    width,
    height,
    walls,
    spawns: {
      red: [{ x: 200, y: 180 }, { x: 200, y: 1820 }],
      blue: [{ x: 2600, y: 180 }, { x: 2600, y: 1820 }],
      all: [{ x: 200, y: 180 }, { x: 200, y: 1820 }, { x: 2600, y: 180 }, { x: 2600, y: 1820 }]
    },
    hillPoints: [{ x: 1400, y: 1020, radius: 120 }, { x: 900, y: 1020, radius: 120 }, { x: 1900, y: 1020, radius: 120 }]
  };
}

function bunker() {
  const width = 2000;
  const height = 2000;
  const walls = [];
  createOuterWalls(walls, width, height, 64, {
    top: [{ x: 920, w: 160 }],
    bottom: [{ x: 920, w: 160 }],
    left: [{ y: 920, h: 160 }],
    right: [{ y: 920, h: 160 }]
  });
  for (const [x, y, w, h] of [[320, 320, 96, 520], [320, 1060, 96, 520], [608, 320, 560, 96], [608, 1604, 560, 96], [872, 420, 96, 520], [872, 1060, 96, 520], [1180, 320, 96, 520], [1180, 1060, 96, 520], [1410, 320, 96, 520], [1410, 1060, 96, 520], [1180, 900, 480, 96], [420, 900, 260, 96]]) {
    createWall(walls, x, y, w, h, "bunker", 28);
  }
  return {
    id: "bunker",
    name: "Bunker",
    width,
    height,
    walls,
    spawns: {
      red: [{ x: 200, y: 200 }, { x: 200, y: 1800 }],
      blue: [{ x: 1800, y: 200 }, { x: 1800, y: 1800 }],
      all: [{ x: 200, y: 200 }, { x: 200, y: 1800 }, { x: 1800, y: 200 }, { x: 1800, y: 1800 }]
    },
    hillPoints: [{ x: 1000, y: 1000, radius: 120 }, { x: 1000, y: 560, radius: 120 }, { x: 1000, y: 1440, radius: 120 }]
  };
}

export function createProceduralMap(mapId) {
  if (mapId === "city") return city();
  if (mapId === "bunker") return bunker();
  return warehouse();
}

export function moveCircleLocal(x, y, dx, dy, radius, colliders, bounds) {
  let nextX = x + dx;
  if (bounds) {
    nextX = Math.max(radius, Math.min(bounds.width - radius, nextX));
  }
  for (const rect of colliders) {
    if (!rect.active) continue;
    const nearestX = Math.max(rect.x, Math.min(rect.x + rect.w, nextX));
    const nearestY = Math.max(rect.y, Math.min(rect.y + rect.h, y));
    const dX = nextX - nearestX;
    const dY = y - nearestY;
    if (dX * dX + dY * dY < radius * radius) {
      if (dx > 0) nextX = rect.x - radius;
      if (dx < 0) nextX = rect.x + rect.w + radius;
    }
  }
  let nextY = y + dy;
  if (bounds) {
    nextY = Math.max(radius, Math.min(bounds.height - radius, nextY));
  }
  for (const rect of colliders) {
    if (!rect.active) continue;
    const nearestX = Math.max(rect.x, Math.min(rect.x + rect.w, nextX));
    const nearestY = Math.max(rect.y, Math.min(rect.y + rect.h, nextY));
    const dX = nextX - nearestX;
    const dY = nextY - nearestY;
    if (dX * dX + dY * dY < radius * radius) {
      if (dy > 0) nextY = rect.y - radius;
      if (dy < 0) nextY = rect.y + rect.h + radius;
    }
  }
  return { x: nextX, y: nextY };
}

export class MapRenderer {
  constructor(mapId) {
    this.data = createProceduralMap(mapId);
  }

  setMap(mapId) {
    this.data = createProceduralMap(mapId);
  }

  drawFloor(ctx, camera, viewWidth, viewHeight) {
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const tile = 64;
    const startX = Math.floor(camera.x / tile) * tile;
    const startY = Math.floor(camera.y / tile) * tile;
    for (let y = startY - tile; y < camera.y + viewHeight + tile; y += tile) {
      for (let x = startX - tile; x < camera.x + viewWidth + tile; x += tile) {
        const screenX = x - camera.x;
        const screenY = y - camera.y;
        const tone = ((x / tile + y / tile) % 2 === 0) ? 18 : 14;
        ctx.fillStyle = `rgba(${tone},${tone + 4},${tone + 8},0.85)`;
        ctx.fillRect(screenX, screenY, tile, tile);
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(screenX + ((x + y) % 11), screenY + ((x * y) % 9), 4, 4);
      }
    }
  }

  drawWalls(ctx, camera, destructibles = []) {
    const destructibleMap = new Map(destructibles.map((item) => [item.id, item]));
    const allWalls = this.data.walls.concat(
      destructibles
        .filter((prop) => prop.active)
        .map((prop) => ({ ...prop, type: "destructible", depth: 18 }))
    );

    for (const wall of allWalls) {
      const current = destructibleMap.get(wall.id) || wall;
      if (!current.active) continue;
      const x = current.x - camera.x;
      const y = current.y - camera.y;
      const depth = current.depth || 20;
      ctx.fillStyle = current.type === "car" ? "#374151" : current.type === "building" ? "#1f2937" : "#2b313c";
      ctx.fillRect(x, y, current.w, current.h);
      ctx.fillStyle = current.type === "destructible" ? "#9a3412" : "#475569";
      ctx.fillRect(x, y, current.w, 8);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x + current.w - 8, y, 8, current.h + depth);
      ctx.fillRect(x, y + current.h, current.w, depth);
    }
  }

  drawHill(ctx, camera, hill) {
    if (!hill) return;
    const x = hill.x - camera.x;
    const y = hill.y - camera.y;
    ctx.save();
    ctx.strokeStyle = hill.controller === "red" ? "#ff3344" : hill.controller === "blue" ? "#00a2ff" : "#ffb800";
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(x, y, hill.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,184,0,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, hill.radius - 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hill.captureProgress);
    ctx.stroke();
    ctx.restore();
  }
}
