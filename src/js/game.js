// game.js - Main game loop and state management
// Version: 1.0.20.1 - HP and HUD Recovery
// Purpose: Add damage feedback and HUD syncing

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
        this.gold = 0;
        this.xp = 0;
        this.floor = 1;
        
        // Damage feedback
        this.damageFlash = 0;
        this.floatingTexts = [];
        
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
            
            // Debug: H key to test damage
            if (e.code === 'KeyH') {
                this.takeDamage(10);
                console.log('🩹 Test damage applied: -10 HP');
            }
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
    
    takeDamage(amount) {
        this.health = Math.max(0, this.health - amount);
        this.damageFlash = 0.3; // seconds
        this.floatingTexts.push({
            x: this.x,
            y: this.y - 20,
            text: `-${amount}`,
            life: 1.0,
            maxLife: 1.0
        });
    }
    
    addGold(amount) {
        this.gold += amount;
        this.floatingTexts.push({
            x: this.x,
            y: this.y + 20,
            text: `+${amount}g`,
            life: 1.0,
            maxLife: 1.0,
            color: '#fbbf24'
        });
    }
    
    addXP(amount) {
        this.xp += amount;
        this.floatingTexts.push({
            x: this.x + 20,
            y: this.y,
            text: `+${amount}xp`,
            life: 1.0,
            maxLife: 1.0,
            color: '#60a5fa'
        });
    }
    
    update(dt) {
        // Damage flash decay
        this.damageFlash = Math.max(0, this.damageFlash - dt);
        
        // Update floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].life -= dt;
            this.floatingTexts[i].y -= 30 * dt; // Float upward
            if (this.floatingTexts[i].life <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }
        
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
        // Draw player with damage flash
        if (this.damageFlash > 0) {
            ctx.fillStyle = `rgba(239, 68, 68, ${this.damageFlash})`;
            ctx.fillRect(this.x - this.width / 2 - 2, this.y - this.height / 2 - 2, this.width + 4, this.height + 4);
        }
        
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
        
        // Draw floating texts
        for (const text of this.floatingTexts) {
            const alpha = text.life / text.maxLife;
            ctx.fillStyle = text.color || '#ef4444';
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 14px system-ui';
            ctx.fillText(text.text, text.x, text.y);
            ctx.globalAlpha = 1.0;
        }
    }
    
    drawHUD(ctx) {
        // Canvas-based HUD (always visible)
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '14px system-ui';
        ctx.fillText(`HP: ${Math.max(0, this.health)}/${this.maxHealth}`, 10, 25);
        ctx.fillText(`Gold: ${this.gold}`, 10, 45);
        ctx.fillText(`XP: ${this.xp}`, 10, 65);
        ctx.fillText(`Floor: ${this.floor}`, 10, 85);
        ctx.fillText(`Projectiles: ${this.projectiles.length}`, 10, 105);
        ctx.fillText(`Press H to test damage`, 10, this.canvas.height - 20);
        
        // Attempt DOM HUD sync
        this.syncDOMHUD();
    }
    
    syncDOMHUD() {
        // Try common ID patterns
        const hpIds = ['hpValue', 'hp', 'playerHp', 'health-value', 'healthValue'];
        const goldIds = ['goldValue', 'gold', 'coinCount', 'coin', 'gold-value'];
        const xpIds = ['xpValue', 'xp', 'experience', 'xp-value'];
        const floorIds = ['floorValue', 'floor', 'floor-number', 'floor-value'];
        
        const tryUpdate = (ids, value) => {
            for (const id of ids) {
                const el = document.getElementById(id);
                if (el) {
                    el.textContent = String(value);
                    break;
                }
            }
        };
        
        tryUpdate(hpIds, Math.max(0, this.health));
        tryUpdate(goldIds, this.gold);
        tryUpdate(xpIds, this.xp);
        tryUpdate(floorIds, this.floor);
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
        this.contactCooldown = 0;
        this.contactDamage = 5;
        this.contactCooldownMax = 0.5;
    }
    
    update(dt, player) {
        // Contact cooldown
        this.contactCooldown = Math.max(0, this.contactCooldown - dt);
        
        // Move toward player
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        
        this.x += (dx / len) * this.speed * dt;
        this.y += (dy / len) * this.speed * dt;
        
        // Check contact with player
        const distToPlayer = Math.hypot(this.x - player.x, this.y - player.y);
        if (distToPlayer < this.width / 2 + player.width / 2 && this.contactCooldown === 0) {
            player.takeDamage(this.contactDamage);
            this.contactCooldown = this.contactCooldownMax;
            console.log('💥 Enemy hit player: -' + this.contactDamage + ' HP');
        }
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
        console.log('✅ HP and HUD recovery loaded');
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
                        this.player.addGold(10);
                        this.player.addXP(25);
                        this.enemies.splice(j, 1);
                        console.log('⚔️ Enemy defeated: +10 gold, +25 xp');
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
        
        // Game over check
        if (this.player.health <= 0) {
            this.gameState = 'gameover';
            console.log('💀 Game Over! Final stats:', {
                health: this.player.health,
                gold: this.player.gold,
                xp: this.player.xp
            });
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
        
        // Draw HUD
        this.player.drawHUD(this.ctx);
        
        // Draw enemy count
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.font = 'bold 16px system-ui';
        this.ctx.fillText(`Enemies: ${this.enemies.length}`, this.canvas.width - 150, 30);
        
        // Draw game over screen
        if (this.gameState === 'gameover') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#ef4444';
            this.ctx.font = 'bold 48px system-ui';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 40);
            
            this.ctx.fillStyle = '#e5e7eb';
            this.ctx.font = '18px system-ui';
            this.ctx.fillText(`Gold: ${this.player.gold}`, this.canvas.width / 2, this.canvas.height / 2 + 20);
            this.ctx.fillText(`XP: ${this.player.xp}`, this.canvas.width / 2, this.canvas.height / 2 + 50);
            this.ctx.fillText('Refresh to play again', this.canvas.width / 2, this.canvas.height / 2 + 100);
            this.ctx.textAlign = 'left';
        }
    }
    
    animate() {
        const loop = (now) => {
            const dt = Math.min(0.016, (now - (this.lastTime || now)) / 1000);
            this.lastTime = now;
            
            if (this.gameState === 'playing') {
                this.update(dt);
            }
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
    
    console.log('✅ Game started with HP and HUD recovery');
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
