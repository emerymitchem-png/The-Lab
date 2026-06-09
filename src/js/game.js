/**
 * The Lab - Game Loop
 * Version: 1.0.23
 *
 * File: src/js/game.js
 * Replacement: Replace the whole file
 * Purpose:
 * - Run the 60 FPS canvas loop
 * - Create player and rooms
 * - Pass enemies/walls to player.update()
 * - Advance rooms/floors through visible exit doors instead of instant auto-advance
 * - Draw floor minimap / room progress strip
 * - Handle victory/game over
 * - Keep H key damage test
 *
 * TESTING CHECKLIST:
 * □ Start game, enter floor 1 room 1
 * □ Room has visible barriers
 * □ Player/enemies/projectiles collide with barriers
 * □ Enemies die and room clear text appears
 * □ Exit door opens after room clear
 * □ Walking into exit advances to the next room
 * □ Minimap marks current and cleared rooms
 * □ After 13 rooms, advance to floor 2
 * □ Reaching floor 5, defeat final boss and use exit = victory screen
 * □ HP can reach 0 = game over screen
 */

(function () {
  "use strict";

  const GAME_VERSION = "1.0.23";
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

      if (entrySide === "exit") {
        this.player.x = this.width / 2;
        this.player.y = this.height - margin;
      } else if (entrySide === "start") {
        this.player.x = this.width / 2;
        this.player.y = this.height / 2;
      } else {
        this.player.x = this.width / 2;
        this.player.y = this.height - margin;
      }
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
