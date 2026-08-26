(function () {
  "use strict";

  const GAME_VERSION = "1.0.25";
  const MAX_FLOOR = 5;
  const DEFAULT_ROOMS_PER_FLOOR = 13;
  const FIXED_MAX_DT = 1 / 20;

  function safeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getCanvas() {
    let canvas = document.getElementById("gameCanvas") || document.getElementById("canvas") || document.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "gameCanvas";
      document.body.appendChild(canvas);
    }
    canvas.width = safeNumber(canvas.width, 960) || 960;
    canvas.height = safeNumber(canvas.height, 640) || 640;
    canvas.style.imageRendering = "pixelated";
    canvas.style.background = "#0f172a";
    canvas.tabIndex = 0;
    return canvas;
  }

  class LabGame {
    constructor(options = {}) {
      this.version = GAME_VERSION;
      this.canvas = options.canvas || getCanvas();
      this.ctx = this.canvas.getContext("2d");

      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this.camera = { x: 0, y: 0 };

      this.floor = 1;
      this.roomNumber = 1;
      this.state = "playing";
      this.lastTime = 0;
      this.running = false;
      this.message = "";
      this.messageTimer = 0;
      this.exitCooldown = 0;

      this.player = null;
      this.room = null;
      this.keys = {};
      this.floorProgress = {};

      this.bindGlobalInput();
      this.reset();
    }

    bindGlobalInput() {
      if (this._globalInputBound) return;
      this._globalInputBound = true;

      window.addEventListener("keydown", (event) => {
        this.keys[event.code] = true;

        if (event.code === "KeyH") {
          this.damageTest();
        }

        if (this.state !== "playing" && event.code === "Enter") {
          this.reset();
        }
      });

      window.addEventListener("keyup", (event) => {
        this.keys[event.code] = false;
      });

      window.addEventListener("lab:enemyDefeated", (event) => {
        const detail = event.detail || {};
        if (detail.enemy && this.room && typeof this.room.addFeedback === "function") {
          this.room.addFeedback(`+${detail.gold || 10} gold  +${detail.xp || 25} xp`, detail.enemy.x, detail.enemy.y - 34, "#facc15");
        }
      });
    }

    reset() {
      if (!window.Player) {
        throw new Error("Player class is missing. Make sure src/js/player.js loads before src/js/game.js.");
      }
      if (!window.Room) {
        throw new Error("Room class is missing. Make sure src/js/room.js loads before src/js/game.js.");
      }

      this.floor = 1;
      this.roomNumber = 1;
      this.state = "playing";
      this.message = "";
      this.messageTimer = 0;
      this.exitCooldown = 0;
      this.floorProgress = {};

      this.player = new window.Player(this.width / 2, this.height / 2, {
        canvas: this.canvas,
        inputTarget: window,
        maxHealth: 100,
        health: 100,
        damage: 10,
        speed: 185
      });

      this.loadRoom(this.floor, this.roomNumber, "start");
      this.canvas.focus();
    }

    getFloorKey(floor = this.floor) {
      return `floor_${floor}`;
    }

    ensureFloorProgress(floor = this.floor) {
      const key = this.getFloorKey(floor);
      if (!this.floorProgress[key]) {
        this.floorProgress[key] = {
          roomsPerFloor: this.getFloorRoomCount(floor),
          roomTypes: {},
          clearedRooms: {},
          visitedRooms: {}
        };
      }
      return this.floorProgress[key];
    }

    getFloorRoomCount(floor = this.floor) {
      if (!window.Room || typeof window.Room.roomsPerFloor !== "function") {
        return DEFAULT_ROOMS_PER_FLOOR;
      }
      return clamp(safeNumber(window.Room.roomsPerFloor(floor), DEFAULT_ROOMS_PER_FLOOR), 1, 99);
    }

    getCurrentFloorRoomCount() {
      const progress = this.ensureFloorProgress(this.floor);
      return clamp(safeNumber(progress.roomsPerFloor, this.getFloorRoomCount(this.floor)), 1, 99);
    }

    syncFloorProgressFromRoom(room) {
      if (!room) return;
      const progress = this.ensureFloorProgress(this.floor);
      const roomTypes = Array.isArray(room.floorData?.rooms) ? room.floorData.rooms : [];
      progress.roomsPerFloor = clamp(safeNumber(room.floorData?.roomsPerFloor, progress.roomsPerFloor), 1, 99);
      progress.roomTypes = progress.roomTypes || {};
      for (let index = 0; index < roomTypes.length; index += 1) {
        progress.roomTypes[index + 1] = String(roomTypes[index] || "normal").toLowerCase();
      }
      progress.roomTypes[this.roomNumber] = room.type || progress.roomTypes[this.roomNumber] || "normal";
    }

    loadRoom(floor, roomNumber, entrySide = "bottom") {
      this.floor = clamp(safeNumber(floor, 1), 1, MAX_FLOOR);
      const floorRooms = this.getFloorRoomCount(this.floor);
      this.roomNumber = clamp(safeNumber(roomNumber, 1), 1, floorRooms);
      this.room = new window.Room(this.floor, this.roomNumber, {
        width: this.width,
        height: this.height,
        difficultyScale: this.getDifficultyScale(this.floor)
      });

      const progress = this.ensureFloorProgress(this.floor);
      this.syncFloorProgressFromRoom(this.room);
      progress.visitedRooms[this.roomNumber] = true;

      this.message = `Floor ${this.floor} - Room ${this.roomNumber}`;
      this.messageTimer = 1.1;
      this.exitCooldown = 0.25;

      if (this.player) {
        this.placePlayerForRoomEntry(entrySide);
        this.player.projectiles = [];
        this.player.setAim(this.player.x + 1, this.player.y);
      }
    }

    placePlayerForRoomEntry(entrySide) {
      const margin = this.room ? this.room.wallThickness + 48 : 84;

      if (this.room && typeof this.room.getPlayerSpawnPoint === "function") {
        const spawn = this.room.getPlayerSpawnPoint(entrySide === "exit" ? "bottom" : entrySide);
        this.player.x = spawn.x;
        this.player.y = spawn.y;
        return;
      }

      this.player.x = this.width / 2;
      this.player.y = this.height - margin;
    }

    getDifficultyScale(floor) {
      const safeFloor = clamp(safeNumber(floor, 1), 1, MAX_FLOOR);
      return 1 + ((safeFloor - 1) * 0.125);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame((time) => this.loop(time));
    }

    loop(time) {
      if (!this.running) return;

      const rawDt = (time - this.lastTime) / 1000;
      const dt = Math.min(FIXED_MAX_DT, Math.max(0, rawDt));
      this.lastTime = time;

      this.update(dt);
      this.draw();
      requestAnimationFrame((nextTime) => this.loop(nextTime));
    }

    update(dt) {
      if (this.messageTimer > 0) {
        this.messageTimer -= dt;
      }
      if (this.exitCooldown > 0) {
        this.exitCooldown -= dt;
      }

      if (this.state !== "playing") {
        return;
      }

      if (!this.player || !this.room) {
        return;
      }

      this.room.update(dt, this.player);

      this.player.update(dt, {
        room: this.room,
        enemies: this.room.enemies,
        walls: this.room.walls,
        floor: this.floor,
        roomNumber: this.roomNumber
      });

      if (this.player.dead || this.player.isDead || this.player.health <= 0) {
        this.state = "gameOver";
        return;
      }

      if (!this.room.cleared && typeof this.room.getAliveEnemyCount === "function" && this.room.getAliveEnemyCount() <= 0) {
        this.room.setRoomCleared();
      }

      if (this.room.cleared) {
        const progress = this.ensureFloorProgress(this.floor);
        progress.clearedRooms[this.roomNumber] = true;
      }

      if (this.room.playerTouchesExit(this.player) && this.exitCooldown <= 0) {
        this.room.markExitUsed();
        this.advanceRoomOrFloor();
      }
    }

    advanceRoomOrFloor() {
      const roomsThisFloor = this.getCurrentFloorRoomCount();
      if (this.floor === MAX_FLOOR && this.roomNumber === roomsThisFloor) {
        this.state = "victory";
        return;
      }

      if (this.roomNumber >= roomsThisFloor) {
        this.floor += 1;
        this.roomNumber = 1;
      } else {
        this.roomNumber += 1;
      }

      this.loadRoom(this.floor, this.roomNumber, "exit");
    }

    damageTest() {
      if (!this.player || this.state !== "playing") return;
      const dealt = this.player.takeDamage(10, { type: "debug_h_key" });
      this.message = dealt > 0 ? `H test: -${dealt} HP` : "H test blocked by invulnerability";
      this.messageTimer = 0.8;
    }

    draw() {
      if (!this.ctx) return;

      this.ctx.clearRect(0, 0, this.width, this.height);

      if (this.room) {
        this.room.draw(this.ctx, this.camera);
      } else {
        this.ctx.fillStyle = "#0f172a";
        this.ctx.fillRect(0, 0, this.width, this.height);
      }

      if (this.player) {
        this.player.draw(this.ctx, this.camera);
      }

      this.drawHUD();
      this.drawFloorMap();

      if (this.state === "gameOver") {
        this.drawEndScreen("GAME OVER", "Press Enter to restart", "#ef4444");
      } else if (this.state === "victory") {
        this.drawEndScreen("VICTORY!", "Floor 5 boss defeated. Press Enter to restart.", "#facc15");
      }
    }

    drawHUD() {
      const ctx = this.ctx;
      const player = this.player || {};
      const enemyCount = this.room ? this.room.getAliveEnemyCount() : 0;
      const projectileCount = player.projectiles ? player.projectiles.length : 0;
      const roomType = this.room ? this.room.type : "normal";
      const exitText = this.room && this.room.exitOpen ? "OPEN" : "LOCKED";
      const roomsThisFloor = this.getCurrentFloorRoomCount();

      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
      ctx.fillRect(12, 12, 392, 140);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, 392, 140);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px monospace";
      ctx.fillText(`The Lab v${GAME_VERSION}`, 28, 36);
      ctx.font = "14px monospace";
      ctx.fillText(`HP: ${Math.ceil(player.health ?? 0)} / ${Math.ceil(player.maxHealth ?? 100)}`, 28, 60);
      ctx.fillText(`Gold: ${Math.floor(player.gold ?? 0)}    XP: ${Math.floor(player.xp ?? 0)}`, 28, 80);
      ctx.fillText(`Floor: ${this.floor}    Room: ${this.roomNumber}/${roomsThisFloor}`, 28, 100);
      ctx.fillText(`Type: ${roomType.toUpperCase()}    Exit: ${exitText}`, 28, 120);
      ctx.fillText(`Enemies: ${enemyCount}    Projectiles: ${projectileCount}`, 28, 140);

      if (this.messageTimer > 0 && this.message) {
        ctx.textAlign = "center";
        ctx.font = "bold 22px monospace";
        ctx.fillStyle = "#facc15";
        ctx.fillText(this.message, this.width / 2, 82);
      }

      ctx.restore();
    }

    drawFloorMap() {
      if (this.floor >= 1 && this.floor <= 5) {
        this.drawPixelFloorMap(this.floor);
        return;
      }

      const ctx = this.ctx;
      const progress = this.ensureFloorProgress(this.floor);
      const roomsOnFloor = clamp(safeNumber(progress.roomsPerFloor, this.getCurrentFloorRoomCount()), 1, 99);
      const startX = this.width - 342;
      const startY = 18;
      const topRowCount = Math.ceil(roomsOnFloor / 2);
      const bottomRowCount = roomsOnFloor - topRowCount;
      const longestRow = Math.max(topRowCount, bottomRowCount, 1);
      const maxWidth = 292;
      const gap = 6;
      const cell = clamp(Math.floor((maxWidth - (longestRow - 1) * gap) / longestRow), 14, 22);
      const roomTypeSymbols = {
        boss: "B",
        shop: "$",
        shop_locked: "L",
        mystery: "?",
        marked: "M",
        secret: "S"
      };
      const roomTypeColors = {
        normal: "#334155",
        secret: "#7c3aed",
        shop: "#92400e",
        shop_locked: "#7f1d1d",
        marked: "#0f766e",
        mystery: "#6d28d9",
        boss: "#7f1d1d"
      };

      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
      ctx.fillRect(startX - 16, startY - 12, 330, 80);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX - 16, startY - 12, 330, 80);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px monospace";
      ctx.fillText("FLOOR MAP", startX, startY + 2);

      for (let i = 1; i <= roomsOnFloor; i += 1) {
        const row = i <= topRowCount ? 0 : 1;
        const col = row === 0 ? i - 1 : i - topRowCount - 1;
        const x = startX + col * (cell + gap);
        const y = startY + 16 + row * (cell + gap);

        const isCurrent = i === this.roomNumber;
        const isCleared = Boolean(progress.clearedRooms[i]);
        const isVisited = Boolean(progress.visitedRooms[i]);
        const roomType = String(progress.roomTypes?.[i] || (i === roomsOnFloor ? "boss" : "normal")).toLowerCase();
        const isBoss = roomType === "boss";
        const baseColor = roomTypeColors[roomType] || roomTypeColors.normal;

        if (isCurrent) {
          ctx.fillStyle = "#facc15";
        } else if (isCleared) {
          ctx.fillStyle = "#22c55e";
        } else if (isVisited) {
          ctx.fillStyle = "#38bdf8";
        } else {
          ctx.fillStyle = baseColor;
        }

        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = isCurrent ? "#ffffff" : "#94a3b8";
        ctx.lineWidth = isCurrent ? 3 : 1;
        ctx.strokeRect(x, y, cell, cell);

        ctx.fillStyle = isBoss ? "#ffffff" : "#0f172a";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        const symbol = roomTypeSymbols[roomType] || String(i);
        ctx.fillText(symbol, x + cell / 2, y + Math.min(cell - 7, 15));
      }

      ctx.restore();
    }

    drawPixelFloorMap(floor) {
      const ctx = this.ctx;
      const progress = this.ensureFloorProgress(floor);
      const panelX = this.width - 352;
      const panelY = 10;
      const panelWidth = 338;
      const panelHeight = 116;
      const gridSize = 15;
      const spacingX = 28;
      const spacingY = 20;
      const mapOriginX = panelX + 32;
      const mapOriginY = panelY + 34;

      const floorMapConfigs = {
        1: {
          label: "F1 LAB",
          shell: "#0b1124",
          panel: "#17203a",
          trim: "#22315e",
          title: "#dbeafe",
          link: "#475569",
          roomPositions: {
            1: [0, 2], 2: [1, 2], 3: [2, 2], 4: [3, 1], 5: [3, 2], 6: [3, 3], 7: [4, 1], 8: [4, 2], 9: [4, 3], 10: [5, 2], 11: [6, 2], 12: [7, 2], 13: [8, 2]
          },
          links: [[1, 2], [2, 3], [3, 4], [3, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 10], [9, 10], [10, 11], [11, 12], [12, 13]]
        },
        2: {
          label: "F2 ROCK",
          shell: "#1f160f",
          panel: "#312319",
          trim: "#5b4634",
          title: "#fde68a",
          link: "#8b7355",
          roomPositions: {
            1: [0, 1], 2: [1, 1], 3: [2, 1], 4: [2, 2], 5: [3, 2], 6: [4, 1], 7: [4, 2], 8: [4, 3], 9: [5, 1], 10: [5, 2], 11: [6, 2], 12: [7, 2], 13: [8, 2]
          },
          links: [[1, 2], [2, 3], [3, 4], [4, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 10], [9, 11], [10, 11], [11, 12], [12, 13]]
        },
        3: {
          label: "F3 TIDES",
          shell: "#082032",
          panel: "#0c3248",
          trim: "#155e75",
          title: "#cffafe",
          link: "#38bdf8",
          roomPositions: {
            1: [0, 2], 2: [1, 1], 3: [1, 2], 4: [1, 3], 5: [2, 2], 6: [3, 1], 7: [3, 2], 8: [3, 3], 9: [4, 2], 10: [5, 1], 11: [5, 2], 12: [6, 2], 13: [7, 2]
          },
          links: [[1, 3], [2, 3], [3, 4], [3, 5], [5, 6], [5, 7], [5, 8], [6, 9], [7, 9], [8, 9], [9, 10], [9, 11], [11, 12], [12, 13]]
        },
        4: {
          label: "F4 STORM",
          shell: "#121524",
          panel: "#1f2438",
          trim: "#4b5563",
          title: "#f8fafc",
          link: "#94a3b8",
          roomPositions: {
            1: [0, 2], 2: [1, 2], 3: [2, 1], 4: [2, 3], 5: [3, 1], 6: [3, 2], 7: [3, 3], 8: [4, 0], 9: [4, 2], 10: [4, 4], 11: [5, 2], 12: [6, 2], 13: [7, 2]
          },
          links: [[1, 2], [2, 3], [2, 4], [3, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 11], [9, 11], [10, 11], [11, 12], [12, 13]]
        },
        5: {
          label: "F5 ORIGIN",
          shell: "#1b1029",
          panel: "#2a1542",
          trim: "#6d28d9",
          title: "#ede9fe",
          link: "#a78bfa",
          roomPositions: {
            1: [0, 2], 2: [1, 1], 3: [1, 2], 4: [1, 3], 5: [2, 1], 6: [2, 3], 7: [3, 2], 8: [4, 1], 9: [4, 2], 10: [4, 3], 11: [5, 2], 12: [6, 2], 13: [7, 2]
          },
          links: [[1, 3], [2, 3], [3, 4], [2, 5], [4, 6], [5, 7], [6, 7], [7, 8], [7, 9], [7, 10], [8, 11], [9, 11], [10, 11], [11, 12], [12, 13]]
        }
      };
      const mapConfig = floorMapConfigs[floor] || floorMapConfigs[1];
      const roomPositions = mapConfig.roomPositions;
      const links = mapConfig.links;

      ctx.save();

      ctx.fillStyle = mapConfig.shell;
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.fillStyle = mapConfig.panel;
      ctx.fillRect(panelX + 3, panelY + 3, panelWidth - 6, panelHeight - 6);
      ctx.fillStyle = mapConfig.trim;
      for (let x = panelX + 7; x < panelX + panelWidth - 8; x += 8) {
        ctx.fillRect(x, panelY + 7, 2, 2);
        ctx.fillRect(x, panelY + panelHeight - 9, 2, 2);
      }
      for (let y = panelY + 7; y < panelY + panelHeight - 8; y += 8) {
        ctx.fillRect(panelX + 7, y, 2, 2);
        ctx.fillRect(panelX + panelWidth - 9, y, 2, 2);
      }

      if (floor === 2) {
        ctx.fillStyle = "#7c5a3c";
        for (let i = 0; i < 26; i += 1) {
          const px = panelX + 16 + ((i * 23) % (panelWidth - 32));
          const py = panelY + 26 + ((i * 17) % (panelHeight - 34));
          ctx.fillRect(px, py, 2, 2);
        }
      } else if (floor === 3) {
        ctx.fillStyle = "#0ea5e9";
        for (let i = 0; i < 5; i += 1) {
          const y = panelY + 28 + i * 16;
          ctx.fillRect(panelX + 14, y, panelWidth - 28, 1);
        }
      } else if (floor === 4) {
        ctx.fillStyle = "#facc15";
        for (let i = 0; i < 4; i += 1) {
          const x = panelX + 42 + i * 70;
          ctx.fillRect(x, panelY + 26, 2, 12);
          ctx.fillRect(x - 3, panelY + 38, 6, 2);
        }
      } else if (floor === 5) {
        ctx.fillStyle = "#34d399";
        for (let i = 0; i < 14; i += 1) {
          const px = panelX + 22 + ((i * 19) % (panelWidth - 44));
          const py = panelY + 28 + ((i * 11) % (panelHeight - 38));
          ctx.fillRect(px, py, 3, 1);
          ctx.fillRect(px + 1, py - 1, 1, 3);
        }
      }

      ctx.fillStyle = mapConfig.title;
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(mapConfig.label, panelX + 10, panelY + 18);

      for (const [fromRoom, toRoom] of links) {
        const from = roomPositions[fromRoom];
        const to = roomPositions[toRoom];
        if (!from || !to) continue;
        const x1 = mapOriginX + from[0] * spacingX + Math.floor(gridSize / 2);
        const y1 = mapOriginY + from[1] * spacingY + Math.floor(gridSize / 2);
        const x2 = mapOriginX + to[0] * spacingX + Math.floor(gridSize / 2);
        const y2 = mapOriginY + to[1] * spacingY + Math.floor(gridSize / 2);

        ctx.fillStyle = mapConfig.link;
        if (y1 === y2) {
          const left = Math.min(x1, x2);
          ctx.fillRect(left, y1 - 2, Math.abs(x2 - x1), 4);
        } else if (x1 === x2) {
          const top = Math.min(y1, y2);
          ctx.fillRect(x1 - 2, top, 4, Math.abs(y2 - y1));
        } else {
          const bendX = x2;
          const left = Math.min(x1, bendX);
          const top = Math.min(y1, y2);
          ctx.fillRect(left, y1 - 2, Math.abs(bendX - x1), 4);
          ctx.fillRect(bendX - 2, top, 4, Math.abs(y2 - y1));
        }
      }

      for (let i = 1; i <= ROOMS_PER_FLOOR; i += 1) {
        const point = roomPositions[i];
        if (!point) continue;
        const x = mapOriginX + point[0] * spacingX;
        const y = mapOriginY + point[1] * spacingY;

        const isCurrent = i === this.roomNumber;
        const isCleared = Boolean(progress.clearedRooms[i]);
        const isVisited = Boolean(progress.visitedRooms[i]);
        const isBoss = i === ROOMS_PER_FLOOR;

        let fill = "#334155";
        let border = "#64748b";
        if (isBoss) {
          fill = "#7f1d1d";
          border = "#fca5a5";
        }
        if (isVisited) {
          fill = "#1e3a8a";
          border = "#60a5fa";
        }
        if (isCleared) {
          fill = "#14532d";
          border = "#86efac";
        }
        if (isCurrent) {
          fill = "#ca8a04";
          border = "#fef08a";
        }

        ctx.fillStyle = border;
        ctx.fillRect(x - 1, y - 1, gridSize + 2, gridSize + 2);
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, gridSize, gridSize);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(x + 2, y + 2, 4, 4);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x + gridSize - 4, y + gridSize - 4, 3, 3);

        ctx.fillStyle = isBoss ? "#fee2e2" : "#e2e8f0";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(isBoss ? "B" : String(i), x + Math.floor(gridSize / 2), y + 10);
      }

      ctx.restore();
    }

    drawEndScreen(title, subtitle, color) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.font = "bold 52px monospace";
      ctx.fillText(title, this.width / 2, this.height / 2 - 30);
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px monospace";
      ctx.fillText(subtitle, this.width / 2, this.height / 2 + 14);
      ctx.font = "16px monospace";
      ctx.fillText(`Gold: ${Math.floor(this.player?.gold ?? 0)}   XP: ${Math.floor(this.player?.xp ?? 0)}`, this.width / 2, this.height / 2 + 50);
      ctx.restore();
    }
  }

  window.LabGame = LabGame;
  window.TheLabGame = LabGame;

  window.addEventListener("DOMContentLoaded", () => {
    if (window.__THE_LAB_DISABLE_AUTO_START__) return;
    if (window.game && window.game.version === GAME_VERSION) return;
    const game = new LabGame();
    window.game = game;
    game.start();
  });
})();