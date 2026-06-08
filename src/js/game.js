// game.js - Main game loop and state management
// Version: 1.0.20 - Render Recovery Game Loop
// Purpose: Prove rendering and controls work before full roguelite integration

class Player {
    constructor(x, y, canvas) {
        this.x = x;
        this.y = y;
        this.canvas = canvas;
        this.width = 20;
        this.height = 20;
        this.speed = 200; // pixels per second
        this.health = 100;
        this.maxHealth = 100;
        
        // Input state
        this.keys = {};
        this.mouse = { x: canvas.width / 2, y: canvas.height / 2 };
        this.mouseDown = false;
        
        // Projectiles
        this.projectiles = [];
        this.fireRate = 0.15; // seconds between shots
        this.lastFireTime = 0;
        
        this.setupInputListeners();
    }
    
    setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') e.preventDefault();
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            this.mouseDown = false;
        });
    }
    
    update(dt) {
        // Movement
        let dx = 0, dy = 0;
        
        if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
        
        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707; // 1/sqrt(2)
            dy *= 0.707;
        }
        
        this.x += dx * this.speed * dt;
        this.y += dy * this.speed * dt;
        
        // Clamp to canvas
        this.x = Math.max(this.width, Math.min(this.canvas.width - this.width, this.x));
        this.y = Math.max(this.height, Math.min(this.canvas.height - this.height, this.y));
        
        // Auto-fire
        if (this.mouseDown || this.keys['Space']) {
            this.lastFireTime += dt;
            if (this.lastFireTime >= this.fireRate) {
                this.fire();
                this.lastFireTime = 0;
            }
        } else {
            this.lastFireTime = 0;
        }
        
        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.x += proj.vx * dt;
            proj.y += proj.vy * dt;
            
            // Remove if off-screen
            if (proj.x < 0 || proj.x > this.canvas.width || 
                proj.y < 0 || proj.y > this.canvas.height) {
                this.projectiles.splice(i, 1);
            }
        }
    }
    
    fire() {
        const dx = this.mouse.x - this.x;
        const dy = this.mouse.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        
        const speed = 400;
        this.projectiles.push({
            x: this.x,
            y: this.y,
            vx: (dx / len) * speed,
            vy: (dy / len) * speed,
            radius: 4
        });
    }
    
    draw(ctx) {
        // Draw player
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        
        // Draw aim line
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.mouse.x, this.mouse.y);
        ctx.stroke();
        
        // Draw projectiles
        ctx.fillStyle = '#f97316';
        for (const proj of this.projectiles) {
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw HUD
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '14px system-ui';
        ctx.fillText(`Health: ${this.health}/${this.maxHealth}`, 10, 20);
        ctx.fillText(`Pos: ${Math.round(this.x)}, ${Math.round(this.y)}`, 10, 40);
        ctx.fillText(`Projectiles: ${this.projectiles.length}`, 10, 60);
    }
}

class SimpleEnemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 16;
        this.height = 16;
        this.health = 10;
        this.maxHealth = 10;
        this.speed = 80;
    }
    
    update(dt, player) {
        // Move toward player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        
        this.x += (dx / len) * this.speed * dt;
        this.y += (dy / len) * this.speed * dt;
    }
    
    draw(ctx) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        
        // Health bar
        ctx.fillStyle = '#22c55e';
        const barWidth = 20;
        const barHeight = 2;
        const healthPercent = this.health / this.maxHealth;
        ctx.fillRect(this.x - barWidth / 2, this.y - this.height / 2 - 6, barWidth * healthPercent, barHeight);
    }
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Responsive canvas
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.player = new Player(this.canvas.width / 2, this.canvas.height / 2, this.canvas);
        this.enemies = [];
        this.gameState = 'playing';
        this.time = 0;
        this.spawnTimer = 0;
        
        // Spawn initial enemies
        this.spawnEnemy();
        
        console.log('🎮 Render recovered — real canvas loop is active');
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth - 20;
        this.canvas.height = window.innerHeight - 20;
    }
    
    spawnEnemy() {
        const angle = Math.random() * Math.PI * 2;
        const distance = 150;
        const x = this.canvas.width / 2 + Math.cos(angle) * distance;
        const y = this.canvas.height / 2 + Math.sin(angle) * distance;
        this.enemies.push(new SimpleEnemy(x, y));
    }
    
    update(dt) {
        this.player.update(dt);
        
        // Update enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            this.enemies[i].update(dt, this.player);
        }
        
        // Check projectile-enemy collisions
        for (let i = this.player.projectiles.length - 1; i >= 0; i--) {
            const proj = this.player.projectiles[i];
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const dx = proj.x - enemy.x;
                const dy = proj.y - enemy.y;
                const dist = Math.hypot(dx, dy);
                
                if (dist < proj.radius + enemy.width / 2) {
                    enemy.health -= 10;
                    this.player.projectiles.splice(i, 1);
                    
                    if (enemy.health <= 0) {
                        this.enemies.splice(j, 1);
                    }
                    break;
                }
            }
        }
        
        // Spawn new enemies
        this.spawnTimer += dt;
        if (this.spawnTimer > 2 && this.enemies.length < 5) {
            this.spawnEnemy();
            this.spawnTimer = 0;
        }
        
        this.time += dt;
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#020617';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        
        // Draw game objects
        this.player.draw(this.ctx);
        
        for (const enemy of this.enemies) {
            enemy.draw(this.ctx);
        }
        
        // Draw enemy count
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.font = 'bold 16px system-ui';
        this.ctx.fillText(`Enemies: ${this.enemies.length}`, this.canvas.width - 150, 30);
    }
    
    animate() {
        const loop = (now) => {
            const dt = Math.min(0.016, (now - (this.lastTime || now)) / 1000);
            this.lastTime = now;
            
            this.update(dt);
            this.draw();
            
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }
}

// Global game instance
let game = null;

// Entry point - called by index.html
function startGame(options) {
    if (game) return; // Already running
    
    const canvas = options?.canvas || document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('No canvas found');
        return;
    }
    
    game = new Game(canvas);
    game.animate();
    
    console.log('✅ Game started with render recovery loop');
}

// Expose global API
window.startGame = startGame;
window.game = null;

// Auto-start if invoked directly (for testing)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait for other scripts to load
        setTimeout(() => {
            if (!window.game && document.getElementById('gameCanvas')) {
                window.startGame({ canvas: document.getElementById('gameCanvas') });
            }
        }, 500);
    });
} else {
    setTimeout(() => {
        if (!window.game && document.getElementById('gameCanvas')) {
            window.startGame({ canvas: document.getElementById('gameCanvas') });
        }
    }, 500);
}
