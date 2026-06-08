// room.js - Placeholder for Room System
// This file will be populated with the complete room system

class Room {
    constructor(floor, room, totalRooms, canvas) {
        this.floor = floor;
        this.room = room;
        this.totalRooms = totalRooms;
        this.canvas = canvas;
        this.enemies = [];
        this.cleared = false;
    }

    update(dt, player) {
        // Room update logic
    }

    draw(ctx) {
        // Room draw logic
        ctx.fillStyle = '#0f1425';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    isCleared() {
        return this.cleared || this.enemies.length === 0;
    }
}

window.Room = Room;
