/**
 * The Lab - Player System
 * Version: 1.0.22
 *
 * File: src/js/player.js
 * Replacement: Replace the whole file
 * Purpose:
 * - Move player with wall and enemy collision
 * - Shoot projectiles
 * - Detect projectile-enemy collisions and pass player ownership into enemy.takeDamage()
 * - Track HP, gold, XP, and death state
 *
 * TESTING CHECKLIST:
 * □ Start game, enter floor 1 room 1
 * □ 2-3 enemies should appear
 * □ Move toward enemies (no collision should stop you)
 * □ Shoot enemies (damage text appears)
 * □ Enemies die and drop loot (gold/xp text appears)
 * □ Projectiles despawn when they hit enemies or walls
 * □ Room clears, advance to room 2
 * □ After 13 rooms, advance to floor 2
 * □ Enemies are tougher on floor 2
 * □ Reaching floor 5, defeat final boss = victory screen
 * □ HP can reach 0 = game over screen
 */

(function () {
  "use strict";

  const PLAYER_VERSION = "1.0.22";

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

  function circleRectOverlap(cx, cy, radius, rect) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.width);
    const nearestY = clamp(cy, rect.y, rect.y + rect.height);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  class Player {
    constructor(x = 480, y = 320, options = {}) {
      this.version = PLAYER_VERSION;
      this.x = safeNumber(x, options.x ?? 480);
      this.y = safeNumber(y, options.y ?? 320);
      this.width = safeNumber(options.width, 26);
      this.height = safeNumber(options.height, 30);
      this.radius = safeNumber(options.radius, 13);

      this.baseSpeed = safeNumber(options.speed ?? options.moveSpeed, 185);
      this.speed = this.baseSpeed;
      this.moveSpeed = this.speed;

      this.maxHealth = safeNumber(options.maxHealth ?? options.maxHp ?? options.maxHP, 100);
      this.health = safeNumber(options.health ?? options.hp, this.maxHealth);
      this.maxHp = this.maxHealth;
      this.maxHP = this.maxHealth;
      this.hp = this.health;

      this.damage = safeNumber(options.damage ?? options.attack ?? options.atk, 10);
      this.attack = this.damage;
      this.atk = this.damage;
      this.defense = safeNumber(options.defense ?? options.def, 0);

      this.level = safeNumber(options.level, 1);
      this.xp = safeNumber(options.xp, 0);
      this.gold = safeNumber(options.gold, 0);

      this.fireRate = safeNumber(options.fireRate ?? options.attackSpeed, 0.22);
      this.fireCooldown = 0;
      this.projectileSpeed = safeNumber(options.projectileSpeed, 420);
      this.projectileRadius = safeNumber(options.projectileRadius, 5);
      this.projectileLife = safeNumber(options.projectileLife, 1.15);
      this.projectiles = [];

      this.dead = false;
      this.isDead = false;
      this.invulnerable = false;
      this.invulnerabilityTimer = 0;
      this.invulnerabilityDuration = safeNumber(options.invulnerabilityDuration, 0.6);
      this.hitFlashTimer = 0;

      this.facingX = 1;
      this.facingY = 0;
      this.lastAimX = this.x + 1;
      this.lastAimY = this.y;
      this.canvas = options.canvas || null;

      this.keys = {};
      this.input = {
        up: false,
        down: false,
        left: false,
        right: false,
        fire: false,
        mouseX: this.x + 1,
        mouseY: this.y
      };

      this.color = options.color || "#38bdf8";
      this.coatColor = options.coatColor || "#f8fafc";
      this.outlineColor = options.outlineColor || "#111827";

      this.bindInput(options.inputTarget || window, this.canvas);
    }

    bindInput(target, canvas) {
      if (this._inputBound) return;
      this._inputBound = true;

      target.addEventListener("keydown", (event) => {
        this.keys[event.code] = true;
        this.updateInputFromKeys();
        if (event.code === "Space") {
          this.input.fire = true;
          event.preventDefault();
        }
      });

      target.addEventListener("keyup", (event) => {
        this.keys[event.code] = false;
        this.updateInputFromKeys();
        if (event.code === "Space") {
          this.input.fire = false;
          event.preventDefault();
        }
      });

      const pointerTarget = canvas || target;

      pointerTarget.addEventListener("mousemove", (event) => {
        const point = this.getPointerPosition(event, canvas);
        this.setAim(point.x, point.y);
      });

      pointerTarget.addEventListener("mousedown", (event) => {
        const point = this.getPointerPosition(event, canvas);
        this.setAim(point.x, point.y);
        this.input.fire = true;
      });

      pointerTarget.addEventListener("mouseup", () => {
        this.input.fire = false;
      });

      pointerTarget.addEventListener("mouseleave", () => {
        this.input.fire = false;
      });

      pointerTarget.addEventListener("touchstart", (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        const point = this.getPointerPosition(touch, canvas);
        this.setAim(point.x, point.y);
        this.input.fire = true;
        event.preventDefault();
      }, { passive: false });

      pointerTarget.addEventListener("touchmove", (event) => {
        const touch = event.touches[0];
        if (!touch) return;
        const point = this.getPointerPosition(touch, canvas);
        this.setAim(point.x, point.y);
        event.preventDefault();
      }, { passive: false });

      pointerTarget.addEventListener("touchend", () => {
        this.input.fire = false;
      });
    }

    updateInputFromKeys() {
      this.input.up = Boolean(this.keys.KeyW || this.keys.ArrowUp);
      this.input.down = Boolean(this.keys.KeyS || this.keys.ArrowDown);
      this.input.left = Boolean(this.keys.KeyA || this.keys.ArrowLeft);
      this.input.right = Boolean(this.keys.KeyD || this.keys.ArrowRight);
    }

    getPointerPosition(event, canvas) {
      if (!canvas || typeof canvas.getBoundingClientRect !== "function") {
        return {
          x: safeNumber(event.clientX, this.lastAimX),
          y: safeNumber(event.clientY, this.lastAimY)
        };
      }

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(1, rect.width);
      const scaleY = canvas.height / Math.max(1, rect.height);
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }

    setAim(x, y) {
      this.input.mouseX = safeNumber(x, this.input.mouseX);
      this.input.mouseY = safeNumber(y, this.input.mouseY);
      this.lastAimX = this.input.mouseX;
      this.lastAimY = this.input.mouseY;
    }

    update(dt, world = {}) {
      const delta = safeNumber(dt, 0);
      if (this.dead || this.isDead) return;

      this.fireCooldown = Math.max(0, this.fireCooldown - delta);
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);

      if (this.invulnerable) {
        this.invulnerabilityTimer -= delta;
        if (this.invulnerabilityTimer <= 0) {
          this.invulnerable = false;
          this.invulnerabilityTimer = 0;
        }
      }

      this.updateMovement(delta, world);
      this.updateShooting(delta, world);
      this.updateProjectiles(delta, world);
      this.syncAliases();
    }

    syncAliases() {
      this.hp = this.health;
      this.maxHp = this.maxHealth;
      this.maxHP = this.maxHealth;
      this.attack = this.damage;
      this.atk = this.damage;
    }

    updateMovement(dt, world) {
      let dx = 0;
      let dy = 0;

      if (this.input.left) dx -= 1;
      if (this.input.right) dx += 1;
      if (this.input.up) dy -= 1;
      if (this.input.down) dy += 1;

      if (dx === 0 && dy === 0) return;

      const length = Math.hypot(dx, dy) || 1;
      dx /= length;
      dy /= length;
      this.facingX = dx;
      this.facingY = dy;

      this.moveWithCollision(dx * this.speed * dt, dy * this.speed * dt, world);
    }

    moveWithCollision(dx, dy, world) {
      const oldX = this.x;
      const oldY = this.y;
      const walls = world.walls || [];
      const enemies = world.enemies || [];

      this.x += dx;
      if (this.collidesWithAnyWall(walls) || this.collidesWithAnyEnemy(enemies)) {
        this.x = oldX;
      }

      this.y += dy;
      if (this.collidesWithAnyWall(walls) || this.collidesWithAnyEnemy(enemies)) {
        this.y = oldY;
      }
    }

    collidesWithAnyWall(walls) {
      for (const wall of walls || []) {
        if (circleRectOverlap(this.x, this.y, this.radius, wall)) {
          return true;
        }
      }
      return false;
    }

    collidesWithAnyEnemy(enemies) {
      for (const enemy of enemies || []) {
        if (!enemy || enemy.dead || enemy.remove) continue;
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = safeNumber(enemy.radius, 14) + this.radius - 2;
        if (distance < minDistance) {
          return true;
        }
      }
      return false;
    }

    updateShooting(dt, world) {
      if (this.input.fire || this.keys.Space) {
        this.fireAt(this.lastAimX, this.lastAimY);
      }
    }

    fireAt(targetX, targetY, options = {}) {
      if (this.fireCooldown > 0 || this.dead || this.isDead) return null;

      let dx = safeNumber(targetX, this.x + this.facingX) - this.x;
      let dy = safeNumber(targetY, this.y + this.facingY) - this.y;
      let length = Math.hypot(dx, dy);

      if (length < 0.001) {
        dx = this.facingX || 1;
        dy = this.facingY || 0;
        length = Math.hypot(dx, dy) || 1;
      }

      dx /= length;
      dy /= length;

      const projectile = {
        x: this.x + dx * (this.radius + 8),
        y: this.y + dy * (this.radius + 8),
        vx: dx * safeNumber(options.speed, this.projectileSpeed),
        vy: dy * safeNumber(options.speed, this.projectileSpeed),
        radius: safeNumber(options.radius, this.projectileRadius),
        damage: safeNumber(options.damage, this.damage),
        life: safeNumber(options.life, this.projectileLife),
        remove: false,
        owner: this
      };

      this.projectiles.push(projectile);
      this.fireCooldown = this.fireRate;
      return projectile;
    }

    shoot(targetX, targetY, options = {}) {
      return this.fireAt(targetX, targetY, options);
    }

    fireProjectile(targetX, targetY, options = {}) {
      return this.fireAt(targetX, targetY, options);
    }

    updateProjectiles(dt, world) {
      const walls = world.walls || [];
      const enemies = world.enemies || [];
      const room = world.room || null;

      for (const projectile of this.projectiles) {
        if (projectile.remove) continue;

        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;

        if (projectile.life <= 0) {
          projectile.remove = true;
          continue;
        }

        for (const wall of walls) {
          if (circleRectOverlap(projectile.x, projectile.y, projectile.radius, wall)) {
            projectile.remove = true;
            break;
          }
        }

        if (projectile.remove) continue;

        for (const enemy of enemies) {
          if (!enemy || enemy.dead || enemy.remove) continue;
          const dx = enemy.x - projectile.x;
          const dy = enemy.y - projectile.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= safeNumber(enemy.radius, 14) + projectile.radius) {
            if (typeof enemy.takeDamage === "function") {
              enemy.takeDamage(projectile.damage, { player: this, owner: this, projectile });
            } else {
              enemy.health = Math.max(0, safeNumber(enemy.health, 1) - projectile.damage);
              if (enemy.health <= 0) enemy.dead = true;
            }
            projectile.remove = true;
            if (room && typeof room.addFeedback === "function") {
              room.addFeedback(`-${Math.round(projectile.damage)}`, enemy.x, enemy.y - 22, "#ffffff");
            }
            break;
          }
        }
      }

      this.projectiles = this.projectiles.filter((projectile) => !projectile.remove);
    }

    takeDamage(amount, source = {}) {
      if (this.dead || this.isDead || this.invulnerable) return 0;

      const incoming = Math.max(0, safeNumber(amount, 0));
      if (incoming <= 0) return 0;

      const finalDamage = Math.max(1, Math.round(incoming - this.defense));
      this.health = Math.max(0, this.health - finalDamage);
      this.hp = this.health;
      this.hitFlashTimer = 0.12;
      this.invulnerable = true;
      this.invulnerabilityTimer = this.invulnerabilityDuration;
      this.lastDamageSource = source;

      if (this.health <= 0) {
        this.die();
      }

      return finalDamage;
    }

    heal(amount) {
      const value = Math.max(0, safeNumber(amount, 0));
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + value);
      this.hp = this.health;
      return this.health - before;
    }

    die() {
      this.health = 0;
      this.hp = 0;
      this.dead = true;
      this.isDead = true;
    }

    addGold(amount) {
      this.gold += Math.max(0, safeNumber(amount, 0));
      return this.gold;
    }

    onEnemyDefeated(detail = {}) {
      this.lastEnemyDefeated = detail.enemy || null;
      return detail;
    }

    addXP(amount) {
      this.xp += Math.max(0, safeNumber(amount, 0));
      return this.xp;
    }

    drawProjectiles(ctx, camera) {
      if (!ctx) return;
      ctx.save();
      ctx.fillStyle = "#38bdf8";
      for (const projectile of this.projectiles) {
        ctx.beginPath();
        ctx.arc(projectile.x - safeNumber(camera.x, 0), projectile.y - safeNumber(camera.y, 0), projectile.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    draw(ctx, camera = { x: 0, y: 0 }) {
      if (!ctx) return;

      this.drawProjectiles(ctx, camera);

      ctx.save();
      ctx.translate(this.x - safeNumber(camera.x, 0), this.y - safeNumber(camera.y, 0));

      if (this.invulnerable && Math.floor(this.invulnerabilityTimer * 16) % 2 === 0) {
        ctx.globalAlpha = 0.55;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(0, this.height / 2 - 2, this.width * 0.48, this.height * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      const flashing = this.hitFlashTimer > 0;
      ctx.fillStyle = flashing ? "#ffffff" : this.coatColor;
      ctx.strokeStyle = this.outlineColor;
      ctx.lineWidth = 2;
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

      ctx.fillStyle = flashing ? "#ffffff" : this.color;
      ctx.fillRect(-this.width / 2 + 5, -this.height / 2 + 6, this.width - 10, this.height - 9);

      ctx.fillStyle = "#111827";
      ctx.fillRect(-this.width / 2 + 4, -this.height / 2 - 8, this.width - 8, 10);

      const eyeShift = this.lastAimX >= this.x ? 3 : -3;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-7 + eyeShift, -8, 4, 4);
      ctx.fillRect(4 + eyeShift, -8, 4, 4);
      ctx.fillStyle = "#111111";
      ctx.fillRect(-6 + eyeShift, -7, 2, 2);
      ctx.fillRect(5 + eyeShift, -7, 2, 2);

      ctx.restore();
    }
  }

  Player.VERSION = PLAYER_VERSION;
  window.Player = Player;
})();