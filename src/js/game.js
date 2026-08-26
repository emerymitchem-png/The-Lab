// game.js - Main game loop and state management

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this._resizeCanvas();

        this.player = null;
        this.currentFloor = 1;
        this.currentRoom = 1;
        this.currentRoomObject = null;
        this.floorMap = null;

        this.gameState = 'menu';
        this.isPaused = false;
        this.startTime = 0;
        this.elapsedTime = 0;
        this.transitioning = false;

        this.stats = {
            floorsReached: 1,
            roomsCleared: 0,
            enemiesKilled: 0,
            totalCoins: 0,
            startTime: Date.now()
        };

        this.setupEventListeners();
    }

    _resizeCanvas() {
        const wrap = document.getElementById('canvas-wrap');
        this.canvas.width  = wrap ? wrap.clientWidth  : window.innerWidth;
        this.canvas.height = wrap ? wrap.clientHeight : window.innerHeight - 44;
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.togglePause();
        });

        window.addEventListener('resize', () => {
            this._resizeCanvas();
            if (this.currentRoomObject && this.floorMap) {
                this.generateRoom();
            }
        });
    }

    start() {
        console.log("Game starting...");
        this.gameState = 'playing';
        this.isPaused = false;
        this.transitioning = false;
        this.startTime = Date.now();
        this.initializeGame();
        this.animate(0);
    }

    initializeGame() {
        this.currentFloor = 1;
        this.currentRoom = 1;

        // Build the floor map (planned room sequence)
        this.floorMap = new FloorMap(this.currentFloor);

        // Initialize player at center of canvas
        this.player = new Player(
            this.canvas.width / 2,
            this.canvas.height / 2,
            this.canvas
        );

        this.generateRoom();
    }

    generateRoom(entryDir = 'left') {
        this.currentRoomObject = new Room(
            this.currentFloor,
            this.currentRoom,
            this.floorMap,
            this.canvas
        );

        // Spawn player near the wall they entered from
        const b = this.currentRoomObject.bounds;
        const midY = b.y + b.height / 2 - this.player.height / 2;
        const midX = b.x + b.width  / 2 - this.player.width  / 2;
        const INSET = 70;
        if (entryDir === 'left') {
            this.player.x = b.x + INSET;
            this.player.y = midY;
        } else if (entryDir === 'right') {
            this.player.x = b.x + b.width - INSET - this.player.width;
            this.player.y = midY;
        } else if (entryDir === 'top') {
            this.player.x = midX;
            this.player.y = b.y + INSET;
        } else { // bottom
            this.player.x = midX;
            this.player.y = b.y + b.height - INSET - this.player.height;
        }

        this.transitioning = false;
        console.log(`Floor ${this.currentFloor} | Room ${this.currentRoom}/${this.floorMap.totalRooms} | Type: ${this.floorMap.typeAt(this.currentRoom)} | Entry: ${entryDir}`);
    }

    nextRoom(exitDir = 'right') {
        if (this.transitioning) return;
        this.transitioning = true;
        this.stats.roomsCleared++;

        // Player enters next room from the mirrored side
        const opposites = { right: 'right', left: 'left', top: 'bottom', bottom: 'top' };
        const entryDir = opposites[exitDir] ?? 'left';

        if (this.currentRoom < this.floorMap.totalRooms) {
            this.currentRoom++;
            this.generateRoom(entryDir);
        } else {
            this.nextFloor();
        }
    }

    nextFloor() {
        if (this.currentFloor < 5) {
            this.currentFloor++;
            this.currentRoom = 1;
            this.stats.floorsReached = this.currentFloor;
            this.floorMap = new FloorMap(this.currentFloor);
            this.generateRoom('left');
        } else {
            this.victory();
        }
    }

    update(deltaTime) {
        if (this.gameState === 'menu') return;
        if (this.isPaused) return;

        // Update player
        this.player.update(deltaTime);

        // Update current room
        if (this.currentRoomObject) {
            this.currentRoomObject.update(deltaTime, this.player);

            // Check if player died
            if (this.player.health <= 0) {
                this.gameOver();
                return;
            }

            // Transition: player walks into any open exit door
            if (!this.transitioning) {
                const exitDir = this.currentRoomObject.getExitDirection(this.player);
                if (exitDir) this.nextRoom(exitDir);
            }
        }

        // Update HUD
        uiManager.updateHUD(
            this.player,
            this.currentFloor,
            this.currentRoom,
            this.floorMap ? this.floorMap.totalRooms : 1
        );

        // Update elapsed time
        this.elapsedTime = (Date.now() - this.startTime) / 1000;
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0f1425';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw room (handles floor, walls, enemies)
        if (this.currentRoomObject) {
            this.currentRoomObject.draw(this.ctx);
        }

        // Draw player on top
        this.player.draw(this.ctx);

        // Draw debug info
        this.drawDebugInfo();
    }

    drawDebugInfo() {
        const room = this.currentRoomObject;
        this.ctx.fillStyle = '#00ff0088';
        this.ctx.font = '10px Courier New';
        this.ctx.fillText(`Floor ${this.currentFloor} | Room ${this.currentRoom}/${this.floorMap?.totalRooms ?? '?'} | Type: ${room?.roomType ?? '?'}`, 10, this.canvas.height - 10);
        this.ctx.fillText(`Player: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`, 10, this.canvas.height - 22);
        this.ctx.fillText(`Enemies: ${room?.enemies.length ?? 0} | Cleared: ${room?.cleared ?? false}`, 10, this.canvas.height - 34);
    }

    togglePause() {
        if (this.gameState === 'playing') {
            this.isPaused = !this.isPaused;
            if (this.isPaused) {
                uiManager.showPauseMenu();
            }
        }
    }

    gameOver() {
        this.gameState = 'gameover';
        this.stats.elapsedTime = this.elapsedTime;
        uiManager.showGameOver(this.stats);
        console.log("Game Over!", this.stats);
    }

    victory() {
        this.gameState = 'gameover';
        this.stats.elapsedTime = this.elapsedTime;
        uiManager.showGameOver(this.stats, true);
    }

    animate(lastTime) {
        const now = performance.now();
        const deltaTime = Math.min((now - lastTime) / 1000, 0.05); // cap at ~20fps minimum

        this.update(deltaTime);
        this.draw();

        if (this.gameState !== 'menu' && this.gameState !== 'gameover') {
            requestAnimationFrame((time) => this.animate(time));
        }
    }
}

// Initialize game when document loads
let game = null;

window.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM loaded, loading game data...");

    const dataLoaded = await gameLoader.loadAllData();

    if (!dataLoaded) {
        console.error("Failed to load game data");
        alert("Failed to load game data. Check console for errors.");
        return;
    }

    const canvas = document.getElementById('gameCanvas');
    game = new Game(canvas);

    window.gameReady   = false;
    window.gameRunning = false;
    window.gamePaused  = false;

    // Poll for start signal from ui.js button handler
    const checkForStart = setInterval(() => {
        if (window.gameReady) {
            window.gameReady = false;
            window.gameRunning = true;
            clearInterval(checkForStart);
            game.start();
        }
    }, 100);

    console.log("Game initialized and ready!");
});

// Pause via Escape key (ui.js also handles the menu button)
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.gameRunning && game) {
        if (window.gamePaused) {
            window.gamePaused = false;
            game.isPaused = false;
        } else {
            window.gamePaused = true;
            game.isPaused = true;
            uiManager.showPauseMenu();
        }
    }
});
