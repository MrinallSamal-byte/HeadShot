const { getGunConfig } = require("./guns-config");
const {
  distance,
  segmentIntersectsCircle,
  rayIntersectAABB,
  moveCircle,
  reflectAngle,
  resolvePlayerOverlaps
} = require("./physics");

const PLAYER_RADIUS = 20;
const BASE_SPEED = 220;
const HEAVY_FIRING_SPEED = 160;
const SNAPSHOT_RATE = 1000 / 20;
const TICK_RATE = 1000 / 60;
const TEAM_MODES = new Set(["tdm", "koth"]);
const PICKUP_RESPAWN = {
  health: 20000,
  armor: 30000,
  ammo: 15000,
  speed: 45000
};

function createWall(list, x, y, w, h, type = "wall", extra = {}) {
  list.push({
    id: `${type}-${list.length + 1}`,
    x,
    y,
    w,
    h,
    type,
    depth: extra.depth ?? 24,
    active: extra.active ?? true
  });
}

function createOuterWalls(list, width, height, thickness, doorways) {
  const topDoors = doorways.top || [];
  const bottomDoors = doorways.bottom || [];
  const leftDoors = doorways.left || [];
  const rightDoors = doorways.right || [];

  let cursor = 0;
  for (const door of topDoors) {
    createWall(list, cursor, 0, door.x - cursor, thickness);
    cursor = door.x + door.w;
  }
  createWall(list, cursor, 0, width - cursor, thickness);

  cursor = 0;
  for (const door of bottomDoors) {
    createWall(list, cursor, height - thickness, door.x - cursor, thickness);
    cursor = door.x + door.w;
  }
  createWall(list, cursor, height - thickness, width - cursor, thickness);

  cursor = 0;
  for (const door of leftDoors) {
    createWall(list, 0, cursor, thickness, door.y - cursor);
    cursor = door.y + door.h;
  }
  createWall(list, 0, cursor, thickness, height - cursor);

  cursor = 0;
  for (const door of rightDoors) {
    createWall(list, width - thickness, cursor, thickness, door.y - cursor);
    cursor = door.y + door.h;
  }
  createWall(list, width - thickness, cursor, thickness, height - cursor);
}

function createWarehouse() {
  const width = 2400;
  const height = 1800;
  const walls = [];
  const thickness = 56;

  createOuterWalls(walls, width, height, thickness, {
    top: [{ x: 260, w: 160 }, { x: 1120, w: 160 }, { x: 1980, w: 160 }],
    bottom: [{ x: 260, w: 160 }, { x: 1120, w: 160 }, { x: 1980, w: 160 }],
    left: [{ y: 340, h: 160 }, { y: 820, h: 160 }, { y: 1300, h: 160 }],
    right: [{ y: 340, h: 160 }, { y: 820, h: 160 }, { y: 1300, h: 160 }]
  });

  const clusterOrigins = [
    [520, 380],
    [1560, 380],
    [520, 1140],
    [1560, 1140]
  ];
  for (const [originX, originY] of clusterOrigins) {
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        createWall(
          walls,
          originX + column * 76,
          originY + row * 76,
          64,
          64,
          "crate",
          { depth: 18 }
        );
      }
    }
  }

  createWall(walls, 940, 360, 96, 280, "crate", { depth: 18 });
  createWall(walls, 1364, 360, 96, 280, "crate", { depth: 18 });
  createWall(walls, 940, 1160, 96, 280, "crate", { depth: 18 });
  createWall(walls, 1364, 1160, 96, 280, "crate", { depth: 18 });

  return {
    id: "warehouse",
    name: "Warehouse",
    width,
    height,
    walls,
    destructibles: [],
    spawns: {
      red: [{ x: 180, y: 180 }, { x: 180, y: 1620 }],
      blue: [{ x: 2220, y: 180 }, { x: 2220, y: 1620 }],
      all: [
        { x: 180, y: 180 },
        { x: 180, y: 1620 },
        { x: 2220, y: 180 },
        { x: 2220, y: 1620 }
      ]
    },
    pickupSpawns: [
      { id: "health-a", type: "health", x: 1200, y: 420 },
      { id: "health-b", type: "health", x: 1200, y: 1380 },
      { id: "armor-a", type: "armor", x: 700, y: 900 },
      { id: "armor-b", type: "armor", x: 1700, y: 900 },
      { id: "ammo-a", type: "ammo", x: 1200, y: 900 },
      { id: "speed-a", type: "speed", x: 1200, y: 220 }
    ],
    hillPoints: [
      { x: 1200, y: 900, radius: 120 },
      { x: 1200, y: 420, radius: 120 },
      { x: 1200, y: 1380, radius: 120 }
    ]
  };
}

function createCityBlock() {
  const width = 2800;
  const height = 2000;
  const walls = [];
  const thickness = 56;

  createOuterWalls(walls, width, height, thickness, {
    top: [{ x: 1260, w: 280 }],
    bottom: [{ x: 1260, w: 280 }],
    left: [{ y: 900, h: 220 }],
    right: [{ y: 900, h: 220 }]
  });

  createWall(walls, 260, 260, 420, 320, "building", { depth: 34 });
  createWall(walls, 1170, 560, 460, 340, "building", { depth: 34 });
  createWall(walls, 1960, 260, 520, 440, "building", { depth: 34 });

  const cars = [
    [760, 300],
    [760, 460],
    [960, 1220],
    [1140, 1320],
    [1720, 1360],
    [1990, 1100],
    [2240, 1220]
  ];
  for (const [x, y] of cars) {
    createWall(walls, x, y, 120, 60, "car", { depth: 14 });
  }

  return {
    id: "city",
    name: "City Block",
    width,
    height,
    walls,
    destructibles: [],
    spawns: {
      red: [{ x: 200, y: 180 }, { x: 200, y: 1820 }],
      blue: [{ x: 2600, y: 180 }, { x: 2600, y: 1820 }],
      all: [
        { x: 200, y: 180 },
        { x: 200, y: 1820 },
        { x: 2600, y: 180 },
        { x: 2600, y: 1820 }
      ]
    },
    pickupSpawns: [
      { id: "health-a", type: "health", x: 1400, y: 360 },
      { id: "health-b", type: "health", x: 1400, y: 1640 },
      { id: "armor-a", type: "armor", x: 540, y: 1030 },
      { id: "armor-b", type: "armor", x: 2280, y: 1030 },
      { id: "ammo-a", type: "ammo", x: 1400, y: 1020 },
      { id: "speed-a", type: "speed", x: 1400, y: 220 }
    ],
    hillPoints: [
      { x: 1400, y: 1020, radius: 120 },
      { x: 900, y: 1020, radius: 120 },
      { x: 1900, y: 1020, radius: 120 }
    ]
  };
}

function createBunker() {
  const width = 2000;
  const height = 2000;
  const walls = [];
  const thickness = 64;

  createOuterWalls(walls, width, height, thickness, {
    top: [{ x: 920, w: 160 }],
    bottom: [{ x: 920, w: 160 }],
    left: [{ y: 920, h: 160 }],
    right: [{ y: 920, h: 160 }]
  });

  const segments = [
    [320, 320, 96, 520],
    [320, 1060, 96, 520],
    [608, 320, 560, 96],
    [608, 1604, 560, 96],
    [872, 420, 96, 520],
    [872, 1060, 96, 520],
    [1180, 320, 96, 520],
    [1180, 1060, 96, 520],
    [1410, 320, 96, 520],
    [1410, 1060, 96, 520],
    [1180, 900, 480, 96],
    [420, 900, 260, 96]
  ];

  for (const [x, y, w, h] of segments) {
    createWall(walls, x, y, w, h, "bunker", { depth: 28 });
  }

  const destructibles = [
    { id: "barricade-1", x: 968, y: 320, w: 80, h: 96, hp: 3, maxHp: 3, active: true },
    { id: "barricade-2", x: 968, y: 1584, w: 80, h: 96, hp: 3, maxHp: 3, active: true },
    { id: "barricade-3", x: 500, y: 968, w: 96, h: 80, hp: 3, maxHp: 3, active: true },
    { id: "barricade-4", x: 1440, y: 968, w: 96, h: 80, hp: 3, maxHp: 3, active: true }
  ];

  return {
    id: "bunker",
    name: "Bunker",
    width,
    height,
    walls,
    destructibles,
    spawns: {
      red: [{ x: 200, y: 200 }, { x: 200, y: 1800 }],
      blue: [{ x: 1800, y: 200 }, { x: 1800, y: 1800 }],
      all: [
        { x: 200, y: 200 },
        { x: 200, y: 1800 },
        { x: 1800, y: 200 },
        { x: 1800, y: 1800 }
      ]
    },
    pickupSpawns: [
      { id: "health-a", type: "health", x: 1000, y: 560 },
      { id: "health-b", type: "health", x: 1000, y: 1440 },
      { id: "armor-a", type: "armor", x: 680, y: 1000 },
      { id: "armor-b", type: "armor", x: 1320, y: 1000 },
      { id: "ammo-a", type: "ammo", x: 1000, y: 1000 },
      { id: "speed-a", type: "speed", x: 1000, y: 200 }
    ],
    hillPoints: [
      { x: 1000, y: 1000, radius: 120 },
      { x: 1000, y: 560, radius: 120 },
      { x: 1000, y: 1440, radius: 120 }
    ]
  };
}

function createMap(mapId) {
  switch (mapId) {
    case "city":
      return createCityBlock();
    case "bunker":
      return createBunker();
    case "warehouse":
    default:
      return createWarehouse();
  }
}

function normalizeTeam(team) {
  return team === "red" || team === "blue" ? team : "red";
}

class GameState {
  constructor(room, io, hooks = {}) {
    this.room = room;
    this.io = io;
    this.hooks = hooks;
    this.map = createMap(room.settings.mapId);
    this.players = new Map();
    this.bullets = [];
    this.killFeed = [];
    this.teamScores = { red: 0, blue: 0 };
    this.firstBlood = false;
    this.ended = false;
    this.startedAt = Date.now();
    this.lastTickAt = this.startedAt;
    this.warmupUntil = Date.now() + 3000;
    this.warmupBroadcastDone = false;
    this.lastWarmupSecond = null;
    this.remainingTime = room.settings.timeLimit ? room.settings.timeLimit * 1000 : null;
    this.lastTimerBroadcastSecond = this.remainingTime !== null ? Math.ceil(this.remainingTime / 1000) : null;
    this.hill = {
      index: 0,
      rotateAt: this.startedAt + 90000,
      controller: null,
      captureProgress: 0,
      pointAccumulator: 0
    };
    this.pickups = this.map.pickupSpawns.map((spawn) => ({
      ...spawn,
      active: room.settings.allowPickups,
      respawnAt: 0
    }));

    for (const prop of this.map.destructibles) {
      prop.active = true;
      prop.hp = prop.maxHp;
    }

    for (const meta of room.players.values()) {
      this.ensurePlayer(meta);
      if (!meta.spectator) {
        this.spawnPlayer(meta.token);
      }
    }
  }

  start() {
    this.tickTimer = setInterval(() => this.tick(), TICK_RATE);
    this.snapshotTimer = setInterval(() => this.broadcastSnapshot(), SNAPSHOT_RATE);
    if (this.remainingTime !== null) {
      this.timerTimer = setInterval(() => this.broadcastTimer(), 1000);
    }
  }

  stop() {
    clearInterval(this.tickTimer);
    clearInterval(this.snapshotTimer);
    clearInterval(this.timerTimer);
  }

  ensurePlayer(meta) {
    const existing = this.players.get(meta.token);
    if (existing) {
      existing.name = meta.name;
      existing.color = meta.color;
      existing.team = TEAM_MODES.has(this.room.settings.mode) ? normalizeTeam(meta.team) : "solo";
      existing.ping = meta.ping || 0;
      existing.connected = meta.connected;
      existing.spectator = !!meta.spectator;
      return existing;
    }

    const runtime = {
      token: meta.token,
      id: meta.id,
      name: meta.name,
      color: meta.color,
      team: TEAM_MODES.has(this.room.settings.mode) ? normalizeTeam(meta.team) : "solo",
      x: 0,
      y: 0,
      radius: PLAYER_RADIUS,
      angle: 0,
      hp: this.room.settings.startHp,
      maxHp: this.room.settings.startHp,
      armor: 0,
      maxArmor: 50,
      alive: false,
      input: {
        keys: {
          up: false,
          down: false,
          left: false,
          right: false,
          scoped: false
        },
        angle: 0
      },
      gunId: meta.selectedGunId || 1,
      ammoInMag: 0,
      reserveAmmo: 0,
      reloading: false,
      reloadEndAt: 0,
      lastFireAt: 0,
      lastShotAt: 0,
      lastDamageAt: 0,
      lastRegenTickAt: 0,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      killStreak: 0,
      bestStreak: 0,
      kothScore: 0,
      respawnAvailableAt: 0,
      spectating: null,
      speedBoostUntil: 0,
      ping: meta.ping || 0,
      connected: meta.connected,
      spectator: !!meta.spectator
    };

    this.resetAmmo(runtime);
    this.players.set(meta.token, runtime);
    return runtime;
  }

  syncRoomPlayers() {
    for (const meta of this.room.players.values()) {
      this.ensurePlayer(meta);
    }
    for (const token of Array.from(this.players.keys())) {
      if (!this.room.players.has(token)) {
        this.players.delete(token);
      }
    }
  }

  getSnapshotPayload() {
    return {
      serverTime: Date.now(),
      roomCode: this.room.code,
      mapId: this.map.id,
      mode: this.room.settings.mode,
      remaining: this.remainingTime,
      settings: this.room.settings,
      players: Array.from(this.players.values()).map((player) => ({
        token: player.token,
        id: player.id,
        name: player.name,
        color: player.color,
        team: player.team,
        x: player.x,
        y: player.y,
        angle: player.angle,
        hp: player.hp,
        maxHp: player.maxHp,
        armor: player.armor,
        maxArmor: player.maxArmor,
        alive: player.alive,
        gunId: player.gunId,
        ammoInMag: player.ammoInMag,
        reserveAmmo: player.reserveAmmo,
        reloading: player.reloading,
        reloadEndAt: player.reloadEndAt,
        kills: player.kills,
        deaths: player.deaths,
        damageDealt: player.damageDealt,
        kothScore: player.kothScore,
        killStreak: player.killStreak,
        bestStreak: player.bestStreak,
        ping: player.ping,
        spectating: player.spectating,
        spectator: player.spectator,
        speedBoostUntil: player.speedBoostUntil
      })),
      bullets: this.bullets.map((bullet) => ({
        id: bullet.id,
        ownerId: bullet.ownerToken,
        x: bullet.x,
        y: bullet.y,
        angle: bullet.angle,
        gunId: bullet.gunId,
        speed: bullet.speed,
        explosive: bullet.explosive
      })),
      pickups: this.pickups.map((pickup) => ({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        active: pickup.active
      })),
      destructibles: this.map.destructibles.map((prop) => ({
        id: prop.id,
        x: prop.x,
        y: prop.y,
        w: prop.w,
        h: prop.h,
        hp: prop.hp,
        active: prop.active
      })),
      killfeed: this.killFeed,
      teamScores: this.teamScores,
      hill: {
        index: this.hill.index,
        x: this.map.hillPoints[this.hill.index].x,
        y: this.map.hillPoints[this.hill.index].y,
        radius: this.map.hillPoints[this.hill.index].radius,
        controller: this.hill.controller,
        captureProgress: this.hill.captureProgress
      }
    };
  }

  sendSnapshotTo(socket) {
    socket.emit("game:state", this.getSnapshotPayload());
  }

  broadcastSnapshot() {
    if (this.ended) {
      return;
    }
    this.io.to(this.room.code).emit("game:state", this.getSnapshotPayload());
  }

  broadcastTimer() {
    if (this.remainingTime === null || this.ended) {
      return;
    }
    const seconds = Math.max(0, Math.ceil(this.remainingTime / 1000));
    if (seconds === this.lastTimerBroadcastSecond) {
      return;
    }
    this.lastTimerBroadcastSecond = seconds;
    this.io.to(this.room.code).emit("timer:tick", { remaining: this.remainingTime });
  }

  getActiveColliders() {
    return this.map.walls.concat(this.map.destructibles.filter((prop) => prop.active));
  }

  getSpawnCandidates(team) {
    if (TEAM_MODES.has(this.room.settings.mode)) {
      return this.map.spawns[normalizeTeam(team)] || this.map.spawns.all;
    }
    return this.map.spawns.all;
  }

  selectSpawnPoint(token) {
    const player = this.players.get(token);
    const candidates = this.getSpawnCandidates(player.team);
    const others = Array.from(this.players.values()).filter(
      (entity) => entity.token !== token && entity.alive && !entity.spectator
    );

    let bestCandidate = candidates[0];
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      let minDistance = Infinity;
      for (const other of others) {
        minDistance = Math.min(minDistance, distance(candidate.x, candidate.y, other.x, other.y));
      }
      if (!others.length) {
        minDistance = 9999;
      }
      if (minDistance > bestScore) {
        bestScore = minDistance;
        bestCandidate = candidate;
      }
    }

    return { x: bestCandidate.x, y: bestCandidate.y };
  }

  resetAmmo(player) {
    const gun = getGunConfig(player.gunId);
    player.ammoInMag = gun.magazine;
    if (gun.infiniteAmmo) {
      player.reserveAmmo = -1;
    } else {
      player.reserveAmmo = gun.magazine * gun.reserveClips;
    }
  }

  fillAmmo(player) {
    const gun = getGunConfig(player.gunId);
    player.ammoInMag = gun.magazine;
    if (!gun.infiniteAmmo) {
      player.reserveAmmo = gun.magazine * gun.reserveClips;
    }
  }

  spawnPlayer(token) {
    const player = this.players.get(token);
    if (!player) {
      return null;
    }

    const spawn = this.selectSpawnPoint(token);
    player.x = spawn.x;
    player.y = spawn.y;
    player.hp = player.maxHp;
    player.armor = 0;
    player.alive = true;
    player.spectator = false;
    player.respawnAvailableAt = 0;
    player.spectating = null;
    player.reloading = false;
    player.reloadEndAt = 0;
    player.speedBoostUntil = 0;
    player.lastDamageAt = 0;
    player.lastRegenTickAt = 0;
    this.resetAmmo(player);

    this.io.to(this.room.code).emit("player:spawned", {
      playerId: player.id,
      x: player.x,
      y: player.y,
      hp: player.hp
    });

    return player;
  }

  removePlayer(token) {
    this.players.delete(token);
  }

  handleMove(token, payload = {}) {
    const player = this.players.get(token);
    if (!player || this.ended) {
      return;
    }

    const claimedX = Number(payload.x);
    const claimedY = Number(payload.y);
    if (Number.isFinite(claimedX) && Number.isFinite(claimedY)) {
      const traveled = distance(player.x, player.y, claimedX, claimedY);
      const maxAllowed = BASE_SPEED * 0.6;
      if (traveled > maxAllowed) {
        player.x = Math.max(PLAYER_RADIUS, Math.min(this.map.width - PLAYER_RADIUS, claimedX));
        player.y = Math.max(PLAYER_RADIUS, Math.min(this.map.height - PLAYER_RADIUS, claimedY));
      }
    }

    const keys = payload.keys || {};
    player.input = {
      angle: Number.isFinite(payload.angle) ? payload.angle : player.input.angle,
      keys: {
        up: !!keys.up,
        down: !!keys.down,
        left: !!keys.left,
        right: !!keys.right,
        scoped: !!keys.scoped
      }
    };
  }

  startReload(token) {
    const player = this.players.get(token);
    if (!player || !player.alive) {
      return;
    }

    const gun = getGunConfig(player.gunId);
    if (gun.infiniteAmmo || player.reloading || player.ammoInMag >= gun.magazine || player.reserveAmmo <= 0) {
      return;
    }

    player.reloading = true;
    player.reloadEndAt = Date.now() + gun.reloadTime * 1000;
  }

  interruptReload(player) {
    if (!player.reloading) {
      return;
    }
    player.reloading = false;
    player.reloadEndAt = 0;
  }

  finishReload(player) {
    const gun = getGunConfig(player.gunId);
    if (!player.reloading || gun.infiniteAmmo) {
      return;
    }
    const needed = gun.magazine - player.ammoInMag;
    const loaded = Math.min(needed, player.reserveAmmo);
    player.ammoInMag += loaded;
    player.reserveAmmo -= loaded;
    player.reloading = false;
    player.reloadEndAt = 0;
  }

  createBullet(player, gun, angle) {
    const muzzleOffset = 28;
    const x = player.x + Math.cos(angle) * muzzleOffset;
    const y = player.y + Math.sin(angle) * muzzleOffset;
    return {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ownerToken: player.token,
      x,
      y,
      angle,
      speed: gun.bulletSpeed,
      damage: gun.damage,
      gunId: gun.id,
      range: gun.range,
      remainingRange: gun.range,
      explosive: !!gun.projectile,
      splashRadius: gun.splashRadius || 0,
      bounces: 0,
      maxBounces: gun.maxBounces || 0
    };
  }

  handleFire(token, payload = {}) {
    const player = this.players.get(token);
    if (!player || !player.alive || this.ended) {
      return;
    }
    if (Date.now() < this.warmupUntil) {
      return;
    }

    const gun = getGunConfig(player.gunId);
    const now = Date.now();
    const minDelay = 60000 / gun.rpm;

    if (now - player.lastFireAt < minDelay) {
      return;
    }

    if (payload.gunId && payload.gunId !== player.gunId) {
      return;
    }

    if (player.reloading) {
      if (player.ammoInMag <= 0) {
        return;
      }
      this.interruptReload(player);
    }

    if (player.ammoInMag <= 0) {
      this.startReload(token);
      return;
    }

    player.lastFireAt = now;
    player.lastShotAt = now;
    player.angle = Number.isFinite(payload.angle) ? payload.angle : player.angle;

    if (!gun.infiniteAmmo) {
      player.ammoInMag -= 1;
    } else {
      player.ammoInMag = Math.max(0, player.ammoInMag - 1);
      if (player.ammoInMag === 0) {
        player.ammoInMag = gun.magazine;
      }
    }

    const pelletCount = gun.pellets || 1;
    for (let pellet = 0; pellet < pelletCount; pellet += 1) {
      const spreadOffset = pelletCount > 1
        ? ((Math.random() - 0.5) * gun.spreadDeg * Math.PI) / 180
        : ((Math.random() - 0.5) * gun.spreadDeg * Math.PI) / 180;
      const bullet = this.createBullet(player, gun, player.angle + spreadOffset);
      this.bullets.push(bullet);
      this.io.to(this.room.code).emit("bullet:fired", {
        bulletId: bullet.id,
        ownerId: player.id,
        x: bullet.x,
        y: bullet.y,
        angle: bullet.angle,
        gunId: bullet.gunId
      });
    }

    if (player.ammoInMag <= 0 && !gun.infiniteAmmo && player.reserveAmmo > 0) {
      this.startReload(token);
    }
  }

  handleRespawn(token, gunId) {
    const player = this.players.get(token);
    if (!player || player.alive || Date.now() < player.respawnAvailableAt) {
      return;
    }

    const selected = getGunConfig(gunId || player.gunId);
    player.gunId = selected.id;
    const meta = this.room.players.get(token);
    if (meta) {
      meta.selectedGunId = selected.id;
    }
    this.spawnPlayer(token);
  }

  handleSwitchGun(token, gunId) {
    const player = this.players.get(token);
    const requested = Number(gunId);
    if (!player || !player.alive || !Number.isInteger(requested) || requested < 1 || requested > 8) {
      return;
    }
    const gun = getGunConfig(requested);
    this.interruptReload(player);
    player.gunId = gun.id;
    this.resetAmmo(player);
    const meta = this.room.players.get(token);
    if (meta) {
      meta.selectedGunId = gun.id;
    }
  }

  applyDamage(victim, rawDamage, attackerToken, gunId, hitPoint) {
    if (!victim || !victim.alive) {
      return;
    }

    const attacker = attackerToken ? this.players.get(attackerToken) : null;
    const armorAbsorb = Math.min(victim.armor, rawDamage * 0.3);
    const hpDamage = Math.max(1, Math.round(rawDamage - armorAbsorb));
    victim.armor = Math.max(0, victim.armor - armorAbsorb);
    victim.hp = Math.max(0, victim.hp - hpDamage);
    victim.lastDamageAt = Date.now();
    victim.lastRegenTickAt = 0;

    if (attacker && attacker.token !== victim.token) {
      attacker.damageDealt += hpDamage;
    }

    this.io.to(this.room.code).emit("player:hit", {
      victimId: victim.id,
      damage: hpDamage,
      newHP: victim.hp,
      attackerId: attacker ? attacker.id : null,
      gunId,
      x: hitPoint?.x ?? victim.x,
      y: hitPoint?.y ?? victim.y
    });

    if (victim.hp <= 0) {
      this.handleKill(victim, attacker, gunId);
    }
  }

  addKillFeed(entry) {
    this.killFeed.unshift(entry);
    this.killFeed = this.killFeed.slice(0, 5);
  }

  emitAnnouncement(text, type = "neutral") {
    this.io.to(this.room.code).emit("match:announcement", { text, type });
  }

  handleKill(victim, attacker, gunId) {
    victim.alive = false;
    victim.deaths += 1;
    victim.killStreak = 0;
    victim.respawnAvailableAt = Date.now() + this.room.settings.respawnTime * 1000;
    victim.spectating = attacker ? attacker.token : null;

    if (attacker && attacker.token !== victim.token) {
      attacker.kills += 1;
      attacker.killStreak += 1;
      attacker.bestStreak = Math.max(attacker.bestStreak, attacker.killStreak);
      if (this.room.settings.mode === "tdm") {
        this.teamScores[normalizeTeam(attacker.team)] += 1;
      }
      if (!this.firstBlood) {
        this.firstBlood = true;
        this.emitAnnouncement("FIRST BLOOD", "first-blood");
      }
      if (attacker.killStreak === 3) {
        this.emitAnnouncement(`${attacker.name} - KILLING SPREE`, "streak");
      } else if (attacker.killStreak === 5) {
        this.emitAnnouncement(`${attacker.name} - UNSTOPPABLE`, "streak");
      } else if (attacker.killStreak === 7) {
        this.emitAnnouncement(`${attacker.name} - LEGENDARY`, "streak");
      }
    }

    const gun = getGunConfig(gunId);
    const payload = {
      victimId: victim.id,
      killerId: attacker ? attacker.id : null,
      killerName: attacker ? attacker.name : "Environment",
      gunId,
      totalKills: attacker ? attacker.kills : 0
    };

    this.io.to(this.room.code).emit("player:killed", payload);
    this.addKillFeed({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      killerName: attacker ? attacker.name : "Environment",
      victimName: victim.name,
      gunId,
      gunName: gun.name,
      killerId: attacker ? attacker.id : null,
      victimId: victim.id,
      at: Date.now()
    });
  }

  updateDestructible(hit) {
    if (!hit || !hit.target || !this.map.destructibles.length) {
      return;
    }
    const prop = this.map.destructibles.find((item) => item.id === hit.target.id);
    if (!prop || !prop.active) {
      return;
    }
    prop.hp = Math.max(0, prop.hp - 1);
    if (prop.hp <= 0) {
      prop.active = false;
    }
    this.io.to(this.room.code).emit("map:destructible", {
      propId: prop.id,
      newHP: prop.hp
    });
  }

  explodeBullet(bullet, x, y) {
    for (const player of this.players.values()) {
      if (!player.alive || player.spectator) {
        continue;
      }
      if (this.canDamageTarget(bullet.ownerToken, player.token)) {
        const dist = distance(x, y, player.x, player.y);
        if (dist > bullet.splashRadius) {
          continue;
        }
        const falloff = 1 - dist / bullet.splashRadius;
        this.applyDamage(player, Math.max(0, Math.round(bullet.damage * falloff)), bullet.ownerToken, bullet.gunId, { x, y });
      }
    }

    this.io.to(this.room.code).emit("bullet:hit", {
      bulletId: bullet.id,
      x,
      y,
      type: "explosion"
    });
  }

  canDamageTarget(attackerToken, victimToken) {
    if (attackerToken === victimToken) {
      return true;
    }
    if (!TEAM_MODES.has(this.room.settings.mode)) {
      return true;
    }
    const attacker = this.players.get(attackerToken);
    const victim = this.players.get(victimToken);
    if (!attacker || !victim) {
      return true;
    }
    if (this.room.settings.friendlyFire) {
      return true;
    }
    return attacker.team !== victim.team;
  }

  updateBullets(delta) {
    const nextBullets = [];
    const colliders = this.getActiveColliders();

    for (const bullet of this.bullets) {
      const start = { x: bullet.x, y: bullet.y };
      const stepDistance = bullet.speed * delta;
      const end = {
        x: start.x + Math.cos(bullet.angle) * stepDistance,
        y: start.y + Math.sin(bullet.angle) * stepDistance
      };

      let nearestWallHit = null;
      for (const collider of colliders) {
        const hit = rayIntersectAABB(start, end, collider);
        if (!hit) {
          continue;
        }
        if (!nearestWallHit || hit.t < nearestWallHit.t) {
          nearestWallHit = { ...hit, target: collider };
        }
      }

      let nearestPlayerHit = null;
      for (const player of this.players.values()) {
        if (!player.alive || player.spectator || player.token === bullet.ownerToken) {
          continue;
        }
        if (!this.canDamageTarget(bullet.ownerToken, player.token)) {
          continue;
        }
        const hit = segmentIntersectsCircle(start, end, player.x, player.y, player.radius);
        if (!hit) {
          continue;
        }
        if (!nearestPlayerHit || hit.t < nearestPlayerHit.t) {
          nearestPlayerHit = { ...hit, target: player };
        }
      }

      const hitPlayerFirst = nearestPlayerHit && (!nearestWallHit || nearestPlayerHit.t <= nearestWallHit.t);
      const hitWallFirst = nearestWallHit && (!nearestPlayerHit || nearestWallHit.t < nearestPlayerHit.t);

      if (hitPlayerFirst) {
        bullet.x = nearestPlayerHit.x;
        bullet.y = nearestPlayerHit.y;

        if (bullet.explosive) {
          this.explodeBullet(bullet, bullet.x, bullet.y);
        } else {
          this.applyDamage(nearestPlayerHit.target, bullet.damage, bullet.ownerToken, bullet.gunId, {
            x: bullet.x,
            y: bullet.y
          });
          this.io.to(this.room.code).emit("bullet:hit", {
            bulletId: bullet.id,
            x: bullet.x,
            y: bullet.y,
            type: "player"
          });
        }
        continue;
      }

      if (hitWallFirst) {
        bullet.x = nearestWallHit.x;
        bullet.y = nearestWallHit.y;
        this.updateDestructible(nearestWallHit);

        if (bullet.gunId === 8 && bullet.bounces < bullet.maxBounces) {
          bullet.angle = reflectAngle(bullet.angle, nearestWallHit.normal);
          bullet.bounces += 1;
          bullet.remainingRange -= stepDistance * nearestWallHit.t;
          nextBullets.push(bullet);
          this.io.to(this.room.code).emit("bullet:hit", {
            bulletId: bullet.id,
            x: bullet.x,
            y: bullet.y,
            type: "bounce"
          });
          continue;
        }

        if (bullet.explosive) {
          this.explodeBullet(bullet, bullet.x, bullet.y);
        } else {
          this.io.to(this.room.code).emit("bullet:hit", {
            bulletId: bullet.id,
            x: bullet.x,
            y: bullet.y,
            type: "wall"
          });
        }
        continue;
      }

      bullet.x = end.x;
      bullet.y = end.y;
      bullet.remainingRange -= stepDistance;

      if (bullet.remainingRange <= 0) {
        if (bullet.explosive) {
          this.explodeBullet(bullet, bullet.x, bullet.y);
        } else {
          this.io.to(this.room.code).emit("bullet:hit", {
            bulletId: bullet.id,
            x: bullet.x,
            y: bullet.y,
            type: "range"
          });
        }
        continue;
      }

      nextBullets.push(bullet);
    }

    this.bullets = nextBullets;
  }

  applyPickup(player, pickup) {
    switch (pickup.type) {
      case "health":
        player.hp = Math.min(player.maxHp, player.hp + 30);
        break;
      case "armor":
        player.armor = player.maxArmor;
        break;
      case "ammo":
        this.fillAmmo(player);
        break;
      case "speed":
        player.speedBoostUntil = Date.now() + 8000;
        break;
      default:
        break;
    }
  }

  updatePickups() {
    const now = Date.now();
    if (!this.room.settings.allowPickups) {
      for (const pickup of this.pickups) {
        pickup.active = false;
      }
      return;
    }

    for (const pickup of this.pickups) {
      if (!pickup.active && now >= pickup.respawnAt) {
        pickup.active = true;
        this.io.to(this.room.code).emit("pickup:spawned", {
          pickupId: pickup.id,
          x: pickup.x,
          y: pickup.y,
          type: pickup.type
        });
      }

      if (!pickup.active) {
        continue;
      }

      for (const player of this.players.values()) {
        if (!player.alive || player.spectator) {
          continue;
        }
        if (distance(player.x, player.y, pickup.x, pickup.y) <= player.radius + 16) {
          this.applyPickup(player, pickup);
          pickup.active = false;
          pickup.respawnAt = now + PICKUP_RESPAWN[pickup.type];
          this.io.to(this.room.code).emit("pickup:taken", {
            pickupId: pickup.id,
            playerId: player.id,
            type: pickup.type
          });
          break;
        }
      }
    }
  }

  updateHill(delta) {
    if (this.room.settings.mode !== "koth" || this.ended) {
      return;
    }

    const now = Date.now();
    if (now >= this.hill.rotateAt) {
      this.hill.index = (this.hill.index + 1) % this.map.hillPoints.length;
      this.hill.rotateAt = now + 90000;
      this.hill.controller = null;
      this.hill.captureProgress = 0;
      this.hill.pointAccumulator = 0;
    }

    const zone = this.map.hillPoints[this.hill.index];
    const occupants = [];
    for (const player of this.players.values()) {
      if (!player.alive || player.spectator) {
        continue;
      }
      if (distance(player.x, player.y, zone.x, zone.y) <= zone.radius) {
        occupants.push(player);
      }
    }

    if (!occupants.length) {
      return;
    }

    const teams = new Set(occupants.map((player) => normalizeTeam(player.team)));
    if (teams.size > 1) {
      this.hill.pointAccumulator = 0;
      return;
    }

    const contender = normalizeTeam(occupants[0].team);
    if (!this.hill.controller) {
      this.hill.controller = contender;
      this.hill.captureProgress = Math.min(1, this.hill.captureProgress + delta / 5);
    } else if (this.hill.controller === contender) {
      this.hill.captureProgress = Math.min(1, this.hill.captureProgress + delta / 5);
    } else {
      this.hill.captureProgress = Math.max(0, this.hill.captureProgress - delta / 5);
      if (this.hill.captureProgress === 0) {
        this.hill.controller = contender;
      }
    }

    if (this.hill.captureProgress >= 1 && this.hill.controller === contender) {
      this.hill.pointAccumulator += delta;
      while (this.hill.pointAccumulator >= 2) {
        this.hill.pointAccumulator -= 2;
        this.teamScores[contender] += 1;
        for (const occupant of occupants) {
          occupant.kothScore = (occupant.kothScore || 0) + 1;
        }
      }
    }
  }

  updateRegen(player, now) {
    if (!this.room.settings.regenEnabled || !player.alive) {
      return;
    }
    const regenCap = Math.min(70, player.maxHp);
    if (player.hp >= regenCap || player.lastDamageAt <= 0) {
      return;
    }
    const quietTime = now - player.lastDamageAt;
    if (quietTime < 5000) {
      return;
    }
    if (!player.lastRegenTickAt || now - player.lastRegenTickAt >= 1000) {
      player.lastRegenTickAt = now;
      player.hp = Math.min(regenCap, player.hp + Math.max(1, Math.round(player.maxHp * 0.1)));
    }
  }

  updatePlayers(delta) {
    const now = Date.now();
    const colliders = this.getActiveColliders();

    for (const player of this.players.values()) {
      const meta = this.room.players.get(player.token);
      if (meta) {
        player.connected = meta.connected;
        player.color = meta.color;
        player.name = meta.name;
        player.team = TEAM_MODES.has(this.room.settings.mode) ? normalizeTeam(meta.team) : "solo";
      }

      if (player.reloading && now >= player.reloadEndAt) {
        this.finishReload(player);
      }

      if (!player.alive || player.spectator) {
        continue;
      }

      this.updateRegen(player, now);

      const keys = player.input.keys;
      let dirX = 0;
      let dirY = 0;
      if (keys.left) dirX -= 1;
      if (keys.right) dirX += 1;
      if (keys.up) dirY -= 1;
      if (keys.down) dirY += 1;

      if (dirX === 0 && dirY === 0) {
        continue;
      }

      const length = Math.hypot(dirX, dirY) || 1;
      dirX /= length;
      dirY /= length;

      const gun = getGunConfig(player.gunId);
      let speed = BASE_SPEED;
      if (player.speedBoostUntil > now) {
        speed *= 1.5;
      }
      if (gun.heavy && now - player.lastShotAt < 200) {
        speed = HEAVY_FIRING_SPEED;
      }
      if (gun.id === 4 && keys.scoped) {
        speed *= 0.4;
      }

      const moved = moveCircle(
        player.x,
        player.y,
        dirX * speed * delta,
        dirY * speed * delta,
        player.radius,
        colliders,
        { width: this.map.width, height: this.map.height }
      );
      player.x = moved.x;
      player.y = moved.y;
      player.angle = player.input.angle;
    }

    resolvePlayerOverlaps(Array.from(this.players.values()));
  }

  buildLeaderboard() {
    const rows = Array.from(this.players.values())
      .filter((player) => !player.spectator)
      .sort((a, b) => {
        if (this.room.settings.mode === "koth") {
          if (b.kothScore !== a.kothScore) {
            return b.kothScore - a.kothScore;
          }
        }
        if (b.kills !== a.kills) {
          return b.kills - a.kills;
        }
        if (b.damageDealt !== a.damageDealt) {
          return b.damageDealt - a.damageDealt;
        }
        return a.deaths - b.deaths;
      })
      .map((player, index) => ({
        rank: index + 1,
        playerId: player.id,
        name: player.name,
        color: player.color,
        team: player.team,
        kills: player.kills,
        deaths: player.deaths,
        damage: player.damageDealt,
        kd: player.deaths ? (player.kills / player.deaths).toFixed(2) : player.kills.toFixed(2),
        ping: player.ping,
        hillScore: player.kothScore
      }));

    let winner;
    if (this.room.settings.mode === "tdm" || this.room.settings.mode === "koth") {
      winner = this.teamScores.red >= this.teamScores.blue ? "Team Red" : "Team Blue";
    } else {
      winner = rows[0] ? rows[0].name : "No winner";
    }

    return { rows, winner };
  }

  checkEndConditions() {
    if (this.ended) {
      return;
    }

    if (this.remainingTime !== null && this.remainingTime <= 0) {
      this.endMatch("time");
      return;
    }

    const killLimit = this.room.settings.killLimit;
    if (killLimit) {
      if (this.room.settings.mode === "tdm") {
        if (this.teamScores.red >= killLimit || this.teamScores.blue >= killLimit) {
          this.endMatch("kill-limit");
          return;
        }
      } else if (this.room.settings.mode === "koth") {
        if (this.teamScores.red >= 100 || this.teamScores.blue >= 100) {
          this.endMatch("hill-limit");
          return;
        }
      } else {
        const leading = Array.from(this.players.values()).find((player) => player.kills >= killLimit);
        if (leading) {
          this.endMatch("kill-limit");
        }
      }
    }
  }

  endMatch(reason) {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.stop();
    const leaderboard = this.buildLeaderboard();
    this.io.to(this.room.code).emit("game:end", {
      leaderboard: leaderboard.rows,
      winner: leaderboard.winner,
      teamScores: this.teamScores,
      reason
    });
    if (typeof this.hooks.onEnd === "function") {
      this.hooks.onEnd({
        leaderboard: leaderboard.rows,
        winner: leaderboard.winner,
        teamScores: this.teamScores,
        reason
      });
    }
  }

  tick() {
    if (this.ended) {
      return;
    }

    const now = Date.now();
    const delta = Math.min(0.05, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    if (!this.warmupBroadcastDone) {
      const remaining = Math.ceil((this.warmupUntil - now) / 1000);
      if (remaining > 0) {
        if (remaining !== this.lastWarmupSecond) {
          this.lastWarmupSecond = remaining;
          this.io.to(this.room.code).emit("match:countdown", { seconds: remaining });
        }
      } else {
        this.warmupBroadcastDone = true;
        this.io.to(this.room.code).emit("match:countdown", { seconds: 0 });
        this.emitAnnouncement("GO!", "start");
      }
    }

    this.syncRoomPlayers();
    if (this.remainingTime !== null) {
      this.remainingTime = Math.max(0, this.remainingTime - delta * 1000);
    }
    this.updatePlayers(delta);
    this.updateBullets(delta);
    this.updatePickups();
    this.updateHill(delta);
    this.checkEndConditions();
  }
}

module.exports = {
  GameState,
  createMap
};
