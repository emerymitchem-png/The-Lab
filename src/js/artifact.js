/**
 * The Lab - Artifact Equipment System
 * Version: 1.0.7
 *
 * File: src/js/artifact.js
 * Purpose:
 * - Load artifact data from artifacts.json through GameLoader
 * - Create Artifact objects
 * - Equip and unequip artifacts
 * - Apply and remove artifact stat modifiers from the player
 * - Support rarity tiers, equipment slots, inventory, triggered effects, and save/load data
 *
 * Dependencies:
 * - window.gameLoader from src/js/loader.js
 *
 * Recommended script order:
 *   loader.js
 *   specialization.js
 *   projectile.js
 *   artifact.js
 *   player.js
 *   enemy.js
 *   room.js
 *   ui.js
 *   game.js
 */

(function () {
  "use strict";

  class Artifact {
    constructor(artifactId, options = {}) {
      this.id = artifactId;
      this.artifactId = artifactId;
      this.instanceId = options.instanceId || Artifact.createInstanceId(artifactId);

      this.data = this.loadData(artifactId);

      this.name = this.data.name || this.data.displayName || this.data.display_name || String(artifactId);
      this.description = this.data.description || "";
      this.rarity = String(this.data.rarity || options.rarity || "common").toLowerCase();
      this.slot = String(this.data.slot || this.data.equipmentSlot || this.data.equipment_slot || options.slot || "artifact").toLowerCase();

      this.level = Number(options.level || this.data.level || 1);
      this.maxLevel = Number(this.data.maxLevel || this.data.max_level || 1);

      this.equipped = Boolean(options.equipped || false);
      this.locked = Boolean(options.locked || false);

      this.uses = Number(options.uses ?? this.data.uses ?? this.data.maxUses ?? this.data.max_uses ?? -1);
      this.maxUses = Number(this.data.maxUses ?? this.data.max_uses ?? this.uses);

      this.cooldown = Number(this.data.cooldown || 0);
      this.cooldownTimer = Number(options.cooldownTimer || 0);

      this.triggerLog = [];
    }

    static createInstanceId(artifactId) {
      Artifact._nextInstanceId = (Artifact._nextInstanceId || 0) + 1;
      return `${artifactId}_${Date.now()}_${Artifact._nextInstanceId}`;
    }

    loadData(artifactId) {
      if (window.gameLoader && typeof window.gameLoader.getArtifact === "function") {
        const loaded = window.gameLoader.getArtifact(artifactId);
        if (loaded) {
          return loaded;
        }
      }

      console.warn(`[Artifact] Missing artifact data for ${artifactId}. Using fallback artifact.`);

      return {
        id: artifactId,
        name: String(artifactId),
        description: "Fallback artifact.",
        rarity: "common",
        slot: "artifact",
        statModifiers: {}
      };
    }

    equip(player) {
      if (!player) {
        console.warn(`[Artifact] Cannot equip ${this.id}: missing player.`);
        return false;
      }

      if (this.equipped) {
        return true;
      }

      ArtifactSystem.applyModifiersToPlayer(player, this.getStatModifiers(), this.instanceId);
      this.equipped = true;

      return true;
    }

    unequip(player) {
      if (!player) {
        console.warn(`[Artifact] Cannot unequip ${this.id}: missing player.`);
        return false;
      }

      if (!this.equipped) {
        return true;
      }

      ArtifactSystem.removeModifiersFromPlayer(player, this.getStatModifiers(), this.instanceId);
      this.equipped = false;

      return true;
    }

    update(deltaTime) {
      const dt = ArtifactSystem.normalizeDeltaTime(deltaTime);
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }

    canTrigger(eventName, context = {}) {
      if (this.cooldownTimer > 0) {
        return false;
      }

      if (this.uses === 0) {
        return false;
      }

      const triggers = this.getTriggers();

      if (!triggers.length) {
        return false;
      }

      return triggers.some((trigger) => this.triggerMatches(trigger, eventName, context));
    }

    trigger(eventName, player, context = {}) {
      if (!this.canTrigger(eventName, context)) {
        return null;
      }

      const triggers = this.getTriggers();
      const matched = triggers.filter((trigger) => this.triggerMatches(trigger, eventName, context));

      const results = [];

      for (const trigger of matched) {
        const result = this.applyTriggerEffect(trigger, player, context);
        if (result) {
          results.push(result);
        }
      }

      if (results.length > 0) {
        if (this.cooldown > 0) {
          this.cooldownTimer = this.cooldown;
        }

        if (this.uses > 0) {
          this.uses -= 1;
        }

        this.triggerLog.push({
          eventName,
          time: Date.now(),
          results
        });
      }

      return results.length > 0 ? results : null;
    }

    triggerMatches(trigger, eventName, context) {
      const triggerEvent = trigger.event || trigger.eventName || trigger.event_name || trigger.on;

      if (triggerEvent && String(triggerEvent) !== String(eventName)) {
        return false;
      }

      const chance = Number(trigger.chance ?? trigger.procChance ?? trigger.proc_chance ?? 1);

      if (chance < 1 && Math.random() > chance) {
        return false;
      }

      const requiredRoomType = trigger.roomType || trigger.room_type;

      if (requiredRoomType && context.room && String(context.room.type) !== String(requiredRoomType)) {
        return false;
      }

      const requiredEnemyType = trigger.enemyType || trigger.enemy_type;

      if (requiredEnemyType && context.enemy && String(context.enemy.type || context.enemy.enemyType || context.enemy.id) !== String(requiredEnemyType)) {
        return false;
      }

      const minHealthPercent = trigger.minHealthPercent ?? trigger.min_health_percent;
      const maxHealthPercent = trigger.maxHealthPercent ?? trigger.max_health_percent;

      if (context.player) {
        const hp = Number(context.player.health ?? context.player.hp ?? 0);
        const maxHp = Number(context.player.maxHealth ?? context.player.maxHp ?? context.player.maxHP ?? 1);
        const healthPercent = maxHp > 0 ? hp / maxHp : 0;

        if (minHealthPercent !== undefined && healthPercent < Number(minHealthPercent)) {
          return false;
        }

        if (maxHealthPercent !== undefined && healthPercent > Number(maxHealthPercent)) {
          return false;
        }
      }

      return true;
    }

    applyTriggerEffect(trigger, player, context) {
      if (!player) {
        return null;
      }

      const effect = trigger.effect || trigger.effects || trigger;

      const result = {
        artifactId: this.id,
        instanceId: this.instanceId,
        effectType: effect.type || trigger.type || "unknown",
        applied: false
      };

      const effectType = String(effect.type || trigger.type || "").toLowerCase();

      if (effectType === "heal") {
        const amount = ArtifactSystem.resolveScaledValue(effect.amount ?? trigger.amount ?? 0, this.level, this.rarity);

        if (typeof player.heal === "function") {
          result.amount = player.heal(amount);
        } else {
          const maxHealth = Number(player.maxHealth ?? player.maxHp ?? player.maxHP ?? 100);
          const before = Number(player.health ?? player.hp ?? maxHealth);
          player.health = Math.min(maxHealth, before + amount);
          player.hp = player.health;
          result.amount = player.health - before;
        }

        result.applied = true;
        return result;
      }

      if (effectType === "gold") {
        const amount = ArtifactSystem.resolveScaledValue(effect.amount ?? trigger.amount ?? 0, this.level, this.rarity);

        if (typeof player.addGold === "function") {
          player.addGold(amount);
        } else {
          player.gold = Number(player.gold || 0) + amount;
        }

        result.amount = amount;
        result.applied = true;
        return result;
      }

      if (effectType === "xp" || effectType === "experience") {
        const amount = ArtifactSystem.resolveScaledValue(effect.amount ?? trigger.amount ?? 0, this.level, this.rarity);

        if (typeof player.addXP === "function") {
          player.addXP(amount);
        } else {
          player.xp = Number(player.xp || 0) + amount;
        }

        result.amount = amount;
        result.applied = true;
        return result;
      }

      if (effectType === "temporary_modifier" || effectType === "temporarymodifier" || effectType === "buff") {
        const modifiers = effect.statModifiers || effect.stat_modifiers || effect.modifiers || {};
        const duration = Number(effect.duration || 3);
        ArtifactSystem.applyTemporaryModifiers(player, modifiers, duration, this.instanceId);

        result.modifiers = ArtifactSystem.cloneData(modifiers);
        result.duration = duration;
        result.applied = true;
        return result;
      }

      if (effectType === "status") {
        const status = effect.status || effect.statusEffect || effect.status_effect;

        if (status && typeof player.addStatusEffect === "function") {
          player.addStatusEffect(status);
          result.status = ArtifactSystem.cloneData(status);
          result.applied = true;
          return result;
        }
      }

      if (effectType === "projectile_modifier") {
        if (!player.artifactProjectileModifiers) {
          player.artifactProjectileModifiers = [];
        }

        const modifier = effect.modifier || effect.modifiers || {};
        player.artifactProjectileModifiers.push({
          source: this.instanceId,
          modifier: ArtifactSystem.cloneData(modifier),
          duration: Number(effect.duration || 1.5)
        });

        result.modifier = ArtifactSystem.cloneData(modifier);
        result.applied = true;
        return result;
      }

      return null;
    }

    getStatModifiers() {
      const modifiers =
        this.data.statModifiers ||
        this.data.stat_modifiers ||
        this.data.modifiers ||
        this.data.stats ||
        {};

      const scaled = ArtifactSystem.cloneData(modifiers);

      if (this.level > 1) {
        for (const [key, value] of Object.entries(scaled)) {
          const numeric = Number(value);
          if (!Number.isNaN(numeric)) {
            scaled[key] = numeric + Math.max(0, this.level - 1);
          }
        }
      }

      return scaled;
    }

    getTriggers() {
      const triggers =
        this.data.triggers ||
        this.data.triggerEffects ||
        this.data.trigger_effects ||
        this.data.effects ||
        [];

      if (Array.isArray(triggers)) {
        return triggers;
      }

      if (triggers && typeof triggers === "object") {
        return Object.entries(triggers).map(([eventName, effect]) => {
          if (effect && typeof effect === "object") {
            return Object.assign({ event: eventName }, effect);
          }

          return {
            event: eventName,
            type: String(effect)
          };
        });
      }

      return [];
    }

    getRarityMultiplier() {
      return ArtifactSystem.getRarityMultiplier(this.rarity);
    }

    getSaveData() {
      return {
        id: this.id,
        artifactId: this.artifactId,
        instanceId: this.instanceId,
        rarity: this.rarity,
        slot: this.slot,
        level: this.level,
        equipped: this.equipped,
        locked: this.locked,
        uses: this.uses,
        maxUses: this.maxUses,
        cooldownTimer: this.cooldownTimer
      };
    }

    static fromSaveData(saveData) {
      return new Artifact(saveData.artifactId || saveData.id, saveData);
    }
  }

  class ArtifactSystem {
    constructor(player, options = {}) {
      this.player = player || null;

      this.maxEquipped = Number(options.maxEquipped || 6);
      this.maxInventory = Number(options.maxInventory || 60);

      this.inventory = [];
      this.equipped = {};

      this.availableArtifacts = {};
      this.temporaryModifiers = [];

      this.loadAvailableArtifacts();

      if (this.player) {
        this.attachToPlayer(this.player);
      }
    }

    attachToPlayer(player) {
      this.player = player;

      if (!Array.isArray(player.activeArtifacts)) {
        player.activeArtifacts = [];
      }

      if (!Array.isArray(player.inventory)) {
        player.inventory = [];
      }

      player.artifactSystem = this;
    }

    loadAvailableArtifacts() {
      if (window.gameLoader && typeof window.gameLoader.getAllArtifacts === "function") {
        const artifacts = window.gameLoader.getAllArtifacts();

        for (const artifactData of artifacts) {
          const id = ArtifactSystem.resolveId(artifactData);
          if (!id) {
            continue;
          }

          this.availableArtifacts[String(id)] = artifactData;
        }
      }
    }

    createArtifact(artifactId, options = {}) {
      return new Artifact(artifactId, options);
    }

    addArtifact(artifactId, options = {}) {
      if (this.inventory.length >= this.maxInventory) {
        console.warn(`[ArtifactSystem] Inventory full. Could not add artifact: ${artifactId}`);
        return null;
      }

      const artifact = artifactId instanceof Artifact ? artifactId : new Artifact(artifactId, options);
      this.inventory.push(artifact);
      this.syncPlayerInventory();

      return artifact;
    }

    removeArtifact(instanceId) {
      const artifact = this.findByInstanceId(instanceId);

      if (!artifact) {
        return false;
      }

      if (artifact.equipped) {
        this.unequip(instanceId);
      }

      this.inventory = this.inventory.filter((item) => item.instanceId !== instanceId);
      this.syncPlayerInventory();

      return true;
    }

    equip(instanceIdOrArtifactId) {
      if (!this.player) {
        console.warn("[ArtifactSystem] Cannot equip artifact: missing player.");
        return false;
      }

      const artifact = this.findArtifact(instanceIdOrArtifactId);

      if (!artifact) {
        console.warn(`[ArtifactSystem] Cannot equip artifact: ${instanceIdOrArtifactId} not found.`);
        return false;
      }

      if (artifact.locked) {
        console.warn(`[ArtifactSystem] Cannot equip locked artifact: ${artifact.name}`);
        return false;
      }

      if (artifact.equipped) {
        return true;
      }

      if (this.isSlotOccupied(artifact.slot)) {
        const currentlyEquipped = this.equipped[artifact.slot];
        if (currentlyEquipped) {
          this.unequip(currentlyEquipped.instanceId);
        }
      }

      if (this.getEquippedArtifacts().length >= this.maxEquipped) {
        console.warn("[ArtifactSystem] Cannot equip artifact: max equipped artifact count reached.");
        return false;
      }

      artifact.equip(this.player);
      this.equipped[artifact.slot] = artifact;
      this.syncPlayerInventory();

      return true;
    }

    unequip(instanceIdOrArtifactId) {
      if (!this.player) {
        console.warn("[ArtifactSystem] Cannot unequip artifact: missing player.");
        return false;
      }

      const artifact = this.findArtifact(instanceIdOrArtifactId);

      if (!artifact) {
        return false;
      }

      artifact.unequip(this.player);

      if (this.equipped[artifact.slot] && this.equipped[artifact.slot].instanceId === artifact.instanceId) {
        delete this.equipped[artifact.slot];
      }

      this.syncPlayerInventory();

      return true;
    }

    toggleEquip(instanceIdOrArtifactId) {
      const artifact = this.findArtifact(instanceIdOrArtifactId);

      if (!artifact) {
        return false;
      }

      if (artifact.equipped) {
        return this.unequip(artifact.instanceId);
      }

      return this.equip(artifact.instanceId);
    }

    isSlotOccupied(slot) {
      return Boolean(this.equipped[String(slot).toLowerCase()]);
    }

    findArtifact(instanceIdOrArtifactId) {
      return this.findByInstanceId(instanceIdOrArtifactId) || this.findByArtifactId(instanceIdOrArtifactId);
    }

    findByInstanceId(instanceId) {
      const id = String(instanceId);
      return this.inventory.find((artifact) => String(artifact.instanceId) === id) || null;
    }

    findByArtifactId(artifactId) {
      const id = String(artifactId);
      return this.inventory.find((artifact) => String(artifact.id) === id || String(artifact.artifactId) === id) || null;
    }

    getEquippedArtifacts() {
      return Object.values(this.equipped);
    }

    getInventory() {
      return this.inventory.slice();
    }

    update(deltaTime, context = {}) {
      const dt = ArtifactSystem.normalizeDeltaTime(deltaTime);

      for (const artifact of this.inventory) {
        artifact.update(dt);
      }

      this.updateTemporaryModifiers(dt);
      this.updateProjectileModifiers(dt);

      if (context.eventName) {
        this.trigger(context.eventName, context);
      }
    }

    trigger(eventName, context = {}) {
      if (!this.player) {
        return [];
      }

      const results = [];

      for (const artifact of this.getEquippedArtifacts()) {
        const result = artifact.trigger(eventName, this.player, Object.assign({}, context, {
          player: this.player
        }));

        if (result) {
          results.push({
            artifact,
            result
          });
        }
      }

      return results;
    }

    updateTemporaryModifiers(deltaTime) {
      if (!this.player || !Array.isArray(this.temporaryModifiers) || this.temporaryModifiers.length === 0) {
        return;
      }

      for (const modifier of this.temporaryModifiers) {
        modifier.remaining -= deltaTime;

        if (modifier.remaining <= 0 && !modifier.removed) {
          ArtifactSystem.removeModifiersFromPlayer(this.player, modifier.modifiers, modifier.source);
          modifier.removed = true;
        }
      }

      this.temporaryModifiers = this.temporaryModifiers.filter((modifier) => !modifier.removed);
    }

    updateProjectileModifiers(deltaTime) {
      if (!this.player || !Array.isArray(this.player.artifactProjectileModifiers)) {
        return;
      }

      for (const entry of this.player.artifactProjectileModifiers) {
        entry.duration -= deltaTime;
      }

      this.player.artifactProjectileModifiers = this.player.artifactProjectileModifiers.filter((entry) => entry.duration > 0);
    }

    syncPlayerInventory() {
      if (!this.player) {
        return;
      }

      this.player.activeArtifacts = this.getEquippedArtifacts();
      this.player.inventory = this.inventory;
    }

    getTotalStatModifiers() {
      const merged = {};

      for (const artifact of this.getEquippedArtifacts()) {
        ArtifactSystem.mergeNumericModifiers(merged, artifact.getStatModifiers());
      }

      return merged;
    }

    getSaveData() {
      return {
        maxEquipped: this.maxEquipped,
        maxInventory: this.maxInventory,
        inventory: this.inventory.map((artifact) => artifact.getSaveData())
      };
    }

    loadSaveData(saveData) {
      if (!saveData || typeof saveData !== "object") {
        return;
      }

      for (const artifact of this.getEquippedArtifacts()) {
        artifact.unequip(this.player);
      }

      this.inventory = [];
      this.equipped = {};

      this.maxEquipped = Number(saveData.maxEquipped || this.maxEquipped);
      this.maxInventory = Number(saveData.maxInventory || this.maxInventory);

      if (Array.isArray(saveData.inventory)) {
        for (const artifactSave of saveData.inventory) {
          const artifact = Artifact.fromSaveData(artifactSave);
          artifact.equipped = false;
          this.inventory.push(artifact);
        }

        for (const artifactSave of saveData.inventory) {
          if (artifactSave.equipped) {
            this.equip(artifactSave.instanceId);
          }
        }
      }

      this.syncPlayerInventory();
    }

    static install(player, options = {}) {
      return new ArtifactSystem(player, options);
    }

    static applyModifiersToPlayer(player, modifiers, sourceId) {
      if (!player || !modifiers || typeof modifiers !== "object") {
        return;
      }

      if (!player._artifactModifiers) {
        player._artifactModifiers = {};
      }

      const source = String(sourceId || "unknown");
      player._artifactModifiers[source] = ArtifactSystem.cloneData(modifiers);

      for (const [stat, value] of Object.entries(modifiers)) {
        ArtifactSystem.applySingleModifier(player, stat, value);
      }

      ArtifactSystem.clampPlayerStats(player);
    }

    static removeModifiersFromPlayer(player, modifiers, sourceId) {
      if (!player || !modifiers || typeof modifiers !== "object") {
        return;
      }

      const source = String(sourceId || "unknown");

      for (const [stat, value] of Object.entries(modifiers)) {
        ArtifactSystem.applySingleModifier(player, stat, -Number(value || 0));
      }

      if (player._artifactModifiers) {
        delete player._artifactModifiers[source];
      }

      ArtifactSystem.clampPlayerStats(player);
    }

    static applyTemporaryModifiers(player, modifiers, duration, sourceId) {
      if (!player || !player.artifactSystem) {
        ArtifactSystem.applyModifiersToPlayer(player, modifiers, sourceId);
        return;
      }

      const source = `temporary_${sourceId}_${Date.now()}`;
      ArtifactSystem.applyModifiersToPlayer(player, modifiers, source);

      player.artifactSystem.temporaryModifiers.push({
        source,
        modifiers: ArtifactSystem.cloneData(modifiers),
        remaining: Number(duration || 1),
        removed: false
      });
    }

    static applySingleModifier(player, stat, value) {
      const numericValue = Number(value || 0);

      if (Number.isNaN(numericValue)) {
        return;
      }

      const statAliases = ArtifactSystem.getStatAliases(stat);

      for (const alias of statAliases) {
        if (typeof player[alias] === "number") {
          player[alias] += numericValue;
          return;
        }
      }

      player[stat] = (Number(player[stat]) || 0) + numericValue;
    }

    static getStatAliases(stat) {
      const key = String(stat);

      const aliases = {
        health: ["health", "hp"],
        hp: ["hp", "health"],
        maxHealth: ["maxHealth", "maxHp", "maxHP"],
        max_health: ["maxHealth", "maxHp", "maxHP"],
        maxHp: ["maxHp", "maxHealth", "maxHP"],
        damage: ["damage", "attack", "atk"],
        attack: ["attack", "damage", "atk"],
        atk: ["atk", "attack", "damage"],
        speed: ["speed", "moveSpeed", "move_speed"],
        moveSpeed: ["moveSpeed", "speed", "move_speed"],
        defense: ["defense", "def", "armor"],
        def: ["def", "defense", "armor"],
        armor: ["armor", "defense", "def"],
        fireRate: ["fireRate", "fire_rate", "attackSpeed"],
        fire_rate: ["fireRate", "fire_rate", "attackSpeed"],
        attackSpeed: ["attackSpeed", "fireRate", "fire_rate"],
        critChance: ["critChance", "crit_chance"],
        crit_chance: ["critChance", "crit_chance"],
        critDamage: ["critDamage", "crit_damage"],
        crit_damage: ["critDamage", "crit_damage"],
        maxEquippedArtifacts: ["maxEquippedArtifacts"],
        luck: ["luck"],
        pickupRange: ["pickupRange", "pickup_range"]
      };

      return aliases[key] || [key];
    }

    static clampPlayerStats(player) {
      if (!player) {
        return;
      }

      const maxHealth = player.maxHealth ?? player.maxHp ?? player.maxHP;

      if (typeof maxHealth === "number") {
        if (typeof player.health === "number") {
          player.health = Math.max(0, Math.min(player.health, maxHealth));
        }

        if (typeof player.hp === "number") {
          player.hp = Math.max(0, Math.min(player.hp, maxHealth));
        }
      }

      const nonNegativeStats = [
        "speed",
        "moveSpeed",
        "damage",
        "attack",
        "atk",
        "defense",
        "def",
        "armor",
        "fireRate",
        "attackSpeed",
        "critChance",
        "critDamage",
        "pickupRange"
      ];

      for (const stat of nonNegativeStats) {
        if (typeof player[stat] === "number") {
          player[stat] = Math.max(0, player[stat]);
        }
      }
    }

    static mergeNumericModifiers(target, source) {
      if (!source || typeof source !== "object") {
        return target;
      }

      for (const [key, value] of Object.entries(source)) {
        const numeric = Number(value);

        if (Number.isNaN(numeric)) {
          target[key] = value;
        } else {
          target[key] = (Number(target[key]) || 0) + numeric;
        }
      }

      return target;
    }

    static resolveId(data) {
      if (!data || typeof data !== "object") {
        return null;
      }

      return (
        data.id ??
        data.key ??
        data.slug ??
        data.name ??
        data.artifactId ??
        data.artifact_id ??
        null
      );
    }

    static getRarityMultiplier(rarity) {
      const multipliers = {
        common: 1,
        uncommon: 1.15,
        rare: 1.35,
        epic: 1.65,
        legendary: 2,
        mythic: 2.4
      };

      return multipliers[String(rarity).toLowerCase()] || 1;
    }

    static resolveScaledValue(value, level, rarity) {
      const base = Number(value || 0);
      const levelBonus = Math.max(0, Number(level || 1) - 1);
      const rarityMultiplier = ArtifactSystem.getRarityMultiplier(rarity);
      return Math.ceil((base + levelBonus) * rarityMultiplier);
    }

    static normalizeDeltaTime(deltaTime) {
      const dt = Number(deltaTime || 0);

      if (dt > 5) {
        return dt / 1000;
      }

      return dt;
    }

    static cloneData(data) {
      if (data === null || data === undefined) {
        return data;
      }

      try {
        return JSON.parse(JSON.stringify(data));
      } catch (error) {
        console.warn("[ArtifactSystem] Could not clone data. Returning original object.", error);
        return data;
      }
    }
  }

  window.Artifact = Artifact;
  window.ArtifactSystem = ArtifactSystem;
})();