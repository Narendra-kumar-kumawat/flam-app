class DrawingStateManager {
    constructor() {
        this.states = new Map();
    }
    
    saveCanvasState(roomId, canvasData) {
        this.states.set(roomId, canvasData);
    }
    
    getCanvasState(roomId) {
        return this.states.get(roomId);
    }
    
    clearCanvasState(roomId) {
        this.states.delete(roomId);
    }
}

module.exports = DrawingStateManager;