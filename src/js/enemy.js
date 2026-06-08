/**
 * The Lab - Enemy System
 * Version: 1.0.22
 *
 * File: src/js/enemy.js
 * Replacement: Replace the whole file
 * Purpose:
 * - Create enemies from docs/enemies.json compatible data
 * - Move enemies toward the player with simple chase pathing
 * - Handle idle, chase, attack, and flee states
 * - Take projectile damage, dispatch death events, and award loot hooks
 *
 * TESTING CHECKLIST:
 * □ Start game, enter floor 1 room 1
 * □ 2-3 enemies should appear
 * □ Move toward enemies (no collision should stop you)
 * □ Shoot enemies (damage text appears)
 * □ Enemies die and drop loot (gold/xp text appears)
 * □ Low-health non-boss enemies briefly flee instead of only chasing
 * □ Room clears, advance to room 2
 * □ After 13 rooms, advance to floor 2
 * □ Enemies are tougher on floor 2
 * □ Reaching floor 5, defeat final boss = victory screen
 * □ HP can reach 0 = game over screen
 */

(function () {
  "use strict";

  const ENEMY_VERSION = "1.0.22";

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

  function getDifficultyScale(floor) {
    const safeFloor = clamp(safeNumber(floor, 1), 1, 5);
    return 1 + ((safeFloor - 1) * 0.125);
  }

  function readStat(data, names, fallback) {
    for (const name of names) {
      if (data && data[name] !== undefined) {
        return safeNumber(data[name], fallback);
      }
    }
    return fallback;
  }

  class Enemy {
    constructor(x, y, typeData = {}, options = {}) {
      const data = typeData && typeof typeData === "object" ? typeData : {};

      this.version = ENEMY_VERSION;
      this.id = String(data.id || data.key || data.name || "enemy").toLowerCase().replace(/\s+/g, "_");
      this.name = String(data.name || data.label || this.id.replace(/_/g, " "));
      this.x = safeNumber(x, data.x ?? 0);
      this.y = safeNumber(y, data.y ?? 0);
      this.spawnX = this.x;
      this.spawnY = this.y;

      this.floor = clamp(safeNumber(options.floor, data.floor ?? 1), 1, 5);
      this.roomNumber = safeNumber(options.roomNumber, 1);
      this.roomType = String(options.roomType || data.roomType || "normal");
      this.isBoss = Boolean(options.isBoss || data.boss || data.isBoss || data.type === "boss");
      this.difficultyScale = safeNumber(options.difficultyScale, getDifficultyScale(this.floor));

      this.radius = readStat(data, ["radius", "size", "hitRadius", "hit_radius"], this.isBoss ? 24 : 15);
      this.width = readStat(data, ["width", "w"], this.radius * 2);
      this.height = readStat(data, ["height", "h"], this.radius * 2);

      const baseHealth = readStat(data, ["health", "hp", "maxHealth", "max_health", "maxHp"], this.isBoss ? 120 : 28);
      const baseDamage = readStat(data, ["damage", "contactDamage", "contact_damage", "attack", "atk"], 5);

      this.maxHealth = Math.round(baseHealth * this.difficultyScale * (this.isBoss ? 1.15 : 1));
      this.health = this.maxHealth;
      this.hp = this.health;
      this.damage = Math.max(1, Math.round(baseDamage * this.difficultyScale));
      this.contactDamage = this.damage;

      this.speed = readStat(data, ["speed", "moveSpeed", "move_speed"], this.isBoss ? 48 : 64);
      this.chaseRange = readStat(data, ["chaseRange", "chase_range", "aggroRange", "aggro_range"], 420);
      this.attackRange = readStat(data, ["attackRange", "attack_range"], this.radius + 18);
      this.attackCooldownDuration = readStat(data, ["attackCooldown", "attack_cooldown", "contactCooldown", "contact_cooldown"], 0.5);
      this.attackCooldown = 0;

      this.fleeThreshold = this.isBoss ? 0 : readStat(data, ["fleeThreshold", "flee_threshold", "fleeAtHealthPercent"], 0.25);
      this.fleeSpeedMultiplier = readStat(data, ["fleeSpeedMultiplier", "flee_speed_multiplier"], 1.18);

      this.xpValue = readStat(data, ["xp", "xpValue", "xp_value", "experience"], this.isBoss ? 75 : 25);
      this.goldValue = readStat(data, ["gold", "goldValue", "gold_value"], this.isBoss ? 40 : 10);
      this.lootTable = data.lootTable || data.loot_table || data.loot || null;

      this.state = "idle";
      this.dead = false;
      this.remove = false;
      this.deathTimer = 0;
      this.removeDelay = 0.25;
      this.hitFlashTimer = 0;
      this.hitFlashDuration = 0.1;
      this.damageTexts = [];
      this.lastHitBy = null;

      this.color = data.color || (this.isBoss ? "#fb7185" : "#facc15");
      this.outlineColor = data.outlineColor || data.outline_color || "#111827";
    }

    update(dt, player, walls = []) {
      const delta = safeNumber(dt, 0);
      this.attackCooldown = Math.max(0, this.attackCooldown - delta);
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);
      this.updateDamageTexts(delta);

      if (this.dead) {
        this.deathTimer += delta;
        if (this.deathTimer >= this.removeDelay) {
          this.remove = true;
        }
        return;
      }

      if (!player || player.dead || player.isDead) {
        this.state = "idle";
        return;
      }

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const distance = Math.hypot(dx, dy) || 1;

      const healthPercent = this.maxHealth > 0 ? this.health / this.maxHealth : 1;

      if (!this.isBoss && healthPercent <= this.fleeThreshold && distance <= this.chaseRange * 0.85) {
        this.state = "flee";
        this.moveAwayFrom(dx / distance, dy / distance, delta, walls);
      } else if (distance <= this.attackRange + safeNumber(player.radius, 12)) {
        this.state = "attack";
        this.attack(player);
      } else if (distance <= this.chaseRange) {
        this.state = "chase";
        this.moveToward(dx / distance, dy / distance, delta, walls);
      } else {
        this.state = "idle";
      }

      this.hp = this.health;
    }

    moveToward(nx, ny, dt, walls) {
      const amount = this.speed * dt;
      const oldX = this.x;
      const oldY = this.y;

      this.x += nx * amount;
      if (this.collidesWithWalls(walls)) {
        this.x = oldX;
        this.y += Math.sign(ny || 1) * amount * 0.75;
        if (this.collidesWithWalls(walls)) {
          this.y = oldY;
        }
      }

      this.y += ny * amount;
      if (this.collidesWithWalls(walls)) {
        this.y = oldY;
        this.x += Math.sign(nx || 1) * amount * 0.75;
        if (this.collidesWithWalls(walls)) {
          this.x = oldX;
        }
      }
    }

    moveAwayFrom(nx, ny, dt, walls) {
      const originalSpeed = this.speed;
      this.speed = originalSpeed * this.fleeSpeedMultiplier;
      this.moveToward(-nx, -ny, dt, walls);
      this.speed = originalSpeed;
    }

    collidesWithWalls(walls) {
      if (!Array.isArray(walls)) return false;
      for (const wall of walls) {
        if (circleRectOverlap(this.x, this.y, this.radius, wall)) {
          return true;
        }
      }
      return false;
    }

    attack(player) {
      if (this.attackCooldown > 0) return;
      this.attackCooldown = this.attackCooldownDuration;

      if (player && typeof player.takeDamage === "function") {
        player.takeDamage(this.contactDamage, {
          type: "enemy_contact",
          enemy: this,
          enemyId: this.id
        });
      } else if (player && typeof player.health === "number") {
        player.health = Math.max(0, player.health - this.contactDamage);
        player.hp = player.health;
      }
    }

    takeDamage(amount, source = {}) {
      if (this.dead || this.remove) return 0;

      const incoming = Math.max(0, safeNumber(amount, 0));
      if (incoming <= 0) return 0;

      this.health = Math.max(0, this.health - incoming);
      this.hp = this.health;
      this.hitFlashTimer = this.hitFlashDuration;
      this.lastHitBy = source;
      this.addDamageText(`-${Math.round(incoming)}`, "#ffffff");

      if (this.health <= 0) {
        this.die(source);
      }

      return incoming;
    }

    addDamageText(text, color) {
      this.damageTexts.push({
        text,
        x: this.x,
        y: this.y - this.radius - 10,
        life: 0.65,
        color: color || "#ffffff"
      });
    }

    updateDamageTexts(dt) {
      for (const text of this.damageTexts) {
        text.y -= 28 * dt;
        text.life -= dt;
      }
      this.damageTexts = this.damageTexts.filter((text) => text.life > 0);
    }

    die(source = {}) {
      if (this.dead) return;
      this.dead = true;
      this.health = 0;
      this.hp = 0;
      this.deathTimer = 0;
      this.state = "dead";
      this.addDamageText(`+${this.goldValue}g +${this.xpValue}xp`, "#facc15");

      const player = source.player || source.owner || null;
      if (player) {
        this.awardLoot(player);
      }

      const detail = {
        enemy: this,
        player,
        gold: this.goldValue,
        xp: this.xpValue,
        lootTable: this.lootTable,
        source
      };

      if (source && typeof source.onEnemyDefeated === "function") {
        source.onEnemyDefeated(detail);
      }

      if (player && typeof player.onEnemyDefeated === "function") {
        player.onEnemyDefeated(detail);
      }

      if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("lab:enemyDefeated", { detail }));
      }
    }

    awardLoot(player) {
      if (!player) return;

      if (typeof player.addGold === "function") {
        player.addGold(this.goldValue);
      } else {
        player.gold = safeNumber(player.gold, 0) + this.goldValue;
      }

      if (typeof player.addXP === "function") {
        player.addXP(this.xpValue);
      } else {
        player.xp = safeNumber(player.xp, 0) + this.xpValue;
      }
    }

    draw(ctx, camera = { x: 0, y: 0 }) {
      if (!ctx || this.remove) return;

      const alpha = this.dead ? Math.max(0.1, 1 - this.deathTimer / this.removeDelay) : 1;
      const flashing = this.hitFlashTimer > 0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x, this.y);

      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(0, this.radius * 0.8, this.radius * 0.85, this.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = flashing ? "#ffffff" : this.color;
      ctx.strokeStyle = this.outlineColor;
      ctx.lineWidth = this.isBoss ? 4 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.fillRect(-this.radius * 0.45, -this.radius * 0.18, this.radius * 0.22, this.radius * 0.22);
      ctx.fillRect(this.radius * 0.23, -this.radius * 0.18, this.radius * 0.22, this.radius * 0.22);

      if (!this.dead) {
        this.drawHealthBar(ctx);
      }

      ctx.restore();
      this.drawDamageTexts(ctx);
    }

    drawHealthBar(ctx) {
      const width = this.isBoss ? 72 : 42;
      const height = 6;
      const y = -this.radius - 14;
      const percent = this.maxHealth > 0 ? clamp(this.health / this.maxHealth, 0, 1) : 0;

      ctx.fillStyle = "#111827";
      ctx.fillRect(-width / 2, y, width, height);
      ctx.fillStyle = this.isBoss ? "#fb7185" : "#22c55e";
      ctx.fillRect(-width / 2, y, width * percent, height);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.strokeRect(-width / 2, y, width, height);
    }

    drawDamageTexts(ctx) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 14px monospace";
      for (const text of this.damageTexts) {
        ctx.globalAlpha = clamp(text.life / 0.65, 0, 1);
        ctx.fillStyle = text.color;
        ctx.fillText(text.text, text.x, text.y);
      }
      ctx.restore();
    }

    getRect() {
      return {
        x: this.x - this.radius,
        y: this.y - this.radius,
        width: this.radius * 2,
        height: this.radius * 2
      };
    }

    collidesWithRect(rect) {
      return rectsOverlap(this.getRect(), rect);
    }
  }

  Enemy.VERSION = ENEMY_VERSION;
  window.Enemy = Enemy;
})();