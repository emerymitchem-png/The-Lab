// room.js - Room generation, rendering, and door-based navigation

const TILE = 40;
const WALL = 48;          // wall thickness in px
const DOOR_W = 80;        // door opening width
const DOOR_H = WALL;      // door depth (same as wall)
const HUD_H = 60;         // height reserved for HUD at top

// ── FloorMap ────────────────────────────────────────────────────────────────
// Pre-plans the ordered sequence of room types for a floor before any room
// is visited. The design doc defines the structure per floor:
//   normal rooms → secret → shop → boss, with locked doors woven in.

class FloorMap {
    constructor(floorNumber) {
        this.floorNumber = floorNumber;
        const fd = gameLoader.getFloorData(floorNumber);
        this.sequence = this._buildSequence(fd);
        this.totalRooms = this.sequence.length;
    }

    // Returns room type string at 1-based index
    typeAt(index) {
        return this.sequence[index - 1] ?? 'normal';
    }

    _buildSequence(fd) {
        if (!fd) return this._fallback();

        const gr = fd.guaranteed_rooms;
        const hasProcMystery = Math.random() < 0.25; // 25% mystery door

        // Build pool of room types
        const pool = [];

        // Room 1 is always a safe start (empty normal room)
        pool.push('start');

        // Normal combat rooms (minus the start room we just added)
        for (let i = 0; i < (gr.normal_rooms - 1); i++) pool.push('normal');

        // Secret rooms (1 on floors 1-3, 2 on floors 4-5)
        for (let i = 0; i < (gr.secret_rooms ?? 1); i++) pool.push('secret');

        // Marked door (unlocked, safe rare chest room)
        for (let i = 0; i < (gr.marked_unlocked_door ?? 1); i++) pool.push('marked_door');

        // Procedural locked door
        pool.push(hasProcMystery ? 'locked_mystery' : 'locked_shop');

        // Shuffle all rooms except first (start) and last two (shop then boss)
        const shuffleable = pool.slice(1);
        this._shuffle(shuffleable);
        const middle = ['start', ...shuffleable];

        // Guaranteed shop then boss at the end
        middle.push('shop');
        middle.push('boss');

        return middle;
    }

    _shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    _fallback() {
        // Default 11-room floor 1 layout if data missing
        return ['start','normal','normal','normal','normal','normal','secret','marked_door','locked_shop','shop','boss'];
    }
}

// ── Room ─────────────────────────────────────────────────────────────────────

class Room {
    constructor(floor, roomIndex, floorMap, canvas) {
        this.floor = floor;
        this.roomIndex = roomIndex;
        this.floorMap = floorMap;
        this.totalRooms = floorMap.totalRooms;
        this.canvas = canvas;

        this.roomType = floorMap.typeAt(roomIndex);
        this.palette = this._getPalette(floor);

        // Playable bounds (inside walls)
        this.bounds = {
            x: WALL,
            y: WALL + HUD_H,
            width:  canvas.width  - WALL * 2,
            height: canvas.height - WALL * 2 - HUD_H,
        };

        // Is this the very first room of the floor? (no entry door needed)
        this.isFirstRoom = roomIndex === 1;
        // Is this the very last room of the floor? (no exit door)
        this.isLastRoom  = roomIndex === floorMap.totalRooms;

        this.enemies = [];
        this.cleared  = false;
        this.clearFlashTimer = 0;

        // Door trigger zones — player walks into these to advance
        // exitDoor: right-wall door (advances to next room when cleared)
        // entryDoor: left-wall door (cosmetic, shows where player came from)
        this.exitDoor  = this._makeDoor('right');
        this.entryDoor = this._makeDoor('left');

        this._spawnEnemies();
    }

    // ── Door zone helpers ────────────────────────────────────────────────────

    _makeDoor(side) {
        const { x, y, width, height } = this.bounds;
        const midY = y + height / 2 - DOOR_W / 2;
        if (side === 'right') {
            return { x: x + width, y: midY, width: DOOR_H, height: DOOR_W, side };
        }
        return { x: x - DOOR_H, y: midY, width: DOOR_H, height: DOOR_W, side };
    }

    // Returns true if player hitbox overlaps the exit door trigger
    playerAtExit(player) {
        if (!this.cleared) return false;
        return this._rectsOverlap(
            { x: player.x, y: player.y, width: player.width, height: player.height },
            this.exitDoor
        );
    }

    // ── Spawning ─────────────────────────────────────────────────────────────

    _spawnEnemies() {
        // These room types have no enemies
        const safeRooms = new Set(['start','shop','secret','marked_door','locked_shop']);
        if (safeRooms.has(this.roomType)) {
            this.cleared = true;
            return;
        }

        let count;
        if (this.roomType === 'boss') {
            count = 1; // single boss enemy (placeholder until boss class is built)
        } else if (this.roomType === 'locked_mystery') {
            count = 3 + Math.floor(Math.random() * 3); // 3-5 harder enemies
        } else {
            count = 2 + Math.floor(Math.random() * 3); // 2-4 normal
        }

        for (let i = 0; i < count; i++) {
            const x = this.bounds.x + 100 + Math.random() * (this.bounds.width  - 200);
            const y = this.bounds.y + 100 + Math.random() * (this.bounds.height - 200);
            this.enemies.push(EnemyFactory.createRandomForFloor(this.floor, x, y));
        }

        if (this.enemies.length === 0) this.cleared = true;
    }

    // ── Update ───────────────────────────────────────────────────────────────

    update(deltaTime, player) {
        if (this.clearFlashTimer > 0) this.clearFlashTimer -= deltaTime;

        if (!this.cleared) {
            this._updateCombat(deltaTime, player);

            if (this.enemies.length === 0) {
                this.cleared = true;
                this.clearFlashTimer = 0.5;
            }
        }

        // Constrain player to playable area while doors are closed
        // When cleared, allow player into the door openings
        const minX = this.cleared ? this.bounds.x - DOOR_H : this.bounds.x;
        const maxX = this.cleared ? this.bounds.x + this.bounds.width + DOOR_H - player.width
                                  : this.bounds.x + this.bounds.width - player.width;
        const minY = this.bounds.y;
        const maxY = this.bounds.y + this.bounds.height - player.height;

        player.x = Math.max(minX, Math.min(maxX, player.x));
        player.y = Math.max(minY, Math.min(maxY, player.y));
    }

    _updateCombat(deltaTime, player) {
        this.enemies.forEach(e => e.update(deltaTime, player, this.bounds));

        // Player-enemy contact
        this.enemies.forEach(enemy => {
            if (!enemy.isAlive) return;
            if (this._rectsOverlap(
                { x: player.x, y: player.y, width: player.width, height: player.height },
                enemy.getBounds()
            )) {
                player.takeDamage(1);
            }
        });

        // Player projectiles vs enemies
        player.projectiles.forEach(proj => {
            if (!proj.isAlive) return;
            this.enemies.forEach(enemy => {
                if (!enemy.isAlive) return;
                if (this._rectsOverlap(proj.getBounds(), enemy.getBounds())) {
                    enemy.takeDamage(proj.damage * player.damageMultiplier);
                    proj.isAlive = false;
                }
            });
        });

        // Enemy projectiles vs player
        this.enemies.forEach(enemy => {
            enemy.projectiles.forEach(proj => {
                if (!proj.isAlive) return;
                if (this._rectsOverlap(proj.getBounds(),
                    { x: player.x, y: player.y, width: player.width, height: player.height }
                )) {
                    player.takeDamage(proj.damage);
                    proj.isAlive = false;
                }
            });
        });

        this.enemies = this.enemies.filter(e => e.isAlive);
    }

    _rectsOverlap(a, b) {
        return !(a.x + a.width < b.x || b.x + b.width < a.x ||
                 a.y + a.height < b.y || b.y + b.height < a.y);
    }

    isCleared() { return this.cleared; }

    // ── Draw ─────────────────────────────────────────────────────────────────

    draw(ctx) {
        const { bg, wall: wallColor, floor: floorColor, accent } = this.palette;
        const { x, y, width, height } = this.bounds;
        const cx = this.canvas.width;
        const cy = this.canvas.height;

        // ── Background ──────────────────────────────────────────────────────
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cx, cy);

        // ── Floor area ──────────────────────────────────────────────────────
        ctx.fillStyle = floorColor;
        ctx.fillRect(x, y, width, height);

        // Subtle tile grid
        ctx.strokeStyle = wallColor + '44';
        ctx.lineWidth = 0.5;
        for (let tx = x; tx <= x + width; tx += TILE) {
            ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + height); ctx.stroke();
        }
        for (let ty = y; ty <= y + height; ty += TILE) {
            ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + width, ty); ctx.stroke();
        }

        // ── Walls ───────────────────────────────────────────────────────────
        // We draw 4 solid wall slabs, then cut out door openings by
        // drawing the floor colour back over the door gap.

        ctx.fillStyle = wallColor;
        // top wall
        ctx.fillRect(0, HUD_H, cx, WALL);
        // bottom wall
        ctx.fillRect(0, y + height, cx, WALL);
        // left wall
        ctx.fillRect(0, HUD_H, WALL, cy - HUD_H);
        // right wall
        ctx.fillRect(x + width, HUD_H, WALL, cy - HUD_H);

        // ── Door openings ────────────────────────────────────────────────────
        // Exit door (right wall) — always drawn
        this._drawDoor(ctx, 'right', this.cleared, floorColor, accent, wallColor);

        // Entry door (left wall) — only when not the first room
        if (!this.isFirstRoom) {
            this._drawDoor(ctx, 'left', true, floorColor, accent, wallColor);
        }

        // ── Border accent line ───────────────────────────────────────────────
        ctx.strokeStyle = accent + '66';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // ── Room type decorations ────────────────────────────────────────────
        this._drawRoomDecoration(ctx);

        // ── Enemies ──────────────────────────────────────────────────────────
        this.enemies.forEach(e => e.draw(ctx));

        // ── Clear flash ──────────────────────────────────────────────────────
        if (this.clearFlashTimer > 0) {
            const alpha = 0.15 * (this.clearFlashTimer / 0.5);
            ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.fillRect(x, y, width, height);
        }
    }

    _drawDoor(ctx, side, open, floorColor, accent, wallColor) {
        const { x, y, width, height } = this.bounds;
        const midY = y + height / 2;
        const halfW = DOOR_W / 2;

        // Door gap coords in the wall
        let gapX, gapY, gapW, gapH;
        if (side === 'right') {
            gapX = x + width;  gapY = midY - halfW; gapW = WALL; gapH = DOOR_W;
        } else {
            gapX = x - WALL;   gapY = midY - halfW; gapW = WALL; gapH = DOOR_W;
        }

        if (open) {
            // Carve out the wall to show the opening
            ctx.fillStyle = floorColor;
            ctx.fillRect(gapX, gapY, gapW, gapH);

            // Draw arrow/chevron hint in opening
            ctx.fillStyle = accent + 'bb';
            ctx.font = '22px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const arrowX = gapX + gapW / 2;
            ctx.fillText(side === 'right' ? '▶' : '◀', arrowX, midY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            // Door frame
            ctx.strokeStyle = accent + '99';
            ctx.lineWidth = 2;
            ctx.strokeRect(gapX, gapY, gapW, gapH);
        } else {
            // Closed door — darker fill + lock icon
            ctx.fillStyle = wallColor + 'cc';
            ctx.fillRect(gapX, gapY, gapW, gapH);

            ctx.fillStyle = '#ff335599';
            ctx.font = '14px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒', gapX + gapW / 2, midY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            ctx.strokeStyle = '#ff335555';
            ctx.lineWidth = 2;
            ctx.strokeRect(gapX, gapY, gapW, gapH);
        }
    }

    _drawRoomDecoration(ctx) {
        const { x, y, width, height } = this.bounds;
        const { accent } = this.palette;

        const labels = {
            start:          { icon: '🎓', text: 'START',       color: '#88ffaa' },
            normal:         { icon: '⚔️',  text: `ROOM ${this.roomIndex}/${this.totalRooms}`, color: accent },
            secret:         { icon: '❓',  text: 'SECRET ROOM', color: '#ffcc44' },
            shop:           { icon: '🛒',  text: 'SHOP',        color: '#44ffcc' },
            boss:           { icon: '⚠️',  text: 'BOSS',        color: '#ff4444' },
            marked_door:    { icon: '📦',  text: 'RARE CHEST',  color: '#cc88ff' },
            locked_shop:    { icon: '🛒',  text: 'SHOP (LOCKED)', color: '#44ffcc' },
            locked_mystery: { icon: '🎲',  text: 'MYSTERY',     color: '#ff8844' },
        };

        const info = labels[this.roomType] ?? labels.normal;

        // Room label top-left
        ctx.fillStyle = info.color + 'bb';
        ctx.font = 'bold 11px Courier New';
        ctx.fillText(`${info.icon} ${info.text}`, x + 10, y + 18);

        // For boss room: large warning in center background
        if (this.roomType === 'boss' && this.enemies.length > 0) {
            ctx.fillStyle = '#ff444411';
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = '#ff444433';
            ctx.font = 'bold 80px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠️', x + width / 2, y + height / 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        // For shop room: simple visual indicator
        if (this.roomType === 'shop' || this.roomType === 'locked_shop') {
            ctx.fillStyle = '#44ffcc11';
            ctx.fillRect(x, y, width, height);
            ctx.fillStyle = '#44ffcc22';
            ctx.font = '60px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🛒', x + width / 2, y + height / 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }

        // For secret: subtle glow
        if (this.roomType === 'secret') {
            ctx.fillStyle = '#ffcc4411';
            ctx.fillRect(x, y, width, height);
        }

        // Progress dots along the top wall
        this._drawProgressDots(ctx);
    }

    _drawProgressDots(ctx) {
        const total = this.totalRooms;
        const dotR = 4;
        const spacing = 14;
        const startX = this.canvas.width / 2 - ((total - 1) * spacing) / 2;
        const dotY = HUD_H + WALL / 2;

        for (let i = 0; i < total; i++) {
            const roomNum = i + 1;
            const isCurrent = roomNum === this.roomIndex;

            let color;
            const type = this.floorMap.typeAt(roomNum);
            if (type === 'boss')   color = '#ff4444';
            else if (type === 'shop' || type === 'locked_shop') color = '#44ffcc';
            else if (type === 'secret') color = '#ffcc44';
            else if (type === 'marked_door') color = '#cc88ff';
            else                   color = '#4488cc';

            ctx.beginPath();
            ctx.arc(startX + i * spacing, dotY, isCurrent ? dotR + 2 : dotR, 0, Math.PI * 2);
            ctx.fillStyle = isCurrent ? '#ffffff' : color + '99';
            ctx.fill();

            if (isCurrent) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }

    _getPalette(floor) {
        const palettes = {
            1: { bg: '#0f1425', wall: '#1a2035', floor: '#12192e', accent: '#00e5ff' },
            2: { bg: '#1a1208', wall: '#2a1e0a', floor: '#1a1508', accent: '#d4a040' },
            3: { bg: '#081820', wall: '#0a2535', floor: '#081c28', accent: '#00aaff' },
            4: { bg: '#0a0a18', wall: '#151525', floor: '#0c0c1c', accent: '#cc88ff' },
            5: { bg: '#080810', wall: '#181820', floor: '#0a0a14', accent: '#ff6040' },
        };
        return palettes[floor] ?? palettes[1];
    }
}
