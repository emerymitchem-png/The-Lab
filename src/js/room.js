(function () {
  "use strict";

  const ROOM_VERSION = "1.0.26";
  const DEFAULT_ROOM_WIDTH = 960;
  const DEFAULT_ROOM_HEIGHT = 640;
  const DEFAULT_WALL_THICKNESS = 36;
  const DEFAULT_ROOMS_PER_FLOOR = 13;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  function pointInRect(x, y, rect) {
    return (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  function getEntityRect(entity) {
    if (!entity) return { x: 0, y: 0, width: 0, height: 0 };
    if (typeof entity.getRect === "function") {
      return entity.getRect();
    }
    const radius = safeNumber(entity.radius, 12);
    return {
      x: safeNumber(entity.x, 0) - radius,
      y: safeNumber(entity.y, 0) - radius,
      width: radius * 2,
      height: radius * 2
    };
  }

  function rectCenter(rect) {
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2
    };
  }

  function getDifficultyScale(floor) {
    const safeFloor = clamp(safeNumber(floor, 1), 1, 5);
    return 1 + ((safeFloor - 1) * 0.125);
  }

  function safeInt(value, fallback) {
    return Math.round(safeNumber(value, fallback));
  }

  function normalizeRoomTypeName(value) {
    const key = String(value || "normal").toLowerCase();
    if (key === "normal_room" || key === "normal_rooms") return "normal";
    if (key === "secret_room" || key === "secret_rooms") return "secret";
    if (key === "shop_room") return "shop";
    if (key === "boss_room") return "boss";
    if (key === "marked_unlocked_door" || key === "marked_door" || key === "marked") return "marked";
    if (key === "shop_locked_door" || key === "locked_shop") return "shop_locked";
    if (key === "mystery_door" || key === "mystery") return "mystery";
    if (key === "shop_or_mystery_door") return "mystery";
    return key;
  }

  function deterministicPick(seed, probability) {
    const unit = Math.abs(Math.sin(seed * 91.337 + 0.618)) % 1;
    return unit < probability;
  }

  function buildGeneratedRoomPlan(floor, nested, roomsPerFloor) {
    const guaranteed = nested.guaranteed_rooms || nested.guaranteedRooms || {};
    const procedural = nested.procedural_room || nested.proceduralRoom || {};
    const proceduralProbability = procedural.probability || {};

    const plan = new Array(Math.max(1, roomsPerFloor)).fill("normal");
    const lastIndex = plan.length - 1;
    plan[lastIndex] = "boss";

    const specialTypes = [];
    const pushMany = (type, count) => {
      for (let i = 0; i < count; i += 1) {
        specialTypes.push(normalizeRoomTypeName(type));
      }
    };

    pushMany("secret", Math.max(0, safeInt(guaranteed.secret_rooms, 0)));
    pushMany("shop", Math.max(0, safeInt(guaranteed.shop_room, 0)));
    pushMany("marked", Math.max(0, safeInt(guaranteed.marked_unlocked_door, 0)));

    const proceduralCount = Math.max(0, safeInt(procedural.count, 0));
    const mysteryChance = clamp(safeNumber(proceduralProbability.mystery_door, 0.25), 0, 1);
    for (let i = 0; i < proceduralCount; i += 1) {
      const isMystery = deterministicPick(floor * 1000 + i * 13 + roomsPerFloor, mysteryChance);
      specialTypes.push(isMystery ? "mystery" : "shop_locked");
    }

    const available = [];
    for (let i = 0; i < lastIndex; i += 1) {
      available.push(i);
    }

    for (let i = 0; i < specialTypes.length && available.length > 0; i += 1) {
      const pickIndex = Math.abs((floor * 37 + i * 17 + roomsPerFloor * 11) % available.length);
      const slot = available.splice(pickIndex, 1)[0];
      if (slot > 0) {
        plan[slot] = specialTypes[i];
      }
    }

    plan[0] = "normal";
    return plan;
  }

  function getLoader() {
    return window.gameLoader || window.GameLoader || window.loader || null;
  }

  function callLoaderMethod(methodName, ...args) {
    const loader = getLoader();
    if (!loader || typeof loader[methodName] !== "function") {
      return null;
    }

    try {
      const result = loader[methodName](...args);
      if (result && typeof result.then === "function") {
        console.warn(`[Room] ${methodName} returned a Promise. Version 1.0.23 expects preloaded synchronous JSON data.`);
        return null;
      }
      return result;
    } catch (error) {
      console.warn(`[Room] Could not load ${methodName}. Using fallback data.`, error);
      return null;
    }
  }

  function normalizeFloorData(rawFloorData, floor) {
    const data = rawFloorData && typeof rawFloorData === "object" ? rawFloorData : {};
    const floorKey = String(floor);
    const nested = data[floorKey] || data[`floor${floor}`] || data[`floor_${floor}`] || data;

    return {
      floor,
      roomsPerFloor: safeNumber(
        nested.total_rooms ??
        nested.totalRooms ??
        nested.roomsPerFloor ??
        nested.rooms_per_floor ??
        nested.roomCount ??
        nested.room_count,
        DEFAULT_ROOMS_PER_FLOOR
      ),
      width: safeNumber(nested.width ?? nested.roomWidth ?? nested.room_width, DEFAULT_ROOM_WIDTH),
      height: safeNumber(nested.height ?? nested.roomHeight ?? nested.room_height, DEFAULT_ROOM_HEIGHT),
      wallThickness: safeNumber(nested.wallThickness ?? nested.wall_thickness, DEFAULT_WALL_THICKNESS),
      enemyCountMin: safeNumber(nested.enemyCountMin ?? nested.enemy_count_min ?? nested.minEnemies ?? nested.min_enemies, 2),
      enemyCountMax: safeNumber(nested.enemyCountMax ?? nested.enemy_count_max ?? nested.maxEnemies ?? nested.max_enemies, 3),
      spawnRate: safeNumber(nested.spawnRate ?? nested.spawn_rate ?? nested.enemySpawnRate ?? nested.enemy_spawn_rate, 1),
      difficultyScale: safeNumber(nested.difficultyScale ?? nested.difficulty_scale, getDifficultyScale(floor)),
      barriers: nested.barriers && typeof nested.barriers === "object" ? nested.barriers : {},
      rooms: []
    };

    const explicitRooms = Array.isArray(nested.rooms) ? nested.rooms : [];
    const normalizedExplicitRooms = explicitRooms
      .map((entry) => normalizeRoomTypeName(typeof entry === "string" ? entry : entry && entry.type))
      .filter(Boolean);

    const generatedRooms = buildGeneratedRoomPlan(floor, nested, normalized.roomsPerFloor);
    const plannedRooms = normalizedExplicitRooms.length > 0 ? normalizedExplicitRooms : generatedRooms;

    normalized.rooms = plannedRooms.slice(0, normalized.roomsPerFloor);
    while (normalized.rooms.length < normalized.roomsPerFloor) {
      normalized.rooms.push("normal");
    }

    if (normalized.rooms.length > 0) {
      normalized.rooms[normalized.rooms.length - 1] = "boss";
    }

    return normalized;
  }

  function getRoomType(roomNumber, floorData) {
    const index = roomNumber - 1;
    const roomEntry = floorData.rooms[index];
    const explicitType = typeof roomEntry === "string" ? roomEntry : roomEntry && roomEntry.type;

    if (explicitType) {
      return normalizeRoomTypeName(explicitType);
    }

    if (roomNumber === floorData.roomsPerFloor) {
      return "boss";
    }

    const pattern = (floorData.floor * 97 + roomNumber * 53) % 100;
    if (pattern < 80) return "normal";
    if (pattern < 90) return "secret";
    if (pattern < 95) return "shop";
    return "normal";
  }

  function makeFallbackEnemyData(floor) {
    return [
      {
        id: "scattered_note",
        name: "Scattered Note",
        floors: [1, 2],
        health: 20 + floor * 4,
        damage: 5,
        speed: 58,
        color: "#a3e635",
        radius: 15,
        xp: 25,
        gold: 10
      },
      {
        id: "wild_variable",
        name: "Wild Variable",
        floors: [1, 2, 3, 4],
        health: 24 + floor * 5,
        damage: 5,
        speed: 66,
        color: "#facc15",
        radius: 15,
        xp: 25,
        gold: 10
      },
      {
        id: "boss_confusion_cloud",
        name: "Confusion Cloud",
        boss: true,
        floors: [1, 2, 3, 4, 5],
        health: 95 + floor * 22,
        damage: 7,
        speed: 48,
        color: "#fb7185",
        radius: 24,
        xp: 75,
        gold: 40
      }
    ];
  }

  function normalizeEnemyList(rawEnemyData, floor) {
    if (Array.isArray(rawEnemyData)) {
      return rawEnemyData;
    }

    if (rawEnemyData && typeof rawEnemyData === "object") {
      const floorKey = String(floor);
      const candidates = rawEnemyData[floorKey] || rawEnemyData[`floor${floor}`] || rawEnemyData[`floor_${floor}`] || rawEnemyData.enemies || rawEnemyData.types;
      if (Array.isArray(candidates)) {
        return candidates;
      }

      const objectValues = Object.keys(rawEnemyData)
        .filter((key) => typeof rawEnemyData[key] === "object")
        .map((key) => ({ id: key, ...rawEnemyData[key] }));

      if (objectValues.length > 0) {
        return objectValues;
      }
    }

    return makeFallbackEnemyData(floor);
  }

  function enemyAllowedOnFloor(enemyType, floor, roomType) {
    const isBoss = Boolean(enemyType.boss || enemyType.isBoss || enemyType.type === "boss");

    if (roomType === "boss") {
      return isBoss || /boss/i.test(String(enemyType.id || enemyType.name || ""));
    }

    if (isBoss) {
      return false;
    }

    const floors = enemyType.floors || enemyType.floor || enemyType.availableFloors || enemyType.available_floors;
    if (Array.isArray(floors)) {
      return floors.map(Number).includes(Number(floor));
    }

    const minFloor = safeNumber(enemyType.minFloor ?? enemyType.min_floor, 1);
    const maxFloor = safeNumber(enemyType.maxFloor ?? enemyType.max_floor, 5);
    return floor >= minFloor && floor <= maxFloor;
  }

  function chooseEnemyType(enemyTypes, floor, roomType, slot) {
    const allowed = enemyTypes.filter((enemyType) => enemyAllowedOnFloor(enemyType, floor, roomType));
    const pool = allowed.length > 0 ? allowed : enemyTypes;
    if (pool.length === 0) {
      return makeFallbackEnemyData(floor)[0];
    }

    const index = Math.abs((floor * 31 + slot * 17 + roomType.length * 13) % pool.length);
    return pool[index];
  }

  class Room {
    constructor(floor = 1, roomNumber = 1, options = {}) {
      this.version = ROOM_VERSION;
      this.floor = clamp(safeNumber(floor, 1), 1, 5);

      const rawFloorData = options.floorData || callLoaderMethod("getFloorData", this.floor);
      this.floorData = normalizeFloorData(rawFloorData, this.floor);
      this.floorData.roomsPerFloor = clamp(this.floorData.roomsPerFloor, 1, 99);
      this.roomNumber = clamp(safeNumber(roomNumber, 1), 1, this.floorData.roomsPerFloor);
      this.roomIndex = this.roomNumber - 1;

      this.width = safeNumber(options.width, this.floorData.width);
      this.height = safeNumber(options.height, this.floorData.height);
      this.wallThickness = safeNumber(options.wallThickness, this.floorData.wallThickness);
      this.difficultyScale = safeNumber(options.difficultyScale, this.floorData.difficultyScale);

      this.type = normalizeRoomTypeName(options.type || getRoomType(this.roomNumber, this.floorData));
      const isSafeType = this.type === "shop" || this.type === "shop_locked" || this.type === "marked";
      this.cleared = isSafeType;
      this.rewardGiven = false;
      this.started = false;
      this.clearTimer = this.cleared ? 99 : 0;
      this.clearDelay = 0.35;
      this.exitOpen = isSafeType;
      this.exitUsed = false;
      this.feedbackTexts = [];

      this.exitDoor = this.generateExitDoor();
      this.safeZones = this.generateSafeZones();
      this.walls = this.generateWalls();
      this.environmentFeatures = this.generateEnvironmentalFeatures();
      this.roomFeatures = this.generateRoomFeatures();
      this.enemies = [];
      this.spawnEnemies(options.enemyData);
      this.roomFeaturePromptCooldown = 0;

      if (isSafeType) {
        const label = this.type === "marked" ? "MARKED ROOM" : "SHOP";
        this.addFeedback(`${label} - Exit is open`, this.width / 2, this.height / 2 - 80, "#facc15");
      }
    }

    static roomsPerFloor(floor = 1) {
      const safeFloor = clamp(safeNumber(floor, 1), 1, 5);
      const floorData = normalizeFloorData(callLoaderMethod("getFloorData", safeFloor), safeFloor);
      return clamp(safeNumber(floorData.roomsPerFloor, DEFAULT_ROOMS_PER_FLOOR), 1, 99);
    }

    static difficultyScaleForFloor(floor) {
      return getDifficultyScale(floor);
    }

    generateExitDoor() {
      const doorWidth = 92;
      const doorHeight = 54;
      return {
        x: this.width / 2 - doorWidth / 2,
        y: this.wallThickness - 8,
        width: doorWidth,
        height: doorHeight,
        type: "exit",
        open: false
      };
    }

    generateSafeZones() {
      const spawn = this.getPlayerSpawnPoint("bottom");
      const exit = this.exitDoor;
      return [
        {
          x: spawn.x - 86,
          y: spawn.y - 72,
          width: 172,
          height: 122,
          type: "safe_spawn"
        },
        {
          x: exit.x - 26,
          y: 0,
          width: exit.width + 52,
          height: this.wallThickness + 96,
          type: "safe_exit"
        }
      ];
    }

    getPlayerSpawnPoint(entrySide = "bottom") {
      const margin = this.wallThickness + 48;
      const bottomPoint = {
        x: this.width / 2,
        y: this.height - margin
      };

      const points = [
        bottomPoint,
        { x: this.width / 2 - 120, y: this.height - margin },
        { x: this.width / 2 + 120, y: this.height - margin },
        { x: this.width / 2, y: this.height - margin - 90 },
        { x: this.width / 2 - 160, y: this.height - margin - 90 },
        { x: this.width / 2 + 160, y: this.height - margin - 90 }
      ];

      if (entrySide === "top" || entrySide === "exit_door") {
        points.unshift({ x: this.width / 2, y: this.wallThickness + 96 });
      }

      for (const point of points) {
        const testRect = { x: point.x - 18, y: point.y - 18, width: 36, height: 36 };
        if (!this.walls || !this.rectCollidesWithWalls(testRect)) {
          return point;
        }
      }

      return bottomPoint;
    }

    wallOverlapsSafeZone(wall) {
      if (!Array.isArray(this.safeZones)) return false;
      return this.safeZones.some((zone) => rectsOverlap(wall, zone));
    }

    filterUnsafeObstacles(obstacles) {
      return obstacles.filter((obstacle) => !this.wallOverlapsSafeZone(obstacle));
    }

    generateWalls() {
      const t = this.wallThickness;
      const w = this.width;
      const h = this.height;
      const door = this.exitDoor;

      const walls = [
        { x: 0, y: 0, width: door.x, height: t, type: "wall" },
        { x: door.x + door.width, y: 0, width: w - (door.x + door.width), height: t, type: "wall" },
        { x: 0, y: h - t, width: w, height: t, type: "wall" },
        { x: 0, y: 0, width: t, height: h, type: "wall" },
        { x: w - t, y: 0, width: t, height: h, type: "wall" }
      ];

      const layout = this.getLayoutName();

      if (this.type === "shop" || this.type === "shop_locked") {
        walls.push(...this.makeShopObstacles());
      } else if (this.type === "boss") {
        walls.push(...this.makeBossObstacles());
      } else if (this.type === "secret") {
        walls.push(...this.makeSecretObstacles());
      } else if (this.type === "marked") {
        walls.push(...this.makeMarkedObstacles());
      } else if (layout === "cross") {
        walls.push(...this.makeCrossObstacles());
      } else if (layout === "lanes") {
        walls.push(...this.makeLaneObstacles());
      } else if (layout === "islands") {
        walls.push(...this.makeIslandObstacles());
      } else {
        walls.push(...this.makeScatteredObstacles());
      }

      const boundaryWalls = walls.filter((wall) => wall.type === "wall");
      const obstacles = walls.filter((wall) => wall.type !== "wall");
      return boundaryWalls.concat(this.filterUnsafeObstacles(obstacles));
    }

    getLayoutName() {
      const layouts = ["scattered", "cross", "lanes", "islands"];
      const index = Math.abs((this.floor * 11 + this.roomNumber * 7) % layouts.length);
      return layouts[index];
    }

    makeLabBench(x, y, width, height, label) {
      return {
        x,
        y,
        width,
        height,
        type: label || "lab_bench"
      };
    }

    makeScatteredObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.25, h * 0.28, 118, 34, "lab_bench"),
        this.makeLabBench(w * 0.62, h * 0.34, 132, 34, "supply_crate"),
        this.makeLabBench(w * 0.32, h * 0.68, 150, 34, "broken_machine"),
        this.makeLabBench(w * 0.66, h * 0.66, 88, 54, "data_terminal")
      ];
    }

    makeCrossObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.5 - 22, h * 0.23, 44, 118, "vertical_barrier"),
        this.makeLabBench(w * 0.5 - 22, h * 0.58, 44, 118, "vertical_barrier"),
        this.makeLabBench(w * 0.25, h * 0.5 - 18, 142, 36, "horizontal_barrier"),
        this.makeLabBench(w * 0.61, h * 0.5 - 18, 142, 36, "horizontal_barrier")
      ];
    }

    makeLaneObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.24, h * 0.25, 42, h * 0.34, "shelf"),
        this.makeLabBench(w * 0.47, h * 0.41, 42, h * 0.34, "shelf"),
        this.makeLabBench(w * 0.70, h * 0.25, 42, h * 0.34, "shelf")
      ];
    }

    makeIslandObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.28, h * 0.28, 86, 70, "island_table"),
        this.makeLabBench(w * 0.62, h * 0.28, 86, 70, "island_table"),
        this.makeLabBench(w * 0.28, h * 0.62, 86, 70, "island_table"),
        this.makeLabBench(w * 0.62, h * 0.62, 86, 70, "island_table")
      ];
    }

    makeSecretObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.5 - 110, h * 0.5 - 14, 220, 28, "secret_wall"),
        this.makeLabBench(w * 0.5 - 14, h * 0.5 - 110, 28, 220, "secret_wall"),
        this.makeLabBench(w * 0.18, h * 0.24, 74, 52, "hidden_cache"),
        this.makeLabBench(w * 0.74, h * 0.68, 74, 52, "hidden_cache")
      ];
    }

    makeMarkedObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.25, h * 0.35, 92, 44, "marker_totem"),
        this.makeLabBench(w * 0.63, h * 0.35, 92, 44, "marker_totem"),
        this.makeLabBench(w * 0.45, h * 0.58, 96, 62, "reward_altar")
      ];
    }

    getFeatureRect(slot, total, width = 96, height = 76) {
      const margin = this.wallThickness + 80;
      const usableWidth = Math.max(1, this.width - margin * 2);
      const usableHeight = Math.max(1, this.height - margin * 2);
      const angle = ((Math.PI * 2) / Math.max(1, total)) * slot + (this.floor * 0.22);
      const radiusX = usableWidth * 0.34;
      const radiusY = usableHeight * 0.28;
      const cx = clamp(this.width * 0.5 + Math.cos(angle) * radiusX, margin, this.width - margin);
      const cy = clamp(this.height * 0.5 + Math.sin(angle) * radiusY, margin, this.height - margin);
      return {
        x: cx - width / 2,
        y: cy - height / 2,
        width,
        height
      };
    }

    createEnvironmentalFeature(type, slot, total) {
      const featureType = normalizeRoomTypeName(type);
      const rect = this.getFeatureRect(slot, total, 110, 84);
      const map = {
        fire: { color: "#dc2626", label: "FIRE", damagePerSecond: 5, speedMultiplier: 1, pulse: true },
        sealed: { color: "#64748b", label: "SEALED", damagePerSecond: 0, speedMultiplier: 1, pulse: false },
        gaps: { color: "#111827", label: "GAP", damagePerSecond: 7, speedMultiplier: 0.88, pulse: true },
        rock: { color: "#6b7280", label: "ROCK", damagePerSecond: 0, speedMultiplier: 0.92, pulse: false },
        ice: { color: "#38bdf8", label: "ICE", damagePerSecond: 0, speedMultiplier: 0.72, pulse: true },
        water: { color: "#1d4ed8", label: "WATER", damagePerSecond: 1.5, speedMultiplier: 0.82, pulse: true },
        wind: { color: "#93c5fd", label: "WIND", damagePerSecond: 0, speedMultiplier: 0.9, pushX: 22, pushY: 0, pulse: true },
        storm: { color: "#a78bfa", label: "STORM", damagePerSecond: 4, speedMultiplier: 0.8, pulse: true },
        cosmic: { color: "#7c3aed", label: "COSMIC", damagePerSecond: 6, speedMultiplier: 0.86, pulse: true },
        primordial: { color: "#f97316", label: "PRIMORDIAL", damagePerSecond: 5, speedMultiplier: 0.9, pulse: true },
        mixed: { color: "#14b8a6", label: "MIXED", damagePerSecond: 4.5, speedMultiplier: 0.82, pushX: 14, pushY: -8, pulse: true }
      };
      const defaults = map[featureType] || { color: "#475569", label: String(type || "FIELD").toUpperCase(), damagePerSecond: 0, speedMultiplier: 1, pulse: false };
      return {
        kind: "environment",
        type: featureType,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: defaults.color,
        label: defaults.label,
        damagePerSecond: safeNumber(defaults.damagePerSecond, 0),
        speedMultiplier: clamp(safeNumber(defaults.speedMultiplier, 1), 0.4, 1),
        pushX: safeNumber(defaults.pushX, 0),
        pushY: safeNumber(defaults.pushY, 0),
        pulse: Boolean(defaults.pulse),
        tickTimer: 0.25
      };
    }

    generateEnvironmentalFeatures() {
      const barrierCounts = this.floorData.barriers && typeof this.floorData.barriers === "object"
        ? this.floorData.barriers
        : {};

      const weightedTypes = [];
      for (const [barrierType, countValue] of Object.entries(barrierCounts)) {
        if (barrierType === "total") continue;
        const count = clamp(safeInt(countValue, 0), 0, 4);
        for (let i = 0; i < count; i += 1) {
          weightedTypes.push(normalizeRoomTypeName(barrierType));
        }
      }

      if (weightedTypes.length === 0) {
        return [];
      }

      const preferredCount = {
        normal: 1,
        secret: 2,
        mystery: 3,
        marked: 1,
        shop: 1,
        shop_locked: 1,
        boss: 2
      };
      const target = clamp(preferredCount[this.type] || 1, 1, 3);
      const features = [];

      for (let i = 0; i < target; i += 1) {
        const index = Math.abs((this.floor * 41 + this.roomNumber * 13 + i * 29) % weightedTypes.length);
        const barrierType = weightedTypes[index];
        const feature = this.createEnvironmentalFeature(barrierType, i, target);
        features.push(feature);
      }

      return features;
    }

    createRoomFeature(type, options = {}) {
      const rect = options.rect || this.getFeatureRect(options.slot || 0, options.total || 1, options.width || 96, options.height || 68);
      return {
        kind: "room_feature",
        type,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: options.color || "#facc15",
        label: options.label || "FEATURE",
        used: false,
        oneTime: options.oneTime !== false
      };
    }

    generateRoomFeatures() {
      const features = [];
      const add = (type, options) => features.push(this.createRoomFeature(type, options));

      if (this.type === "secret") {
        add("secret_cache", { label: "SECRET CACHE", color: "#a855f7", slot: 0, total: 1, width: 116, height: 72 });
      } else if (this.type === "marked") {
        add("marked_reward", { label: "MARKED ALTAR", color: "#0d9488", slot: 0, total: 1, width: 116, height: 72 });
      } else if (this.type === "shop" || this.type === "shop_locked") {
        add("shop_station", { label: "SUPPLY STATION", color: "#f59e0b", slot: 0, total: 1, width: 132, height: 72 });
      } else if (this.type === "mystery") {
        add("mystery_cache", { label: "UNSTABLE CACHE", color: "#7c3aed", slot: 0, total: 1, width: 128, height: 72 });
      } else if (this.type === "boss") {
        add("boss_console", { label: "CORE CONSOLE", color: "#ef4444", slot: 0, total: 1, width: 120, height: 72 });
      } else {
        add("normal_terminal", { label: "RESEARCH NODE", color: "#3b82f6", slot: 0, total: 1, width: 118, height: 68 });
      }

      return features;
    }

    makeBossObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.18, h * 0.22, 112, 38, "boss_cover"),
        this.makeLabBench(w * 0.70, h * 0.22, 112, 38, "boss_cover"),
        this.makeLabBench(w * 0.18, h * 0.72, 112, 38, "boss_cover"),
        this.makeLabBench(w * 0.70, h * 0.72, 112, 38, "boss_cover"),
        this.makeLabBench(w * 0.5 - 38, h * 0.5 - 38, 76, 76, "reactor_core")
      ];
    }

    makeShopObstacles() {
      const w = this.width;
      const h = this.height;
      return [
        this.makeLabBench(w * 0.5 - 150, h * 0.42, 300, 42, "shop_counter"),
        this.makeLabBench(w * 0.24, h * 0.66, 76, 52, "supply_crate"),
        this.makeLabBench(w * 0.68, h * 0.66, 76, 52, "supply_crate")
      ];
    }

    getEnemyCount() {
      if (this.type === "shop" || this.type === "shop_locked" || this.type === "marked") return 0;
      if (this.type === "boss") return 1;

      const min = Math.max(1, Math.round(this.floorData.enemyCountMin));
      const max = Math.max(min, Math.round(this.floorData.enemyCountMax));
      const floorBonus = Math.floor((this.floor - 1) / 2);
      const roomBonus = this.roomNumber > 8 ? 1 : 0;
      const base = min + ((this.floor * 7 + this.roomNumber * 5) % (max - min + 1));
      const typeBonus = this.type === "secret" ? 1 : this.type === "mystery" ? 2 : 0;
      return clamp(Math.round((base + floorBonus + roomBonus + typeBonus) * this.floorData.spawnRate), 1, 8);
    }

    getSpawnPoint(index, total) {
      const margin = this.wallThickness + 90;
      const usableWidth = this.width - margin * 2;
      const usableHeight = this.height - margin * 2;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        const angle = ((Math.PI * 2) / Math.max(1, total)) * index + (this.floor * 0.4) + attempt * 0.31;
        const ringX = Math.cos(angle) * usableWidth * (0.26 + (attempt % 3) * 0.05);
        const ringY = Math.sin(angle) * usableHeight * (0.26 + (attempt % 4) * 0.04);
        const jitterX = (((this.floor * 19 + this.roomNumber * 11 + index * 23 + attempt * 5) % 41) - 20);
        const jitterY = (((this.floor * 17 + this.roomNumber * 13 + index * 29 + attempt * 7) % 41) - 20);
        const point = {
          x: clamp(this.width * 0.5 + ringX + jitterX, margin, this.width - margin),
          y: clamp(this.height * 0.5 + ringY + jitterY, margin, this.height - margin)
        };

        const testRect = { x: point.x - 22, y: point.y - 22, width: 44, height: 44 };
        const tooCloseToCenter = Math.hypot(point.x - this.width / 2, point.y - this.height / 2) < 105;
        if (!tooCloseToCenter && !this.rectCollidesWithWalls(testRect)) {
          return point;
        }
      }

      return {
        x: clamp(this.width * 0.5 + 180 + index * 28, margin, this.width - margin),
        y: clamp(this.height * 0.5 + 80, margin, this.height - margin)
      };
    }

    rectCollidesWithWalls(rect) {
      return this.walls.some((wall) => rectsOverlap(rect, wall));
    }

    spawnEnemies(enemyDataOverride) {
      this.enemies = [];

      if (!window.Enemy) {
        console.warn("[Room] Enemy class is missing. Make sure src/js/enemy.js loads before src/js/room.js.");
        return;
      }

      const rawEnemyData = enemyDataOverride || callLoaderMethod("getEnemyData", this.floor);
      const enemyTypes = normalizeEnemyList(rawEnemyData, this.floor);
      const count = this.getEnemyCount();

      for (let i = 0; i < count; i += 1) {
        const enemyType = chooseEnemyType(enemyTypes, this.floor, this.type, i);
        const spawn = this.getSpawnPoint(i, count);
        const enemy = new window.Enemy(spawn.x, spawn.y, enemyType, {
          floor: this.floor,
          roomNumber: this.roomNumber,
          roomType: this.type,
          difficultyScale: this.difficultyScale,
          isBoss: this.type === "boss"
        });
        this.enemies.push(enemy);
      }
    }

    update(dt, player) {
      const delta = safeNumber(dt, 0);
      this.started = true;
      this.updateFeedback(delta);
      this.updateEnvironmentalFeatures(delta, player);
      this.updateRoomFeatures(delta, player);

      for (const enemy of this.enemies) {
        if (enemy && typeof enemy.update === "function") {
          enemy.update(delta, player, this.walls);
        }
      }

      this.enemies = this.enemies.filter((enemy) => enemy && !enemy.remove);

      if (!this.cleared && this.getAliveEnemyCount() <= 0) {
        this.setRoomCleared();
      }

      if (this.cleared) {
        this.clearTimer += delta;
        if (!this.exitOpen && this.clearTimer >= this.clearDelay) {
          this.exitOpen = true;
          this.exitDoor.open = true;
          this.addFeedback("EXIT OPEN", this.exitDoor.x + this.exitDoor.width / 2, this.exitDoor.y + 72, "#67e8f9");
        }
      }
    }

    updateFeedback(dt) {
      for (const text of this.feedbackTexts) {
        text.y -= 22 * dt;
        text.life -= dt;
      }
      this.feedbackTexts = this.feedbackTexts.filter((text) => text.life > 0);
    }

    updateRoomFeatures(dt, player) {
      if (!player) return;
      const playerRect = getEntityRect(player);
      this.roomFeaturePromptCooldown = Math.max(0, this.roomFeaturePromptCooldown - safeNumber(dt, 0));

      for (const feature of this.roomFeatures || []) {
        if (!feature || (feature.oneTime && feature.used)) continue;
        if (!rectsOverlap(playerRect, feature)) continue;
        this.activateRoomFeature(feature, player);
      }
    }

    activateRoomFeature(feature, player) {
      if (!feature || (feature.oneTime && feature.used)) return;
      const center = rectCenter(feature);
      let message = "";
      let color = feature.color || "#f8fafc";

      if (feature.type === "secret_cache") {
        const gold = 18 + this.floor * 5;
        const xp = 20 + this.floor * 6;
        if (typeof player.addGold === "function") player.addGold(gold);
        if (typeof player.addXP === "function") player.addXP(xp);
        message = `Secret cache: +${gold}g +${xp}xp`;
      } else if (feature.type === "marked_reward") {
        const heal = 8 + this.floor * 2;
        const recovered = typeof player.heal === "function" ? player.heal(heal) : 0;
        const gold = 10 + this.floor * 4;
        if (typeof player.addGold === "function") player.addGold(gold);
        message = `Marked reward: +${gold}g +${Math.round(recovered)}hp`;
      } else if (feature.type === "shop_station") {
        const heal = 6 + this.floor * 2;
        const recovered = typeof player.heal === "function" ? player.heal(heal) : 0;
        message = recovered > 0 ? `Supply station: +${Math.round(recovered)}hp` : "Supply station: fully stocked";
      } else if (feature.type === "mystery_cache") {
        const gold = 24 + this.floor * 8;
        const xp = 32 + this.floor * 9;
        if (typeof player.takeDamage === "function") {
          player.takeDamage(6 + this.floor, { type: "mystery_cache" });
        }
        if (typeof player.addGold === "function") player.addGold(gold);
        if (typeof player.addXP === "function") player.addXP(xp);
        message = `Mystery cache: +${gold}g +${xp}xp (volatile)`;
        color = "#c084fc";
      } else if (feature.type === "boss_console") {
        const heal = 5 + this.floor;
        const recovered = typeof player.heal === "function" ? player.heal(heal) : 0;
        message = recovered > 0 ? `Core console: stabilized +${Math.round(recovered)}hp` : "Core console: stabilized";
        color = "#fb7185";
      } else if (feature.type === "normal_terminal") {
        const xp = 10 + this.floor * 3;
        if (typeof player.addXP === "function") player.addXP(xp);
        message = `Research node: +${xp}xp`;
      }

      feature.used = feature.oneTime !== false;
      if (message) {
        this.addFeedback(message, center.x, center.y - 22, color);
      }
    }

    updateEnvironmentalFeatures(dt, player) {
      if (!player) return;

      const delta = safeNumber(dt, 0);
      const playerRect = getEntityRect(player);
      const baseSpeed = safeNumber(player.baseSpeed, player.speed);
      let speedMultiplier = 1;

      for (const feature of this.environmentFeatures || []) {
        if (!feature) continue;
        const overlap = rectsOverlap(playerRect, feature);
        if (!overlap) continue;

        speedMultiplier = Math.min(speedMultiplier, clamp(safeNumber(feature.speedMultiplier, 1), 0.4, 1));

        const pushX = safeNumber(feature.pushX, 0);
        const pushY = safeNumber(feature.pushY, 0);
        if (pushX !== 0 || pushY !== 0) {
          player.x += pushX * delta;
          player.y += pushY * delta;
        }

        const dps = Math.max(0, safeNumber(feature.damagePerSecond, 0));
        feature.tickTimer = safeNumber(feature.tickTimer, 0.25) - delta;
        if (dps > 0 && feature.tickTimer <= 0) {
          const damage = Math.max(1, Math.round(dps * 0.4));
          if (typeof player.takeDamage === "function") {
            const dealt = player.takeDamage(damage, { type: `environment_${feature.type}` });
            if (dealt > 0) {
              const center = rectCenter(feature);
              this.addFeedback(`-${dealt} ${feature.label}`, center.x, center.y - 18, "#fca5a5");
            }
          }
          feature.tickTimer = 0.4;
        } else if (feature.tickTimer <= 0) {
          feature.tickTimer = 0.4;
        }
      }

      player.speed = baseSpeed * speedMultiplier;
      player.moveSpeed = player.speed;
    }

    getAliveEnemyCount() {
      return this.enemies.filter((enemy) => enemy && !enemy.dead && !enemy.remove).length;
    }

    setRoomCleared() {
      if (this.cleared) return;
      this.cleared = true;
      this.clearTimer = 0;
      this.addFeedback("ROOM CLEAR", this.width / 2, this.height / 2 - 120, "#22c55e");
    }

    isReadyForAdvance() {
      return this.exitOpen;
    }

    getExitRect() {
      return {
        x: this.exitDoor.x,
        y: 0,
        width: this.exitDoor.width,
        height: this.wallThickness + 42
      };
    }

    playerTouchesExit(player) {
      if (!this.exitOpen || !player || this.exitUsed) {
        return false;
      }

      const playerRect = typeof player.getRect === "function"
        ? player.getRect()
        : { x: player.x - 12, y: player.y - 12, width: 24, height: 24 };

      return rectsOverlap(playerRect, this.getExitRect());
    }

    markExitUsed() {
      this.exitUsed = true;
    }

    addFeedback(text, x, y, color = "#ffffff") {
      this.feedbackTexts.push({
        text,
        x: safeNumber(x, this.width / 2),
        y: safeNumber(y, this.height / 2),
        color,
        life: 1.15
      });
    }

    draw(ctx, camera = { x: 0, y: 0 }) {
      if (!ctx) return;

      this.drawFloor(ctx, camera);
      this.drawEnvironmentalFeatures(ctx, camera);
      this.drawExit(ctx, camera);
      this.drawWalls(ctx, camera);
      this.drawRoomFeatures(ctx, camera);

      for (const enemy of this.enemies) {
        if (enemy && typeof enemy.draw === "function") {
          enemy.draw(ctx, camera);
        }
      }

      this.drawFeedback(ctx, camera);
    }

    drawFloor(ctx, camera) {
      const x = -safeNumber(camera.x, 0);
      const y = -safeNumber(camera.y, 0);

      const floorColors = {
        normal: "#152033",
        secret: "#1e1b4b",
        shop: "#1f2933",
        shop_locked: "#3f1d1d",
        marked: "#052e2b",
        mystery: "#3b0764",
        boss: "#2a1620"
      };

      ctx.save();
      ctx.fillStyle = floorColors[this.type] || floorColors.normal;
      ctx.fillRect(x, y, this.width, this.height);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let gx = this.wallThickness; gx < this.width - this.wallThickness; gx += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x + gx, y + this.wallThickness);
        ctx.lineTo(x + gx, y + this.height - this.wallThickness);
        ctx.stroke();
      }
      for (let gy = this.wallThickness; gy < this.height - this.wallThickness; gy += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x + this.wallThickness, y + gy);
        ctx.lineTo(x + this.width - this.wallThickness, y + gy);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.font = "bold 18px monospace";
      ctx.fillText(`${this.type.toUpperCase()} ROOM`, x + this.width - 190, y + this.height - 24);
      ctx.restore();
    }

    drawExit(ctx, camera) {
      const door = this.exitDoor;
      const x = door.x - safeNumber(camera.x, 0);
      const y = door.y - safeNumber(camera.y, 0);

      ctx.save();
      ctx.fillStyle = this.exitOpen ? "#164e63" : "#312e81";
      ctx.strokeStyle = this.exitOpen ? "#67e8f9" : "#818cf8";
      ctx.lineWidth = 3;
      ctx.fillRect(x, y, door.width, door.height);
      ctx.strokeRect(x, y, door.width, door.height);

      ctx.fillStyle = this.exitOpen ? "#a5f3fc" : "#c4b5fd";
      ctx.font = "bold 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(this.exitOpen ? "EXIT" : "LOCKED", x + door.width / 2, y + door.height / 2 + 5);

      if (this.exitOpen) {
        ctx.globalAlpha = 0.22 + Math.sin(performance.now() / 140) * 0.08;
        ctx.fillStyle = "#67e8f9";
        ctx.fillRect(x + 8, y + door.height - 8, door.width - 16, 26);
      }

      ctx.restore();
    }

    drawEnvironmentalFeatures(ctx, camera) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 11px monospace";

      for (const feature of this.environmentFeatures || []) {
        if (!feature) continue;
        const x = feature.x - safeNumber(camera.x, 0);
        const y = feature.y - safeNumber(camera.y, 0);
        const alphaPulse = feature.pulse ? (0.16 + Math.sin(performance.now() / 170) * 0.08) : 0.18;

        ctx.fillStyle = feature.color;
        ctx.globalAlpha = clamp(alphaPulse, 0.08, 0.3);
        ctx.fillRect(x, y, feature.width, feature.height);

        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = feature.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, feature.width - 2, feature.height - 2);

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(feature.label, x + feature.width / 2, y + feature.height / 2 + 4);
      }

      ctx.restore();
    }

    drawWalls(ctx, camera) {
      ctx.save();

      for (const wall of this.walls) {
        const x = wall.x - safeNumber(camera.x, 0);
        const y = wall.y - safeNumber(camera.y, 0);

        if (wall.type === "wall") {
          ctx.fillStyle = "#334155";
          ctx.strokeStyle = "#0f172a";
        } else if (wall.type === "reactor_core") {
          ctx.fillStyle = "#7f1d1d";
          ctx.strokeStyle = "#fecaca";
        } else if (wall.type === "shop_counter") {
          ctx.fillStyle = "#92400e";
          ctx.strokeStyle = "#fbbf24";
        } else if (wall.type === "hidden_cache") {
          ctx.fillStyle = "#581c87";
          ctx.strokeStyle = "#d8b4fe";
        } else {
          ctx.fillStyle = "#475569";
          ctx.strokeStyle = "#94a3b8";
        }

        ctx.fillRect(x, y, wall.width, wall.height);
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, wall.width - 2, wall.height - 2);

        if (wall.type !== "wall") {
          ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
          ctx.fillRect(x + 5, y + 5, Math.max(0, wall.width - 10), 5);
        }
      }

      ctx.restore();
    }

    drawRoomFeatures(ctx, camera) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 12px monospace";

      for (const feature of this.roomFeatures || []) {
        if (!feature || (feature.oneTime && feature.used)) continue;
        const x = feature.x - safeNumber(camera.x, 0);
        const y = feature.y - safeNumber(camera.y, 0);

        ctx.fillStyle = feature.color;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(x, y, feature.width, feature.height);

        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = feature.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, feature.width - 2, feature.height - 2);

        ctx.fillStyle = "#f8fafc";
        ctx.fillText(feature.label, x + feature.width / 2, y + feature.height / 2 + 4);
      }

      ctx.restore();
    }

    drawFeedback(ctx, camera) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 16px monospace";

      for (const text of this.feedbackTexts) {
        ctx.globalAlpha = clamp(text.life / 1.15, 0, 1);
        ctx.fillStyle = text.color;
        ctx.fillText(text.text, text.x - safeNumber(camera.x, 0), text.y - safeNumber(camera.y, 0));
      }

      ctx.restore();
    }
  }

  Room.VERSION = ROOM_VERSION;
  Room.ROOMS_PER_FLOOR = DEFAULT_ROOMS_PER_FLOOR;
  window.Room = Room;
})();