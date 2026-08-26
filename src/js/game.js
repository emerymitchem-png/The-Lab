(function () {
  "use strict";

  const GAME_VERSION = "1.0.24";
  const MAX_FLOOR = 5;
  const ROOMS_PER_FLOOR = 13;
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
          clearedRooms: {},
          visitedRooms: {}
        };
      }
      return this.floorProgress[key];
    }

    loadRoom(floor, roomNumber, entrySide = "bottom") {
      this.floor = clamp(safeNumber(floor, 1), 1, MAX_FLOOR);
      this.roomNumber = clamp(safeNumber(roomNumber, 1), 1, ROOMS_PER_FLOOR);
      this.room = new window.Room(this.floor, this.roomNumber, {
        width: this.width,
        height: this.height,
        difficultyScale: this.getDifficultyScale(this.floor)
      });

      const progress = this.ensureFloorProgress(this.floor);
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
      if (this.floor === MAX_FLOOR && this.roomNumber === ROOMS_PER_FLOOR) {
        this.state = "victory";
        return;
      }

      if (this.roomNumber >= ROOMS_PER_FLOOR) {
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
      ctx.fillText(`Floor: ${this.floor}    Room: ${this.roomNumber}/${ROOMS_PER_FLOOR}`, 28, 100);
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
      if (this.floor === 1) {
        this.drawFirstFloorPixelMap();
        return;
      }

      const ctx = this.ctx;
      const progress = this.ensureFloorProgress(this.floor);
      const startX = this.width - 342;
      const startY = 18;
      const cell = 22;
      const gap = 6;

      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
      ctx.fillRect(startX - 16, startY - 12, 330, 80);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 2;
      ctx.strokeRect(startX - 16, startY - 12, 330, 80);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px monospace";
      ctx.fillText("FLOOR MAP", startX, startY + 2);

      for (let i = 1; i <= ROOMS_PER_FLOOR; i += 1) {
        const row = i <= 7 ? 0 : 1;
        const col = row === 0 ? i - 1 : i - 8;
        const x = startX + col * (cell + gap);
        const y = startY + 16 + row * (cell + gap);

        const isCurrent = i === this.roomNumber;
        const isCleared = Boolean(progress.clearedRooms[i]);
        const isVisited = Boolean(progress.visitedRooms[i]);
        const isBoss = i === ROOMS_PER_FLOOR;

        if (isCurrent) {
          ctx.fillStyle = "#facc15";
        } else if (isCleared) {
          ctx.fillStyle = "#22c55e";
        } else if (isVisited) {
          ctx.fillStyle = "#38bdf8";
        } else if (isBoss) {
          ctx.fillStyle = "#7f1d1d";
        } else {
          ctx.fillStyle = "#334155";
        }

        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = isCurrent ? "#ffffff" : "#94a3b8";
        ctx.lineWidth = isCurrent ? 3 : 1;
        ctx.strokeRect(x, y, cell, cell);

        ctx.fillStyle = isBoss ? "#ffffff" : "#0f172a";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(isBoss ? "B" : String(i), x + cell / 2, y + 15);
      }

      ctx.restore();
    }

    drawFirstFloorPixelMap() {
      const ctx = this.ctx;
      const progress = this.ensureFloorProgress(1);
      const panelX = this.width - 352;
      const panelY = 10;
      const panelWidth = 338;
      const panelHeight = 116;
      const gridSize = 15;
      const spacingX = 28;
      const spacingY = 20;
      const mapOriginX = panelX + 32;
      const mapOriginY = panelY + 34;

      const roomPositions = {
        1: [0, 2],
        2: [1, 2],
        3: [2, 2],
        4: [3, 1],
        5: [3, 2],
        6: [3, 3],
        7: [4, 1],
        8: [4, 2],
        9: [4, 3],
        10: [5, 2],
        11: [6, 2],
        12: [7, 2],
        13: [8, 2]
      };

      const links = [
        [1, 2], [2, 3],
        [3, 4], [3, 5], [3, 6],
        [4, 7], [5, 8], [6, 9],
        [7, 10], [8, 10], [9, 10],
        [10, 11], [11, 12], [12, 13]
      ];

      ctx.save();

      ctx.fillStyle = "#0b1124";
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.fillStyle = "#17203a";
      ctx.fillRect(panelX + 3, panelY + 3, panelWidth - 6, panelHeight - 6);
      ctx.fillStyle = "#22315e";
      for (let x = panelX + 7; x < panelX + panelWidth - 8; x += 8) {
        ctx.fillRect(x, panelY + 7, 2, 2);
        ctx.fillRect(x, panelY + panelHeight - 9, 2, 2);
      }
      for (let y = panelY + 7; y < panelY + panelHeight - 8; y += 8) {
        ctx.fillRect(panelX + 7, y, 2, 2);
        ctx.fillRect(panelX + panelWidth - 9, y, 2, 2);
      }

      ctx.fillStyle = "#dbeafe";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "left";
      ctx.fillText("F1 MAP", panelX + 10, panelY + 18);

      for (const [fromRoom, toRoom] of links) {
        const from = roomPositions[fromRoom];
        const to = roomPositions[toRoom];
        if (!from || !to) continue;
        const x1 = mapOriginX + from[0] * spacingX + Math.floor(gridSize / 2);
        const y1 = mapOriginY + from[1] * spacingY + Math.floor(gridSize / 2);
        const x2 = mapOriginX + to[0] * spacingX + Math.floor(gridSize / 2);
        const y2 = mapOriginY + to[1] * spacingY + Math.floor(gridSize / 2);

        ctx.fillStyle = "#475569";
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