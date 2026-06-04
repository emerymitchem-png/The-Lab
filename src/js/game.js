// game.js - Main game loop and state management

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.canvas.width = window.innerWidth - 10;
        this.canvas.height = window.innerHeight - 10;

        this.player = null;
        this.currentFloor = 1;
        this.currentRoom = 1;
        this.currentRoomObject = null;
        this.totalRoomsPerFloor = 1; // Updated from floor data at room generation
        
        this.gameState = 'menu'; // menu, playing, paused, gameover
        this.isPaused = false;
        this.startTime = 0;
        this.elapsedTime = 0;
        
        // Stats tracking
        this.stats = {
            floorsReached: 1,
            roomsCleared: 0,
            enemiesKilled: 0,
            totalCoins: 0,
            startTime: Date.now()
        };

        this.setupEventListeners();
        this.gameLoop = this.update.bind(this);
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.togglePause();
        });

        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth - 10;
            this.canvas.height = window.innerHeight - 10;
        });
    }

    start() {
        console.log("Game starting...");
        this.gameState = 'playing';
        this.isPaused = false;
        this.startTime = Date.now();
        this.initializeGame();
        this.animate(0);
    }

    initializeGame() {
        // Initialize player
        this.player = new Player(
            this.canvas.width / 2,
            this.canvas.height / 2,
            this.canvas
        );

        // Generate first room
        this.generateRoom();
    }

    generateRoom() {
        const floorData = gameLoader.getFloorData(this.currentFloor);
        const configuredRoomCount = Number(floorData?.total_rooms);
        if (Number.isFinite(configuredRoomCount) && configuredRoomCount > 0) {
            this.totalRoomsPerFloor = configuredRoomCount;
        }

        this.currentRoomObject = new Room(
            this.currentFloor,
            this.currentRoom,
            this.totalRoomsPerFloor,
            this.canvas
        );

        console.log(`Generated Floor ${this.currentFloor}, Room ${this.currentRoom}/${this.totalRoomsPerFloor}`);
    }

    nextRoom() {
        if (this.currentRoom < this.totalRoomsPerFloor) {
            this.currentRoom++;
            this.stats.roomsCleared++;
            this.generateRoom();
        } else {
            this.nextFloor();
        }
    }

    nextFloor() {
        if (this.currentFloor < 5) {
            this.currentFloor++;
            this.currentRoom = 1;
            this.stats.floorsReached = this.currentFloor;
            this.generateRoom();
        } else {
            // Game victory!
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

            // Check if room is cleared
            if (this.currentRoomObject.isCleared()) {
                // Wait a moment before advancing
                setTimeout(() => {
                    if (this.gameState === 'playing') {
                        this.nextRoom();
                    }
                }, 500);
            }
        }

        // Update HUD
        uiManager.updateHUD(
            this.player,
            this.currentFloor,
            this.currentRoom,
            this.totalRoomsPerFloor
        );

        // Update elapsed time
        this.elapsedTime = (Date.now() - this.startTime) / 1000;
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0f1425';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw room
        if (this.currentRoomObject) {
            this.currentRoomObject.draw(this.ctx);
        }

        // Draw player
        this.player.draw(this.ctx);

        // Draw debug info
        this.drawDebugInfo();
    }

    drawDebugInfo() {
        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = '10px Courier';
        this.ctx.fillText(`FPS: ${Math.round(1000/16)}`, 10, this.canvas.height - 10);
        this.ctx.fillText(`Player Pos: ${Math.round(this.player.x)}, ${Math.round(this.player.y)}`, 10, this.canvas.height - 20);
        this.ctx.fillText(`Enemies: ${this.currentRoomObject.enemies.length}`, 10, this.canvas.height - 30);
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
        this.gameState = 'victory';
        alert("VICTORY! You defeated The Infinitum!");
        this.gameOver();
    }

    animate(lastTime) {
        const now = performance.now();
        const deltaTime = Math.min((now - lastTime) / 1000, 0.016); // Cap at 60fps

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
    
    // Load all game data first
    const dataLoaded = await gameLoader.loadAllData();
    
    if (!dataLoaded) {
        console.error("Failed to load game data");
        alert("Failed to load game data. Check console for errors.");
        return;
    }

    // Initialize game
    const canvas = document.getElementById('gameCanvas');
    game = new Game(canvas);

    // Handle start button
    window.gameReady = false;
    window.gameRunning = false;
    window.gamePaused = false;

    // Poll for start signal from UI
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

// Handle pause signal from UI
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
