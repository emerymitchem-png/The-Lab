// room.js - Room generation, rendering, and door-based navigation

const TILE = 40;
const WALL = 48;       // wall thickness in px
const DOOR_W = 80;     // door opening width
const DOOR_H = WALL;   // door depth

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

        // Playable bounds (inside walls) — HUD is outside the canvas now
        this.bounds = {
            x: WALL,
            y: WALL,
            width:  canvas.width  - WALL * 2,
            height: canvas.height - WALL * 2,
        };

        this.isFirstRoom = roomIndex === 1;
        this.isLastRoom  = roomIndex === floorMap.totalRooms;

        this.enemies = [];
        this.cleared  = false;
        this.clearFlashTimer = 0;

        // All 4 door zones (player walks into one to advance)
        this.doors = {
            right:  this._makeDoor('right'),
            left:   this._makeDoor('left'),
            top:    this._makeDoor('top'),
            bottom: this._makeDoor('bottom'),
        };

        this._spawnEnemies();
    }

    // ── Door zone helpers ────────────────────────────────────────────────────

    _makeDoor(side) {
        const { x, y, width, height } = this.bounds;
        const midX = x + width  / 2 - DOOR_W / 2;
        const midY = y + height / 2 - DOOR_W / 2;
        switch (side) {
            case 'right':  return { x: x + width, y: midY,       width: DOOR_H, height: DOOR_W, side };
            case 'left':   return { x: x - DOOR_H, y: midY,      width: DOOR_H, height: DOOR_W, side };
            case 'top':    return { x: midX, y: y - DOOR_H,      width: DOOR_W, height: DOOR_H, side };
            case 'bottom': return { x: midX, y: y + height,      width: DOOR_W, height: DOOR_H, side };
        }
    }

    // Returns exit direction string if player is in an open door zone, else null
    getExitDirection(player) {
        if (!this.cleared) return null;
        const pb = { x: player.x, y: player.y, width: player.width, height: player.height };
        for (const [dir, zone] of Object.entries(this.doors)) {
            if (this._rectsOverlap(pb, zone)) return dir;
        }
        return null;
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

        // While doors are locked, keep player fully inside bounds.
        // Once cleared, allow them to walk into any of the 4 door openings.
        const extra = this.cleared ? DOOR_H : 0;
        const minX = this.bounds.x - extra;
        const maxX = this.bounds.x + this.bounds.width  + extra - player.width;
        const minY = this.bounds.y - extra;
        const maxY = this.bounds.y + this.bounds.height + extra - player.height;

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

        // ── Walls (solid slabs covering all 4 sides) ─────────────────────────
        ctx.fillStyle = wallColor;
        ctx.fillRect(0,         0,         cx,   WALL);           // top
        ctx.fillRect(0,         y + height, cx,   WALL);           // bottom
        ctx.fillRect(0,         0,          WALL, cy);             // left
        ctx.fillRect(x + width, 0,          WALL, cy);             // right

        // ── Door openings ────────────────────────────────────────────────────
        // All 4 doors open when cleared; entry doors are shown even if first room
        this._drawDoor(ctx, 'right',  this.cleared,   floorColor, accent, wallColor);
        this._drawDoor(ctx, 'left',   this.cleared || !this.isFirstRoom, floorColor, accent, wallColor);
        this._drawDoor(ctx, 'top',    this.cleared,   floorColor, accent, wallColor);
        this._drawDoor(ctx, 'bottom', this.cleared,   floorColor, accent, wallColor);

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
        const midX = x + width  / 2;
        const midY = y + height / 2;
        const half = DOOR_W / 2;

        let gapX, gapY, gapW, gapH, arrowGlyph, arrowX, arrowY;
        switch (side) {
            case 'right':
                gapX = x + width; gapY = midY - half; gapW = WALL; gapH = DOOR_W;
                arrowGlyph = '▶'; arrowX = gapX + WALL / 2; arrowY = midY; break;
            case 'left':
                gapX = x - WALL;  gapY = midY - half; gapW = WALL; gapH = DOOR_W;
                arrowGlyph = '◀'; arrowX = gapX + WALL / 2; arrowY = midY; break;
            case 'top':
                gapX = midX - half; gapY = y - WALL; gapW = DOOR_W; gapH = WALL;
                arrowGlyph = '▲'; arrowX = midX; arrowY = gapY + WALL / 2; break;
            case 'bottom':
                gapX = midX - half; gapY = y + height; gapW = DOOR_W; gapH = WALL;
                arrowGlyph = '▼'; arrowX = midX; arrowY = gapY + WALL / 2; break;
        }

        if (open) {
            ctx.fillStyle = floorColor;
            ctx.fillRect(gapX, gapY, gapW, gapH);

            ctx.fillStyle = accent + 'bb';
            ctx.font = '20px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(arrowGlyph, arrowX, arrowY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            ctx.strokeStyle = accent + '88';
            ctx.lineWidth = 2;
            ctx.strokeRect(gapX, gapY, gapW, gapH);
        } else {
            ctx.fillStyle = wallColor;
            ctx.fillRect(gapX, gapY, gapW, gapH);

            ctx.fillStyle = '#ff335577';
            ctx.font = '14px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🔒', arrowX, arrowY);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            ctx.strokeStyle = '#ff335544';
            ctx.lineWidth = 1;
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
        const dotY = WALL / 2; // center of top wall (HUD is now outside canvas)

        for (let i = 0; i < total; i++) {
            const roomNum = i + 1;
            const isCurrent = roomNum === this.roomIndex;

            const type = this.floorMap.typeAt(roomNum);
            let color;
            if (type === 'boss')                              color = '#ff4444';
            else if (type === 'shop' || type === 'locked_shop') color = '#44ffcc';
            else if (type === 'secret')                       color = '#ffcc44';
            else if (type === 'marked_door')                  color = '#cc88ff';
            else                                              color = '#4488cc';

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
