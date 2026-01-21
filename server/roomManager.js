class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    
    createRoom(roomId) {
        const room = {
            users: new Map(),
            canvasState: null,
            actionHistory: [],
            undoneActions: [],
            lastActivity: Date.now()
        };
        this.rooms.set(roomId, room);
        return room;
    }
    
    joinRoom(roomId, userId, username, color) {
        let room = this.getRoom(roomId);
        if (!room) {
            room = this.createRoom(roomId);
        }
        
        // Update last activity
        room.lastActivity = Date.now();
        
        return room;
    }
    
    addAction(roomId, action) {
        const room = this.getRoom(roomId);
        if (!room) return;
        
        room.actionHistory.push(action);
        room.undoneActions = []; // Clear redo stack when new action is added
        room.lastActivity = Date.now();
    }
    
    undoLastAction(roomId, userId) {
        const room = this.getRoom(roomId);
        if (!room || room.actionHistory.length === 0) return null;
        
        const lastAction = room.actionHistory.pop();
        room.undoneActions.push(lastAction);
        room.lastActivity = Date.now();
        
        return lastAction;
    }
    
    redoAction(roomId, userId) {
        const room = this.getRoom(roomId);
        if (!room || room.undoneActions.length === 0) return null;
        
        const action = room.undoneActions.pop();
        room.actionHistory.push(action);
        room.lastActivity = Date.now();
        
        return action;
    }
    
    clearCanvas(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return;
        
        room.actionHistory = [];
        room.undoneActions = [];
        room.canvasState = null;
        room.lastActivity = Date.now();
    }
    
    cleanupRoom(roomId) {
        this.rooms.delete(roomId);
        console.log(`Cleaned up room: ${roomId}`);
    }
    
    cleanupInactiveRooms(maxInactiveTime) {
        const now = Date.now();
        for (const [roomId, room] of this.rooms.entries()) {
            if (now - room.lastActivity > maxInactiveTime && room.users.size === 0) {
                this.cleanupRoom(roomId);
            }
        }
    }
}

module.exports = RoomManager;