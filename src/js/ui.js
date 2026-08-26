// ui.js - UI manager: HUD, menus, pause, game over, notifications

const uiManager = {
    // ── HUD ─────────────────────────────────────────────────────────────────

    updateHUD(player, floor, room, totalRooms) {
        // Health brains
        const brainEl = document.getElementById('brain-counter');
        if (brainEl) {
            brainEl.innerHTML = '';
            for (let i = 0; i < player.maxHealth; i++) {
                const span = document.createElement('span');
                span.className = 'brain-icon' + (i < player.health ? '' : ' empty');
                span.textContent = '🧠';
                brainEl.appendChild(span);
            }
        }

        const floorEl = document.getElementById('floor-number');
        if (floorEl) floorEl.textContent = floor;

        const roomEl = document.getElementById('room-number');
        if (roomEl) roomEl.textContent = `${room}/${totalRooms}`;

        const coinEl = document.getElementById('coin-count');
        if (coinEl) coinEl.textContent = player.coins ?? 0;

        // Weapon slots
        const slot1 = document.getElementById('slot-1');
        const slot2 = document.getElementById('slot-2');
        if (slot1) {
            if (player.weaponSlot1) {
                slot1.textContent = `${player.weaponSlot1.icon ?? ''} ${player.weaponSlot1.name}`;
                slot1.classList.add('equipped');
            } else {
                slot1.textContent = 'Empty';
                slot1.classList.remove('equipped');
            }
        }
        if (slot2) {
            if (player.weaponSlot2) {
                slot2.textContent = `${player.weaponSlot2.icon ?? ''} ${player.weaponSlot2.name}`;
                slot2.classList.add('equipped');
            } else {
                slot2.textContent = 'Empty';
                slot2.classList.remove('equipped');
            }
        }
    },

    // ── Pause ────────────────────────────────────────────────────────────────

    showPauseMenu() {
        document.getElementById('pause-overlay')?.classList.remove('hidden');
    },

    hidePauseMenu() {
        document.getElementById('pause-overlay')?.classList.add('hidden');
    },

    // ── Game Over / Victory ──────────────────────────────────────────────────

    showGameOver(stats, isVictory = false) {
        const overlay = document.getElementById('gameover-overlay');
        const title   = document.getElementById('gameover-title');
        if (!overlay || !title) return;

        title.textContent = isVictory ? 'VICTORY!' : 'GAME OVER';
        title.className   = isVictory ? 'victory' : '';

        const floors = document.getElementById('gameover-floors');
        const rooms  = document.getElementById('gameover-rooms');
        const time   = document.getElementById('gameover-time');

        if (floors) floors.innerHTML = `Floors Reached: <span>${stats.floorsReached ?? 1}</span>`;
        if (rooms)  rooms.innerHTML  = `Rooms Cleared: <span>${stats.roomsCleared ?? 0}</span>`;
        if (time) {
            const secs = Math.round(stats.elapsedTime ?? 0);
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            time.innerHTML = `Time: <span>${m}:${String(s).padStart(2, '0')}</span>`;
        }

        overlay.classList.remove('hidden');
    },

    // ── Codex ────────────────────────────────────────────────────────────────

    showCodex() {
        this.populateCodex();
        document.getElementById('codex-overlay')?.classList.remove('hidden');
    },

    hideCodex() {
        document.getElementById('codex-overlay')?.classList.add('hidden');
    },

    populateCodex() {
        // Specializations
        const specsEl = document.getElementById('codex-specs');
        if (specsEl) {
            specsEl.innerHTML = '';
            const specs = gameLoader.getAllSpecializations();
            specs.forEach(s => {
                const div = document.createElement('div');
                div.className = 'codex-entry';
                div.innerHTML = `
                    <span class="icon">${s.icon ?? '🔬'}</span>
                    <div>
                        <div class="name">${s.name}</div>
                        <div class="desc">${s.description ?? s.projectile_type ?? ''}</div>
                    </div>`;
                specsEl.appendChild(div);
            });
        }

        // Artifacts
        const artifactsEl = document.getElementById('codex-artifacts');
        if (artifactsEl) {
            artifactsEl.innerHTML = '';
            const artifacts = gameLoader.getAllArtifacts();
            artifacts.forEach(a => {
                const div = document.createElement('div');
                div.className = 'codex-entry';
                div.innerHTML = `
                    <span class="icon">${a.icon ?? '🔧'}</span>
                    <div>
                        <div class="name">${a.name}</div>
                        <div class="desc">${a.effect ?? a.description ?? ''}</div>
                    </div>`;
                artifactsEl.appendChild(div);
            });
        }
    },

    // ── Notifications ────────────────────────────────────────────────────────

    showNotification(message) {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            document.getElementById('ui-container')?.appendChild(container);
        }
        const el = document.createElement('div');
        el.className = 'notification';
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    },

    // ── Setup button handlers ─────────────────────────────────────────────────

    init() {
        // Main menu
        document.getElementById('start-button')?.addEventListener('click', () => {
            document.getElementById('menu-overlay')?.classList.add('hidden');
            window.gameReady = true;
        });

        document.getElementById('codex-button')?.addEventListener('click', () => {
            this.showCodex();
        });

        document.getElementById('settings-button')?.addEventListener('click', () => {
            this.showNotification('Settings coming soon');
        });

        // Pause menu
        document.getElementById('resume-button')?.addEventListener('click', () => {
            this.hidePauseMenu();
            if (game) {
                game.isPaused = false;
                window.gamePaused = false;
            }
        });

        document.getElementById('codex-pause-button')?.addEventListener('click', () => {
            this.showCodex();
        });

        document.getElementById('quit-button')?.addEventListener('click', () => {
            this.hidePauseMenu();
            if (game) {
                game.gameState = 'menu';
                game.isPaused = false;
                window.gamePaused = false;
                window.gameRunning = false;
            }
            document.getElementById('menu-overlay')?.classList.remove('hidden');
        });

        // Codex close
        document.getElementById('close-codex-button')?.addEventListener('click', () => {
            this.hideCodex();
        });

        // Game Over buttons
        document.getElementById('retry-button')?.addEventListener('click', () => {
            document.getElementById('gameover-overlay')?.classList.add('hidden');
            if (game) {
                game.gameState = 'playing';
                game.currentFloor = 1;
                game.currentRoom = 1;
                game.totalRoomsPerFloor = 1;
                game.stats = { floorsReached: 1, roomsCleared: 0, enemiesKilled: 0, totalCoins: 0, startTime: Date.now() };
                game.start();
            }
        });

        document.getElementById('menu-button')?.addEventListener('click', () => {
            document.getElementById('gameover-overlay')?.classList.add('hidden');
            document.getElementById('menu-overlay')?.classList.remove('hidden');
            window.gameRunning = false;
        });
    },
};

// Auto-init once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    uiManager.init();
});
