/**
 * The Lab - Room System
 * Version: 1.0.21
 *
 * File: src/js/room.js
 * Replacement: Replace the whole file
 * Purpose:
 * - Generate procedural rooms for floors 1-5
 * - Spawn enemies from docs/enemies.json through gameLoader when available
 * - Track room clear state, enemy count, and reward state
 * - Draw room floor, walls, enemies, and feedback text
 *
 * TESTING CHECKLIST:
 * □ Start game, enter floor 1 room 1
 * □ 2-3 enemies should appear
 * □ Move toward enemies (no collision should stop you)
 * □ Shoot enemies (damage text appears)
 * □ Enemies die and drop loot (gold/xp text appears)
 * □ Room clears, advance to room 2
 * □ After 13 rooms, advance to floor 2
 * □ Enemies are tougher on floor 2
 * □ Reaching floor 5, defeat final boss = victory screen
 * □ HP can reach 0 = game over screen
 */

(function () {
  "use strict";

  const ROOM_VERSION = "1.0.21";
  const DEFAULT_ROOM_WIDTH = 960;
  const DEFAULT_ROOM_HEIGHT = 640;
  const DEFAULT_WALL_THICKNESS = 36;
  const ROOMS_PER_FLOOR = 13;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getDifficultyScale(floor) {
    const safeFloor = clamp(safeNumber(floor, 1), 1, 5);
    return 1 + ((safeFloor - 1) * 0.125);
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
        console.warn(`[Room] ${methodName} returned a Promise. Version 1.0.21 expects preloaded synchronous JSON data.`);
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
      roomsPerFloor: safeNumber(nested.roomsPerFloor ?? nested.rooms_per_floor ?? nested.roomCount ?? nested.room_count, ROOMS_PER_FLOOR),
      width: safeNumber(nested.width ?? nested.roomWidth ?? nested.room_width, DEFAULT_ROOM_WIDTH),
      height: safeNumber(nested.height ?? nested.roomHeight ?? nested.room_height, DEFAULT_ROOM_HEIGHT),
      wallThickness: safeNumber(nested.wallThickness ?? nested.wall_thickness, DEFAULT_WALL_THICKNESS),
      enemyCountMin: safeNumber(nested.enemyCountMin ?? nested.enemy_count_min ?? nested.minEnemies ?? nested.min_enemies, 2),
      enemyCountMax: safeNumber(nested.enemyCountMax ?? nested.enemy_count_max ?? nested.maxEnemies ?? nested.max_enemies, 3),
      spawnRate: safeNumber(nested.spawnRate ?? nested.spawn_rate ?? nested.enemySpawnRate ?? nested.enemy_spawn_rate, 1),
      difficultyScale: safeNumber(nested.difficultyScale ?? nested.difficulty_scale, getDifficultyScale(floor)),
      rooms: Array.isArray(nested.rooms) ? nested.rooms : []
    };
  }

  function getRoomType(roomNumber, floorData) {
    const index = roomNumber - 1;
    const roomEntry = floorData.rooms[index];
    const explicitType = typeof roomEntry === "string" ? roomEntry : roomEntry && roomEntry.type;

    if (explicitType) {
      return String(explicitType).toLowerCase();
    }

    if (roomNumber === floorData.roomsPerFloor) {
      return "boss";
    }

    const pattern = (floorData.floor * 97 + roomNumber * 53) % 100;
    if (pattern < 80) return "normal";
    if (pattern < 90) return "secret";
    if (pattern < 95) return "shop";
    return "boss";
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
      this.roomNumber = clamp(safeNumber(roomNumber, 1), 1, ROOMS_PER_FLOOR);
      this.roomIndex = this.roomNumber - 1;

      const rawFloorData = options.floorData || callLoaderMethod("getFloorData", this.floor);
      this.floorData = normalizeFloorData(rawFloorData, this.floor);
      this.floorData.roomsPerFloor = clamp(this.floorData.roomsPerFloor, 1, 99);

      this.width = safeNumber(options.width, this.floorData.width);
      this.height = safeNumber(options.height, this.floorData.height);
      this.wallThickness = safeNumber(options.wallThickness, this.floorData.wallThickness);
      this.difficultyScale = safeNumber(options.difficultyScale, this.floorData.difficultyScale);

      this.type = String(options.type || getRoomType(this.roomNumber, this.floorData)).toLowerCase();
      this.cleared = false;
      this.rewardGiven = false;
      this.started = false;
      this.clearTimer = 0;
      this.clearDelay = 1;
      this.feedbackTexts = [];

      this.walls = this.generateWalls();
      this.enemies = [];
      this.spawnEnemies(options.enemyData);
    }

    static roomsPerFloor() {
      return ROOMS_PER_FLOOR;
    }

    static difficultyScaleForFloor(floor) {
      return getDifficultyScale(floor);
    }

    generateWalls() {
      const t = this.wallThickness;
      const w = this.width;
      const h = this.height;
      const walls = [
        { x: 0, y: 0, width: w, height: t, type: "wall" },
        { x: 0, y: h - t, width: w, height: t, type: "wall" },
        { x: 0, y: 0, width: t, height: h, type: "wall" },
        { x: w - t, y: 0, width: t, height: h, type: "wall" }
      ];

      if (this.type === "secret") {
        walls.push({ x: w * 0.5 - 85, y: h * 0.5 - 12, width: 170, height: 24, type: "low_wall" });
      }

      if (this.type === "normal" && this.roomNumber % 3 === 0) {
        walls.push({ x: w * 0.5 - 18, y: h * 0.24, width: 36, height: h * 0.34, type: "lab_table" });
      }

      return walls;
    }

    getEnemyCount() {
      if (this.type === "shop") return 0;
      if (this.type === "boss") return 1;

      const min = Math.max(1, Math.round(this.floorData.enemyCountMin));
      const max = Math.max(min, Math.round(this.floorData.enemyCountMax));
      const floorBonus = Math.floor((this.floor - 1) / 2);
      const roomBonus = this.roomNumber > 8 ? 1 : 0;
      const base = min + ((this.floor * 7 + this.roomNumber * 5) % (max - min + 1));
      const typeBonus = this.type === "secret" ? 1 : 0;
      return clamp(Math.round((base + floorBonus + roomBonus + typeBonus) * this.floorData.spawnRate), 1, 8);
    }

    getSpawnPoint(index, total) {
      const margin = this.wallThickness + 70;
      const usableWidth = this.width - margin * 2;
      const usableHeight = this.height - margin * 2;

      const angle = ((Math.PI * 2) / Math.max(1, total)) * index + (this.floor * 0.4);
      const ringX = Math.cos(angle) * usableWidth * 0.32;
      const ringY = Math.sin(angle) * usableHeight * 0.32;
      const jitterX = (((this.floor * 19 + this.roomNumber * 11 + index * 23) % 41) - 20);
      const jitterY = (((this.floor * 17 + this.roomNumber * 13 + index * 29) % 41) - 20);

      return {
        x: clamp(this.width * 0.5 + ringX + jitterX, margin, this.width - margin),
        y: clamp(this.height * 0.5 + ringY + jitterY, margin, this.height - margin)
      };
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

      for (const enemy of this.enemies) {
        if (!enemy.dead && !enemy.remove && typeof enemy.update === "function") {
          enemy.update(delta, player, this.walls);
        }
      }

      this.enemies = this.enemies.filter((enemy) => !enemy.remove);
      this.updateFeedback(delta);

      if (!this.cleared && this.getAliveEnemyCount() <= 0) {
        this.setRoomCleared();
      }

      if (this.cleared) {
        this.clearTimer += delta;
      }
    }

    updateFeedback(dt) {
      for (const text of this.feedbackTexts) {
        text.y -= 22 * dt;
        text.life -= dt;
      }
      this.feedbackTexts = this.feedbackTexts.filter((text) => text.life > 0);
    }

    addFeedback(text, x, y, color) {
      this.feedbackTexts.push({
        text: String(text),
        x: safeNumber(x, this.width / 2),
        y: safeNumber(y, this.height / 2),
        color: color || "#ffffff",
        life: 1
      });
    }

    getAliveEnemyCount() {
      return this.enemies.filter((enemy) => !enemy.dead && !enemy.remove).length;
    }

    setRoomCleared() {
      this.cleared = true;
      this.clearTimer = 0;
      this.addFeedback("ROOM CLEAR", this.width / 2, this.height / 2 - 48, "#facc15");
    }

    isReadyForAdvance() {
      return this.cleared && this.clearTimer >= this.clearDelay;
    }

    draw(ctx, camera = { x: 0, y: 0 }) {
      if (!ctx) return;

      ctx.save();
      ctx.translate(-safeNumber(camera.x, 0), -safeNumber(camera.y, 0));

      this.drawFloor(ctx);
      this.drawWalls(ctx);

      for (const enemy of this.enemies) {
        if (enemy && typeof enemy.draw === "function") {
          enemy.draw(ctx, camera);
        }
      }

      this.drawFeedback(ctx);
      ctx.restore();
    }

    drawFloor(ctx) {
      ctx.fillStyle = this.type === "boss" ? "#25111a" : this.type === "secret" ? "#14213d" : this.type === "shop" ? "#1c2b1b" : "#162033";
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      const grid = 40;
      for (let x = 0; x <= this.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = 0; y <= this.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.font = "16px monospace";
      ctx.fillText(`Floor ${this.floor} / Room ${this.roomNumber} - ${this.type.toUpperCase()}`, this.wallThickness + 12, this.wallThickness + 24);
    }

    drawWalls(ctx) {
      for (const wall of this.walls) {
        ctx.fillStyle = wall.type === "lab_table" ? "#334155" : wall.type === "low_wall" ? "#475569" : "#0f172a";
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 2;
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
      }
    }

    drawFeedback(ctx) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 18px monospace";
      for (const text of this.feedbackTexts) {
        ctx.globalAlpha = clamp(text.life, 0, 1);
        ctx.fillStyle = text.color;
        ctx.fillText(text.text, text.x, text.y);
      }
      ctx.restore();
    }
  }

  Room.VERSION = ROOM_VERSION;
  Room.ROOMS_PER_FLOOR = ROOMS_PER_FLOOR;
  window.Room = Room;
})();