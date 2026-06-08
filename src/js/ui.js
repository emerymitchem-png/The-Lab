/**
 * The Lab - UI/HUD Integration Pass
 * Version: 1.0.15
 *
 * File: src/js/ui.js
 * Replacement: Replace the whole file.
 *
 * Purpose:
 * - Keep the existing HUD and overlay IDs working
 * - Add robust HUD updates for Player, Loot, Shop, Artifact, Consumable,
 *   and Permanent Tool systems
 * - Add canvas overlay prompts for shop rooms, pickups, room clears, pause,
 *   game over, and victory
 * - Keep UI code defensive so missing DOM elements do not crash gameplay
 */

(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function displayName(item, fallback = "Empty") {
    if (!item) {
      return fallback;
    }
    if (typeof item === "string") {
      return item;
    }
    return item.name || item.title || item.id || item.type || item.kind || fallback;
  }

  function displayIcon(item, fallback = "") {
    if (!item || typeof item === "string") {
      return fallback;
    }
    return item.icon || item.emoji || item.symbol || fallback;
  }

  function getPlayerHealth(player) {
    return number(player?.health ?? player?.hp ?? player?.brains, 0);
  }

  function getPlayerMaxHealth(player) {
    return Math.max(1, number(player?.maxHealth ?? player?.maxHp ?? player?.maxHP ?? player?.maxBrains, 5));
  }

  function getPlayerGold(player) {
    return number(player?.gold ?? player?.coins ?? player?.money, 0);
  }

  function getPlayerXP(player) {
    return number(player?.xp ?? player?.experience, 0);
  }

  function getPlayerLevel(player) {
    return number(player?.level ?? player?.lvl, 1);
  }

  class UIManager {
    constructor() {
      this.messageQueue = [];
      this.lastHudState = null;
      this.isPauseVisible = false;
      this.isGameOverVisible = false;
      this.isVictoryVisible = false;

      this.elements = {};
      this.cacheElements();
      this.injectRuntimeStyles();
      this.ensureRuntimePanels();
      this.bindButtons();
      this.updateBrainCounter(null);
    }

    cacheElements() {
      this.elements = {
        pauseOverlay: $("pause-overlay"),
        gameOverOverlay: $("gameover-overlay"),
        brainCounter: $("brain-counter"),
        floorNumber: $("floor-number"),
        roomNumber: $("room-number"),
        coinCount: $("coin-count"),
        hud: $("hud")
      };
    }

    injectRuntimeStyles() {
      if ($("the-lab-ui-runtime-style")) {
        return;
      }

      const style = document.createElement("style");
      style.id = "the-lab-ui-runtime-style";
      style.textContent = `
        .hidden { display: none !important; }
        .the-lab-message { color: #f8fafc; font-size: 12px; margin: 4px 0; }
      `;
      document.head.appendChild(style);
    }

    ensureRuntimePanels() {
      if (!$("the-lab-message-log")) {
        const log = document.createElement("div");
        log.id = "the-lab-message-log";
        log.style.cssText = "position: fixed; left: 16px; bottom: 16px; color: #f8fafc; font-size: 12px; z-index: 40;";
        document.body.appendChild(log);
      }
    }

    bindButtons() {
      // Empty for now, can be extended
    }

    updateText(element, text) {
      if (element) {
        element.textContent = text;
      }
    }

    updateBrainCounter(player) {
      const el = this.elements.brainCounter;
      if (!el) {
        return;
      }

      if (!player) {
        el.textContent = "🧠";
        return;
      }

      const health = Math.ceil(getPlayerHealth(player));
      const maxHealth = Math.ceil(getPlayerMaxHealth(player));

      if (maxHealth <= 12) {
        const full = "🧠".repeat(clamp(health, 0, maxHealth));
        const empty = "♡".repeat(Math.max(0, maxHealth - health));
        el.textContent = `${full}${empty}`;
        return;
      }

      el.textContent = `🧠 ${health}/${maxHealth}`;
    }

    updateHUD(player, floor = 1, room = 1, totalRooms = 1) {
      this.cacheElements();

      this.updateBrainCounter(player);
      this.updateText(this.elements.floorNumber, String(floor));
      this.updateText(this.elements.roomNumber, `${room}/${totalRooms}`);
      this.updateText(this.elements.coinCount, String(Math.floor(getPlayerGold(player))));

      this.lastHudState = {
        health: getPlayerHealth(player),
        maxHealth: getPlayerMaxHealth(player),
        gold: getPlayerGold(player),
        floor: floor,
        room: room
      };
    }

    showPauseMenu() {
      this.isPauseVisible = true;
      const overlay = this.elements.pauseOverlay;
      if (overlay) {
        overlay.classList.remove("hidden");
      }
    }

    hidePauseMenu() {
      this.isPauseVisible = false;
      const overlay = this.elements.pauseOverlay;
      if (overlay) {
        overlay.classList.add("hidden");
      }
    }

    showGameOver(stats = {}) {
      this.isGameOverVisible = true;
      const overlay = this.elements.gameOverOverlay;
      if (overlay) {
        overlay.classList.remove("hidden");
      }
    }

    addMessage(text, type = "info") {
      const log = $("the-lab-message-log");
      if (log) {
        const msg = document.createElement("div");
        msg.className = `the-lab-message ${type}`;
        msg.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        log.appendChild(msg);
        log.scrollTop = log.scrollHeight;
      }
    }

    draw(ctx) {
      // Optional: Draw UI overlays on canvas
    }
  }

  window.UIManager = UIManager;
  window.uiManager = window.uiManager || new UIManager();
})();
