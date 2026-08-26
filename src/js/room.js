// room.js - Room generation, rendering, and combat logic

const TILE = 40; // pixels per tile for wall math
const WALL_THICKNESS = 48;

class Room {
    constructor(floor, roomIndex, totalRooms, canvas) {
        this.floor = floor;
        this.roomIndex = roomIndex;
        this.totalRooms = totalRooms;
        this.canvas = canvas;

        this.roomType = this.determineRoomType(floor, roomIndex, totalRooms);

        // Playable area (inside walls)
        this.bounds = {
            x: WALL_THICKNESS,
            y: WALL_THICKNESS + 60, // offset for HUD
            width:  canvas.width  - WALL_THICKNESS * 2,
            height: canvas.height - WALL_THICKNESS * 2 - 60,
        };

        this.enemies = [];
        this.cleared = false;
        this.clearDelay = 0;

        // Visual palette per floor
        this.palette = this.getPalette(floor);

        this.spawnEnemies();
    }

    determineRoomType(floor, index, total) {
        if (index === total)       return 'boss';
        if (index === total - 1)   return 'shop';
        if (index === 1)           return 'normal'; // first room always safe start
        // Secret room is roughly 65% of the way through
        if (index === Math.floor(total * 0.65)) return 'secret';
        return 'normal';
    }

    getPalette(floor) {
        const palettes = {
            1: { bg: '#0f1425', wall: '#1a2035', floor: '#12192e', accent: '#00e5ff', door: '#2a4a7a' },
            2: { bg: '#1a1208', wall: '#2a1e0a', floor: '#1a1508', accent: '#d4a040', door: '#6a4010' },
            3: { bg: '#081820', wall: '#0a2535', floor: '#081c28', accent: '#00aaff', door: '#0a3a5a' },
            4: { bg: '#0a0a18', wall: '#151525', floor: '#0c0c1c', accent: '#cc88ff', door: '#2a1a4a' },
            5: { bg: '#080810', wall: '#181820', floor: '#0a0a14', accent: '#ff6040', door: '#3a1a10' },
        };
        return palettes[floor] ?? palettes[1];
    }

    spawnEnemies() {
        if (this.roomType === 'shop' || this.roomType === 'secret') {
            this.cleared = true;
            return;
        }

        const counts = {
            normal: this.roomIndex === 1 ? 0 : 2 + Math.floor(Math.random() * 3),  // 2-4
            boss:   1,
        };
        const count = counts[this.roomType] ?? counts.normal;

        for (let i = 0; i < count; i++) {
            const x = this.bounds.x + 80 + Math.random() * (this.bounds.width  - 160);
            const y = this.bounds.y + 80 + Math.random() * (this.bounds.height - 160);
            this.enemies.push(EnemyFactory.createRandomForFloor(this.floor, x, y));
        }

        if (this.enemies.length === 0) this.cleared = true;
    }

    update(deltaTime, player) {
        if (this.cleared) return;

        // Update all enemies
        this.enemies.forEach(e => e.update(deltaTime, player, this.bounds));

        // Check player-enemy contact damage
        this.enemies.forEach(enemy => {
            if (!enemy.isAlive) return;
            if (player.isCollidingWith(enemy.getBounds())) {
                player.takeDamage(1);
            }
        });

        // Check player projectiles vs enemies
        player.projectiles.forEach(proj => {
            if (!proj.isAlive) return;
            this.enemies.forEach(enemy => {
                if (!enemy.isAlive) return;
                if (this.rectsOverlap(proj.getBounds(), enemy.getBounds())) {
                    enemy.takeDamage(proj.damage * player.damageMultiplier);
                    proj.isAlive = false;
                }
            });
        });

        // Check enemy projectiles vs player
        this.enemies.forEach(enemy => {
            enemy.projectiles.forEach(proj => {
                if (!proj.isAlive) return;
                const pb = proj.getBounds();
                const plb = { x: player.x, y: player.y, width: player.width, height: player.height };
                if (this.rectsOverlap(pb, plb)) {
                    player.takeDamage(proj.damage);
                    proj.isAlive = false;
                }
            });
        });

        // Cull dead enemies
        this.enemies = this.enemies.filter(e => e.isAlive);

        // Check clear condition
        if (this.enemies.length === 0) {
            this.cleared = true;
        }

        // Keep player in bounds
        player.x = Math.max(this.bounds.x, Math.min(this.bounds.x + this.bounds.width  - player.width,  player.x));
        player.y = Math.max(this.bounds.y, Math.min(this.bounds.y + this.bounds.height - player.height, player.y));
    }

    rectsOverlap(a, b) {
        return !(a.x + a.width < b.x || b.x + b.width < a.x ||
                 a.y + a.height < b.y || b.y + b.height < a.y);
    }

    isCleared() {
        return this.cleared;
    }

    draw(ctx) {
        const { bg, wall, floor: floorColor, accent, door } = this.palette;
        const { x, y, width, height } = this.bounds;

        // Background
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Floor tiles
        ctx.fillStyle = floorColor;
        ctx.fillRect(x, y, width, height);

        // Subtle grid
        ctx.strokeStyle = wall + '33';
        ctx.lineWidth = 0.5;
        for (let tx = x; tx < x + width; tx += TILE) {
            ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + height); ctx.stroke();
        }
        for (let ty = y; ty < y + height; ty += TILE) {
            ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + width, ty); ctx.stroke();
        }

        // Walls
        ctx.fillStyle = wall;
        // top
        ctx.fillRect(0, 60, this.canvas.width, WALL_THICKNESS);
        // bottom
        ctx.fillRect(0, y + height, this.canvas.width, WALL_THICKNESS);
        // left
        ctx.fillRect(0, 60, WALL_THICKNESS, this.canvas.height - 60);
        // right
        ctx.fillRect(x + width, 60, WALL_THICKNESS, this.canvas.height - 60);

        // Wall border/accent line
        ctx.strokeStyle = accent + '55';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Door indicator (right wall = exit)
        const doorOpen = this.cleared;
        const doorY = y + height / 2 - 30;
        const doorH = 60;
        ctx.fillStyle = doorOpen ? accent + 'aa' : door;
        ctx.fillRect(x + width, doorY, WALL_THICKNESS, doorH);
        ctx.strokeStyle = doorOpen ? accent : door + 'aa';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + width, doorY, WALL_THICKNESS, doorH);
        if (!doorOpen) {
            ctx.fillStyle = '#ff3355aa';
            ctx.font = '11px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('LOCKED', x + width + WALL_THICKNESS / 2, doorY + doorH / 2);
            ctx.textAlign = 'left';
        }

        // Room type label (top-left corner of floor)
        ctx.fillStyle = accent + '88';
        ctx.font = '10px Courier New';
        ctx.fillText(this.getRoomLabel(), x + 8, y + 16);

        // Draw enemies
        this.enemies.forEach(e => e.draw(ctx));

        // Room clear flash
        if (this.cleared && this.clearDelay < 0.4) {
            ctx.fillStyle = `rgba(0, 229, 255, ${0.08 * (1 - this.clearDelay / 0.4)})`;
            ctx.fillRect(x, y, width, height);
        }
    }

    getRoomLabel() {
        const labels = {
            normal: `ROOM ${this.roomIndex}/${this.totalRooms}`,
            boss:   `⚠ BOSS`,
            shop:   `🛒 SHOP`,
            secret: `? SECRET`,
        };
        return labels[this.roomType] ?? `ROOM ${this.roomIndex}`;
    }
}
