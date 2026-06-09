/**
 * The Lab - Room System
 * Version: 1.0.23
 *
 * File: src/js/room.js
 * Replacement: Replace the whole file
 * Purpose:
 * - Generate procedural rooms for floors 1-5
 * - Add visible room barriers/obstacles that affect player, enemies, and projectiles
 * - Spawn enemies from docs/enemies.json through gameLoader when available
 * - Track room clear state, exit door state, enemy count, and reward state
 * - Draw room floor, walls, obstacles, exit door, enemies, and feedback text
 *
 * TESTING CHECKLIST:
 * □ Start game, enter floor 1 room 1
 * □ Room has outside walls and visible interior barriers
 * □ Player cannot walk through barriers
 * □ Enemies path around or slide along barriers
 * □ Projectiles hit barriers and despawn
 * □ 2-3 enemies should appear in normal rooms
 * □ Room clears when all enemies die
 * □ Exit door appears after room clear
 * □ Walking into exit advances to the next room
 * □ Shop rooms have no enemies and show an open exit
 * □ Boss room has a larger arena layout
 */

(function () {
  "use strict";

  const ROOM_VERSION = "1.0.23";
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

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
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
      this.cleared = this.type === "shop";
      this.rewardGiven = false;
      this.started = false;
      this.clearTimer = this.cleared ? 99 : 0;
      this.clearDelay = 0.35;
      this.exitOpen = this.type === "shop";
      this.exitUsed = false;
      this.feedbackTexts = [];

      this.exitDoor = this.generateExitDoor();
      this.walls = this.generateWalls();
      this.enemies = [];
      this.spawnEnemies(options.enemyData);

      if (this.type === "shop") {
        this.addFeedback("SHOP - Exit is open", this.width / 2, this.height / 2 - 80, "#facc15");
      }
    }

    static roomsPerFloor() {
      return ROOMS_PER_FLOOR;
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

      if (this.type === "shop") {
        walls.push(...this.makeShopObstacles());
      } else if (this.type === "boss") {
        walls.push(...this.makeBossObstacles());
      } else if (this.type === "secret") {
        walls.push(...this.makeSecretObstacles());
      } else if (layout === "cross") {
        walls.push(...this.makeCrossObstacles());
      } else if (layout === "lanes") {
        walls.push(...this.makeLaneObstacles());
      } else if (layout === "islands") {
        walls.push(...this.makeIslandObstacles());
      } else {
        walls.push(...this.makeScatteredObstacles());
      }

      return walls;
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
      this.drawExit(ctx, camera);
      this.drawWalls(ctx, camera);

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
  Room.ROOMS_PER_FLOOR = ROOMS_PER_FLOOR;
  window.Room = Room;
})();
