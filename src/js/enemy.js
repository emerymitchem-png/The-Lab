// enemy.js - Enemy base class and Floor 1 enemy implementations

class Enemy {
    constructor(x, y, data) {
        this.x = x;
        this.y = y;
        this.id = data.id;
        this.name = data.name;
        this.icon = data.icon ?? '👾';
        this.width = 32;
        this.height = 32;
        this.health = data.health ?? 20;
        this.maxHealth = this.health;

        // Base movement
        this.vx = 0;
        this.vy = 0;
        this.speed = data.speed ?? 1;

        this.isAlive = true;
        this.flashTimer = 0; // red flash on hit

        // Attack
        this.attackCooldown = 0;
        this.attackRate = data.attackRate ?? 1.5; // seconds between attacks
        this.projectiles = [];

        // Behaviour state
        this.stateTimer = 0;
        this.state = 'idle'; // idle, chasing, attacking
    }

    update(deltaTime, player, roomBounds) {
        if (!this.isAlive) return;

        this.flashTimer = Math.max(0, this.flashTimer - deltaTime);
        this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);
        this.stateTimer += deltaTime;

        this.updateBehaviour(deltaTime, player, roomBounds);

        // Move
        this.x += this.vx;
        this.y += this.vy;

        // Clamp to room
        this.x = Math.max(roomBounds.x, Math.min(roomBounds.x + roomBounds.width - this.width, this.x));
        this.y = Math.max(roomBounds.y, Math.min(roomBounds.y + roomBounds.height - this.height, this.y));

        // Update projectiles
        this.projectiles = this.projectiles.filter(p => {
            p.update(deltaTime);
            return p.isAlive;
        });
    }

    // Override in subclasses
    updateBehaviour(deltaTime, player, roomBounds) {
        this.chasePlayer(player, this.speed);
    }

    chasePlayer(player, speed) {
        const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
        const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
            this.vx = (dx / dist) * speed;
            this.vy = (dy / dist) * speed;
        }
    }

    distToPlayer(player) {
        const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
        const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
        return Math.hypot(dx, dy);
    }

    fireAt(player, speed = 4, damage = 3) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const dx = (player.x + player.width / 2) - cx;
        const dy = (player.y + player.height / 2) - cy;
        const d = Math.hypot(dx, dy);
        if (d === 0) return;
        this.projectiles.push(new EnemyProjectile(cx, cy, (dx / d) * speed, (dy / d) * speed, damage));
    }

    takeDamage(amount) {
        this.health -= amount;
        this.flashTimer = 0.1;
        if (this.health <= 0) {
            this.health = 0;
            this.isAlive = false;
        }
    }

    getBounds() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }

    isCollidingWith(bounds) {
        return !(this.x + this.width < bounds.x || bounds.x + bounds.width < this.x ||
                 this.y + this.height < bounds.y || bounds.y + bounds.height < this.y);
    }

    draw(ctx) {
        if (!this.isAlive) return;

        // Flash red when hit
        if (this.flashTimer > 0) {
            ctx.fillStyle = '#ff4444';
        } else {
            ctx.fillStyle = '#cc2244';
        }
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Icon
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, this.x + this.width / 2, this.y + this.height / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // Health bar
        this.drawHealthBar(ctx);

        // Draw projectiles
        this.projectiles.forEach(p => p.draw(ctx));
    }

    drawHealthBar(ctx) {
        const bw = this.width;
        const bh = 4;
        const bx = this.x;
        const by = this.y - 8;
        const pct = this.health / this.maxHealth;

        ctx.fillStyle = '#330000';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = pct > 0.5 ? '#00cc44' : pct > 0.25 ? '#ffaa00' : '#ff2222';
        ctx.fillRect(bx, by, bw * pct, bh);
    }
}

// ── Enemy Projectile ─────────────────────────────────────────────────────────

class EnemyProjectile {
    constructor(x, y, vx, vy, damage = 3, color = '#ff6600') {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.width = 8;
        this.height = 8;
        this.damage = damage;
        this.color = color;
        this.isAlive = true;
        this.lifetime = 5;
        this.age = 0;
    }

    update(deltaTime) {
        this.x += this.vx;
        this.y += this.vy;
        this.age += deltaTime;
        if (this.age > this.lifetime) this.isAlive = false;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    getBounds() {
        return { x: this.x - this.width / 2, y: this.y - this.height / 2, width: this.width, height: this.height };
    }
}

// ── Floor 1 Enemies ──────────────────────────────────────────────────────────

// Runaway Beaker: rolls toward player, accelerates, leaves puddles
class RunawayBeaker extends Enemy {
    constructor(x, y) {
        super(x, y, {
            id: 'runaway_beaker',
            name: 'Runaway Beaker',
            icon: '🧪',
            health: 25,
            speed: 1.5,
        });
        this.acceleration = 0.04;
        this.currentSpeed = 0.5;
        this.puddles = [];
        this.puddleTimer = 0;
    }

    updateBehaviour(deltaTime, player, roomBounds) {
        this.currentSpeed = Math.min(this.currentSpeed + this.acceleration, 4.0);
        this.chasePlayer(player, this.currentSpeed);

        // Drop puddle trail
        this.puddleTimer += deltaTime;
        if (this.puddleTimer > 0.5) {
            this.puddleTimer = 0;
            this.puddles.push({
                x: this.x + this.width / 2 - 12,
                y: this.y + this.height / 2 - 12,
                r: 12,
                lifetime: 4,
                age: 0,
            });
        }

        this.puddles = this.puddles.filter(p => {
            p.age += deltaTime;
            return p.age < p.lifetime;
        });
    }

    draw(ctx) {
        // Draw puddles
        this.puddles.forEach(p => {
            const alpha = 1 - p.age / p.lifetime;
            ctx.fillStyle = `rgba(0, 200, 150, ${alpha * 0.4})`;
            ctx.beginPath();
            ctx.ellipse(p.x + p.r, p.y + p.r, p.r, p.r * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        });
        super.draw(ctx);
    }
}

// Centrifuge: stationary, fires rotating spray of 5 projectiles
class Centrifuge extends Enemy {
    constructor(x, y) {
        super(x, y, {
            id: 'centrifuge',
            name: 'Centrifuge',
            icon: '⚙️',
            health: 35,
            speed: 0,
            attackRate: 1.5,
        });
        this.angle = 0;
        this.rotationSpeed = 1.5; // radians/sec (increases)
        this.age = 0;
    }

    updateBehaviour(deltaTime, player, roomBounds) {
        this.vx = 0;
        this.vy = 0;
        this.age += deltaTime;
        this.rotationSpeed = 1.5 + this.age * 0.03;
        this.angle += this.rotationSpeed * deltaTime;

        if (this.attackCooldown <= 0) {
            this.fireSpray();
            this.attackCooldown = this.attackRate;
        }
    }

    fireSpray() {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        for (let i = 0; i < 5; i++) {
            const a = this.angle + (i / 5) * Math.PI * 2;
            this.projectiles.push(new EnemyProjectile(cx, cy, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 3, '#00ccff'));
        }
    }

    draw(ctx) {
        super.draw(ctx);
        // Spinning indicator
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        ctx.strokeStyle = '#00ccff55';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
        ctx.restore();
    }
}

// Bunsen Burner: stationary, fires wide flame cone every 1.2s
class BunsenBurner extends Enemy {
    constructor(x, y) {
        super(x, y, {
            id: 'bunsen_burner',
            name: 'Bunsen Burner',
            icon: '🔥',
            health: 30,
            speed: 0,
            attackRate: 1.2,
        });
        this.flameAngle = 0;
        this.flameActive = false;
        this.flameDuration = 0;
    }

    updateBehaviour(deltaTime, player, roomBounds) {
        this.vx = 0;
        this.vy = 0;

        // Track player direction slowly
        const dx = (player.x + player.width / 2) - (this.x + this.width / 2);
        const dy = (player.y + player.height / 2) - (this.y + this.height / 2);
        const targetAngle = Math.atan2(dy, dx);
        // Lerp angle
        let diff = targetAngle - this.flameAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.flameAngle += diff * deltaTime * 0.8;

        if (this.flameDuration > 0) {
            this.flameDuration -= deltaTime;
            this.flameActive = true;
        } else {
            this.flameActive = false;
        }

        if (this.attackCooldown <= 0) {
            this.flameDuration = 0.35;
            this.fireCone(player);
            this.attackCooldown = this.attackRate;
        }
    }

    fireCone(player) {
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const spread = Math.PI / 3; // 60 degree arc
        for (let i = 0; i < 7; i++) {
            const a = this.flameAngle - spread / 2 + (spread / 6) * i;
            const speed = 3 + Math.random() * 1.5;
            this.projectiles.push(new EnemyProjectile(cx, cy, Math.cos(a) * speed, Math.sin(a) * speed, 4, '#ff6600'));
        }
    }

    draw(ctx) {
        if (this.flameActive) {
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ff8800';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, 70, this.flameAngle - Math.PI / 3, this.flameAngle + Math.PI / 3);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
        super.draw(ctx);
    }
}

// ── Enemy Factory ────────────────────────────────────────────────────────────

const EnemyFactory = {
    floor1Types: ['runaway_beaker', 'centrifuge', 'bunsen_burner'],

    create(id, x, y) {
        switch (id) {
            case 'runaway_beaker': return new RunawayBeaker(x, y);
            case 'centrifuge':     return new Centrifuge(x, y);
            case 'bunsen_burner':  return new BunsenBurner(x, y);
            default:               return new RunawayBeaker(x, y);
        }
    },

    createRandomForFloor(floor, x, y) {
        const pool = this.floor1Types; // expand per floor later
        const id = pool[Math.floor(Math.random() * pool.length)];
        return this.create(id, x, y);
    },
};
