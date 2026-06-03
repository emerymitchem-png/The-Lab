// player.js - Player entity and controls

class Player {
    constructor(x, y, canvas) {
        this.x = x;
        this.y = y;
        this.canvas = canvas;
        this.width = 32;
        this.height = 32;
        this.speed = 3;
        this.health = 5; // brains
        this.maxHealth = 5;
        
        // Input state
        this.inputX = 0;
        this.inputY = 0;
        this.shootX = 0;
        this.shootY = 0;
        
        // Weapon system
        this.weaponSlot1 = null;
        this.weaponSlot2 = null;
        this.projectiles = [];
        this.shootCooldown = 0;
        this.shootRate = 0.15; // seconds between shots
        
        // Stats
        this.damageMultiplier = 1.0;
        this.speedMultiplier = 1.0;
        this.coins = 0;
        
        // Specialization
        this.currentSpecialization = "Student";
        
        this.setupInputs();
    }

    setupInputs() {
        // Keyboard input for movement (arrow keys or WASD)
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.inputY = -1;
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.inputY = 1;
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.inputX = -1;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.inputX = 1;
            if (e.key === 'Escape') this.onPausePressed();
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.inputY = 0;
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.inputY = 0;
            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.inputX = 0;
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.inputX = 0;
        });

        // Mouse for shooting (right stick alternative)
        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.shootX = e.clientX - rect.left - this.x;
            this.shootY = e.clientY - rect.top - this.y;
        });

        window.addEventListener('click', () => {
            this.shoot();
        });
    }

    update(deltaTime) {
        // Movement
        const moveSpeed = this.speed * this.speedMultiplier;
        this.x += this.inputX * moveSpeed;
        this.y += this.inputY * moveSpeed;

        // Boundary check
        this.x = Math.max(0, Math.min(this.canvas.width - this.width, this.x));
        this.y = Math.max(0, Math.min(this.canvas.height - this.height, this.y));

        // Update shooting cooldown
        this.shootCooldown = Math.max(0, this.shootCooldown - deltaTime);

        // Update projectiles
        this.projectiles = this.projectiles.filter(p => {
            p.update(deltaTime);
            return p.isAlive;
        });
    }

    shoot() {
        if (this.shootCooldown <= 0) {
            const angle = Math.atan2(this.shootY, this.shootX);
            const projectile = new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                Math.cos(angle) * 5,
                Math.sin(angle) * 5,
                this.damageMultiplier
            );
            this.projectiles.push(projectile);
            this.shootCooldown = this.shootRate;
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        return this.health <= 0; // Return true if dead
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    addHealth(amount) {
        this.maxHealth += amount;
        this.health = this.maxHealth;
    }

    equipArtifact(artifact, slot) {
        if (slot === 1) this.weaponSlot1 = artifact;
        if (slot === 2) this.weaponSlot2 = artifact;
        this.recalculateStats();
    }

    recalculateStats() {
        let damageMultiplier = 1.0;
        let speedMultiplier = 1.0;

        if (this.weaponSlot1) {
            damageMultiplier *= this.weaponSlot1.stats.damage_multiplier;
            speedMultiplier *= this.weaponSlot1.stats.speed_multiplier;
        }
        if (this.weaponSlot2) {
            damageMultiplier *= this.weaponSlot2.stats.damage_multiplier;
            speedMultiplier *= this.weaponSlot2.stats.speed_multiplier;
        }

        this.damageMultiplier = damageMultiplier;
        this.speedMultiplier = speedMultiplier;
    }

    draw(ctx) {
        // Draw player as simple colored square (placeholder)
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Draw border
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        // Draw projectiles
        ctx.fillStyle = '#ffff00';
        this.projectiles.forEach(p => p.draw(ctx));
    }

    onPausePressed() {
        // Handled by game.js
    }

    isCollidingWith(bounds) {
        return !(this.x + this.width < bounds.x || bounds.x + bounds.width < this.x ||
                 this.y + this.height < bounds.y || bounds.y + bounds.height < this.y);
    }
}

class Projectile {
    constructor(x, y, vx, vy, damage = 1.0) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.width = 8;
        this.height = 8;
        this.damage = damage;
        this.isAlive = true;
        this.lifetime = 5; // seconds
        this.age = 0;
    }

    update(deltaTime) {
        this.x += this.vx;
        this.y += this.vy;
        this.age += deltaTime;

        if (this.age > this.lifetime) {
            this.isAlive = false;
        }
    }

    draw(ctx) {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
        
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }

    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
}
