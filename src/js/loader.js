/**
 * The Lab - GameLoader
 * Version: 1.0.1
 *
 * File: src/js/loader.js
 * Purpose:
 * - Load all core JSON configuration files from /docs
 * - Normalize common data shapes into lookup maps
 * - Provide safe getter methods for other game systems
 *
 * Load order note:
 * - This file should be loaded before player.js, enemy.js, room.js, ui.js, and game.js.
 * - It attaches GameLoader and gameLoader to window for vanilla script-tag usage.
 */

(function () {
  "use strict";

  class GameLoader {
    constructor(options = {}) {
      this.basePath = options.basePath || "docs";

      this.files = {
        specializations: "specializations.json",
        enemies: "enemies.json",
        floors: "floors.json",
        artifacts: "artifacts.json",
        consumables: "consumables.json",
        permanentTools: "permanent_tools.json",
        shopEconomy: "shop_economy.json",
        statsSystem: "stats_system.json",
        gameLoop: "game_loop.json",
        assetList: "asset_list.json"
      };

      this.data = {
        specializations: null,
        enemies: null,
        floors: null,
        artifacts: null,
        consumables: null,
        permanentTools: null,
        shopEconomy: null,
        statsSystem: null,
        gameLoop: null,
        assetList: null
      };

      this.indexes = {
        specializationsById: {},
        enemiesById: {},
        floorsByNumber: {},
        artifactsById: {},
        consumablesById: {},
        permanentToolsById: {}
      };

      this.loaded = false;
      this.loading = false;
      this.errors = [];
    }

    async loadAllData() {
      if (this.loaded) {
        console.info("[GameLoader] Data already loaded.");
        return this.data;
      }

      if (this.loading) {
        console.warn("[GameLoader] loadAllData() was called while loading is already in progress.");
      }

      this.loading = true;
      this.errors = [];

      console.info("[GameLoader] Loading game data...");

      const entries = Object.entries(this.files);
      const results = await Promise.all(
        entries.map(async ([key, fileName]) => {
          try {
            const json = await this.loadJSON(fileName);
            this.data[key] = json;
            console.info(`[GameLoader] Loaded ${fileName}`);
            return { key, fileName, ok: true, data: json };
          } catch (error) {
            const message = `[GameLoader] Failed to load ${fileName}: ${error.message}`;
            console.error(message, error);
            this.errors.push({
              key,
              fileName,
              message,
              error
            });
            this.data[key] = null;
            return { key, fileName, ok: false, error };
          }
        })
      );

      const failed = results.filter((result) => !result.ok);

      if (failed.length > 0) {
        this.loading = false;
        const failedFiles = failed.map((result) => result.fileName).join(", ");
        throw new Error(`[GameLoader] Could not load required game data files: ${failedFiles}`);
      }

      this.buildIndexes();

      this.loaded = true;
      this.loading = false;

      console.info("[GameLoader] All game data loaded successfully.");
      return this.data;
    }

    async loadJSON(fileName) {
      const url = `${this.basePath}/${fileName}`;

      let response;

      try {
        response = await fetch(url, {
          method: "GET",
          headers: {
            "Accept": "application/json"
          },
          cache: "no-cache"
        });
      } catch (networkError) {
        throw new Error(`Network error while fetching ${url}: ${networkError.message}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} while fetching ${url}`);
      }

      try {
        return await response.json();
      } catch (parseError) {
        throw new Error(`Invalid JSON in ${url}: ${parseError.message}`);
      }
    }

    buildIndexes() {
      this.indexes.specializationsById = this.createIdIndex(this.extractList(this.data.specializations));
      this.indexes.enemiesById = this.createIdIndex(this.extractList(this.data.enemies));
      this.indexes.floorsByNumber = this.createFloorIndex(this.extractList(this.data.floors));
      this.indexes.artifactsById = this.createIdIndex(this.extractList(this.data.artifacts));
      this.indexes.consumablesById = this.createIdIndex(this.extractList(this.data.consumables));
      this.indexes.permanentToolsById = this.createIdIndex(this.extractList(this.data.permanentTools));

      console.info("[GameLoader] Indexes built:", {
        specializations: Object.keys(this.indexes.specializationsById).length,
        enemies: Object.keys(this.indexes.enemiesById).length,
        floors: Object.keys(this.indexes.floorsByNumber).length,
        artifacts: Object.keys(this.indexes.artifactsById).length,
        consumables: Object.keys(this.indexes.consumablesById).length,
        permanentTools: Object.keys(this.indexes.permanentToolsById).length
      });
    }

    extractList(rawData) {
      if (!rawData) {
        return [];
      }

      if (Array.isArray(rawData)) {
        return rawData;
      }

      const likelyListKeys = [
        "items",
        "data",
        "list",
        "entries",
        "specializations",
        "enemies",
        "floors",
        "artifacts",
        "consumables",
        "permanent_tools",
        "permanentTools",
        "tools",
        "base_fields_34",
        "enemy_system"
      ];

      for (const key of likelyListKeys) {
        if (Array.isArray(rawData[key])) {
          return rawData[key];
        }
      }

      const objectValues = Object.values(rawData);

      if (objectValues.length > 0 && objectValues.every((value) => value && typeof value === "object" && !Array.isArray(value))) {
        return objectValues;
      }

      return [];
    }

    createIdIndex(list) {
      const index = {};

      for (const item of list) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const id = this.resolveId(item);

        if (!id) {
          console.warn("[GameLoader] Skipping item without id:", item);
          continue;
        }

        index[String(id)] = item;
      }

      return index;
    }

    createFloorIndex(list) {
      const index = {};

      for (const floor of list) {
        if (!floor || typeof floor !== "object") {
          continue;
        }

        const floorNumber = this.resolveFloorNumber(floor);

        if (floorNumber === null || floorNumber === undefined || Number.isNaN(Number(floorNumber))) {
          console.warn("[GameLoader] Skipping floor without floor number:", floor);
          continue;
        }

        index[String(floorNumber)] = floor;
      }

      return index;
    }

    resolveId(item) {
      return (
        item.id ??
        item.key ??
        item.slug ??
        item.name ??
        item.enemyId ??
        item.enemy_id ??
        item.artifactId ??
        item.artifact_id ??
        item.specializationId ??
        item.specialization_id ??
        item.consumableId ??
        item.consumable_id ??
        item.toolId ??
        item.tool_id ??
        null
      );
    }

    resolveFloorNumber(floor) {
      return (
        floor.floorNumber ??
        floor.floor_number ??
        floor.number ??
        floor.floor ??
        floor.id ??
        null
      );
    }

    requireLoaded(methodName) {
      if (!this.loaded) {
        console.warn(`[GameLoader] ${methodName} called before data finished loading.`);
      }
    }

    getSpecialization(id) {
      this.requireLoaded("getSpecialization");

      const key = String(id);
      const specialization = this.indexes.specializationsById[key] || null;

      if (!specialization) {
        console.warn(`[GameLoader] Specialization not found: ${id}`);
      }

      return specialization;
    }

    getEnemy(id) {
      this.requireLoaded("getEnemy");

      const key = String(id);
      const enemy = this.indexes.enemiesById[key] || null;

      if (!enemy) {
        console.warn(`[GameLoader] Enemy not found: ${id}`);
      }

      return enemy;
    }

    getFloorData(floorNumber) {
      this.requireLoaded("getFloorData");

      const key = String(floorNumber);
      const floor = this.indexes.floorsByNumber[key] || null;

      if (!floor) {
        console.warn(`[GameLoader] Floor data not found: ${floorNumber}`);
      }

      return floor;
    }

    getArtifact(id) {
      this.requireLoaded("getArtifact");

      const key = String(id);
      const artifact = this.indexes.artifactsById[key] || null;

      if (!artifact) {
        console.warn(`[GameLoader] Artifact not found: ${id}`);
      }

      return artifact;
    }

    getShopData(floor) {
      this.requireLoaded("getShopData");

      const shopData = this.data.shopEconomy;

      if (!shopData) {
        console.warn("[GameLoader] Shop economy data is missing.");
        return null;
      }

      const floorKey = String(floor);

      if (shopData.byFloor && shopData.byFloor[floorKey]) {
        return shopData.byFloor[floorKey];
      }

      if (shopData.floors && shopData.floors[floorKey]) {
        return shopData.floors[floorKey];
      }

      if (Array.isArray(shopData.floors)) {
        const found = shopData.floors.find((entry) => {
          const entryFloor = entry.floorNumber ?? entry.floor_number ?? entry.number ?? entry.floor ?? entry.id;
          return String(entryFloor) === floorKey;
        });

        if (found) {
          return found;
        }
      }

      if (Array.isArray(shopData.shopByFloor)) {
        const found = shopData.shopByFloor.find((entry) => {
          const entryFloor = entry.floorNumber ?? entry.floor_number ?? entry.number ?? entry.floor ?? entry.id;
          return String(entryFloor) === floorKey;
        });

        if (found) {
          return found;
        }
      }

      if (shopData.default) {
        return shopData.default;
      }

      console.warn(`[GameLoader] Shop data not found for floor: ${floor}`);
      return shopData;
    }

    getConsumable(id) {
      this.requireLoaded("getConsumable");

      const key = String(id);
      const consumable = this.indexes.consumablesById[key] || null;

      if (!consumable) {
        console.warn(`[GameLoader] Consumable not found: ${id}`);
      }

      return consumable;
    }

    getPermanentTool(id) {
      this.requireLoaded("getPermanentTool");

      const key = String(id);
      const tool = this.indexes.permanentToolsById[key] || null;

      if (!tool) {
        console.warn(`[GameLoader] Permanent tool not found: ${id}`);
      }

      return tool;
    }

    getStatsSystem() {
      this.requireLoaded("getStatsSystem");
      return this.data.statsSystem;
    }

    getGameLoopData() {
      this.requireLoaded("getGameLoopData");
      return this.data.gameLoop;
    }

    getAssetList() {
      this.requireLoaded("getAssetList");
      return this.data.assetList;
    }

    getAllSpecializations() {
      this.requireLoaded("getAllSpecializations");
      return this.extractList(this.data.specializations);
    }

    getAllEnemies() {
      this.requireLoaded("getAllEnemies");
      return this.extractList(this.data.enemies);
    }

    getAllFloors() {
      this.requireLoaded("getAllFloors");
      return this.extractList(this.data.floors);
    }

    getAllArtifacts() {
      this.requireLoaded("getAllArtifacts");
      return this.extractList(this.data.artifacts);
    }

    getAllConsumables() {
      this.requireLoaded("getAllConsumables");
      return this.extractList(this.data.consumables);
    }

    getAllPermanentTools() {
      this.requireLoaded("getAllPermanentTools");
      return this.extractList(this.data.permanentTools);
    }

    hasErrors() {
      return this.errors.length > 0;
    }

    getErrors() {
      return this.errors.slice();
    }

    isLoaded() {
      return this.loaded;
    }
  }

  window.GameLoader = GameLoader;
  window.gameLoader = new GameLoader({
    basePath: "docs"
  });
})();
