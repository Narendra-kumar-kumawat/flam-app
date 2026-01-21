class CanvasManager {
    constructor(canvas, cursorLayer, userId, userColor) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cursorLayer = cursorLayer;
        this.userId = userId;
        this.userColor = userColor;
        
        // Drawing state
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.tool = 'brush';
        this.color = '#000000';
        this.brushSize = 5;
        this.opacity = 1;
        
        // Remote cursors
        this.remoteCursors = new Map();
        
        // Drawing history for local undo/redo
        this.localHistory = [];
        this.historyPointer = -1;
        this.remoteActions = new Set();
        
        // Initialize canvas
        this.setupCanvas();
        this.setupEventListeners();
        
        // Event callbacks
        this.onDrawStart = null;
        this.onDraw = null;
        this.onDrawEnd = null;
        this.onCursorMove = null;
    }

    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Set initial canvas style
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Set initial background to white
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        
        // Set display size
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Set actual size in memory (scaled for retina displays)
        const scale = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * scale;
        this.canvas.height = rect.height * scale;
        
        // Scale all drawing operations by the device pixel ratio
        this.ctx.scale(scale, scale);
        
        // Redraw content if needed
        this.redrawCanvas();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseout', () => this.handleMouseOut());
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', () => this.handleTouchEnd());
        
        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;
        
        let clientX, clientY;
        
        if (e.type.includes('touch')) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        return {
            x: (clientX - rect.left) * (this.canvas.width / (rect.width * scale)),
            y: (clientY - rect.top) * (this.canvas.height / (rect.height * scale))
        };
    }

    handleMouseDown(e) {
        if (e.button !== 0) return; // Only left click
        
        const coords = this.getCanvasCoordinates(e);
        this.startDrawing(coords.x, coords.y);
        e.preventDefault();
    }

    handleMouseMove(e) {
        const coords = this.getCanvasCoordinates(e);
        
        // Update cursor position for other users
        if (this.onCursorMove) {
            this.onCursorMove({
                x: coords.x,
                y: coords.y,
                userId: this.userId,
                color: this.userColor
            });
        }
        
        if (this.isDrawing) {
            this.draw(coords.x, coords.y);
        }
    }

    handleMouseUp() {
        this.stopDrawing();
    }

    handleMouseOut() {
        this.stopDrawing();
    }

    handleTouchStart(e) {
        e.preventDefault();
        const coords = this.getCanvasCoordinates(e);
        this.startDrawing(coords.x, coords.y);
    }

    handleTouchMove(e) {
        e.preventDefault();
        const coords = this.getCanvasCoordinates(e);
        
        // Update cursor position
        if (this.onCursorMove) {
            this.onCursorMove({
                x: coords.x,
                y: coords.y,
                userId: this.userId,
                color: this.userColor
            });
        }
        
        if (this.isDrawing) {
            this.draw(coords.x, coords.y);
        }
    }

    handleTouchEnd() {
        this.stopDrawing();
    }

    startDrawing(x, y) {
        this.isDrawing = true;
        [this.lastX, this.lastY] = [x, y];
        
        // Save initial state for undo
        const snapshot = this.saveSnapshot();
        
        if (this.onDrawStart) {
            this.onDrawStart({
                x, y,
                userId: this.userId,
                color: this.color,
                brushSize: this.brushSize,
                opacity: this.opacity,
                tool: this.tool,
                snapshot
            });
        }
        
        // Begin a new path
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
    }

    draw(x, y) {
        if (!this.isDrawing) return;
        
        this.ctx.lineWidth = this.brushSize;
        this.ctx.strokeStyle = this.color;
        this.ctx.globalAlpha = this.opacity;
        
        if (this.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.strokeStyle = 'rgba(0,0,0,1)'; // For eraser
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        // Draw line
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        // Start new path from current position for smoother drawing
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        
        if (this.onDraw) {
            this.onDraw({
                x, y,
                userId: this.userId,
                color: this.color,
                brushSize: this.brushSize,
                opacity: this.opacity,
                tool: this.tool
            });
        }
        
        [this.lastX, this.lastY] = [x, y];
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        this.ctx.closePath();
        
        // Save to history
        this.saveToHistory();
        
        if (this.onDrawEnd) {
            this.onDrawEnd({
                userId: this.userId
            });
        }
    }

    drawRemote(data) {
        // Save current context state
        const savedLineWidth = this.ctx.lineWidth;
        const savedStrokeStyle = this.ctx.strokeStyle;
        const savedGlobalAlpha = this.ctx.globalAlpha;
        const savedGlobalCompositeOperation = this.ctx.globalCompositeOperation;
        
        // Apply remote drawing settings
        this.ctx.lineWidth = data.brushSize;
        this.ctx.strokeStyle = data.color;
        this.ctx.globalAlpha = data.opacity;
        this.ctx.globalCompositeOperation = data.tool === 'eraser' ? 'destination-out' : 'source-over';
        
        if (data.tool === 'eraser') {
            this.ctx.strokeStyle = 'rgba(0,0,0,1)';
        }
        
        // Draw the line
        this.ctx.lineTo(data.x, data.y);
        this.ctx.stroke();
        
        // Start new path from current position
        this.ctx.beginPath();
        this.ctx.moveTo(data.x, data.y);
        
        // Restore context
        this.ctx.lineWidth = savedLineWidth;
        this.ctx.strokeStyle = savedStrokeStyle;
        this.ctx.globalAlpha = savedGlobalAlpha;
        this.ctx.globalCompositeOperation = savedGlobalCompositeOperation;
    }

    updateRemoteCursor(data) {
        // Update or create cursor element
        let cursor = this.remoteCursors.get(data.userId);
        
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'remote-cursor';
            cursor.style.position = 'absolute';
            cursor.style.width = '15px';
            cursor.style.height = '15px';
            cursor.style.borderRadius = '50%';
            cursor.style.border = `2px solid ${data.color}`;
            cursor.style.backgroundColor = `${data.color}33`; // 33 = 20% opacity in hex
            cursor.style.pointerEvents = 'none';
            cursor.style.transform = 'translate(-50%, -50%)';
            cursor.style.zIndex = '100';
            cursor.style.transition = 'transform 0.1s';
            
            // Add username label
            const label = document.createElement('div');
            label.className = 'cursor-label';
            label.textContent = data.username || 'User';
            label.style.position = 'absolute';
            label.style.top = '-20px';
            label.style.left = '50%';
            label.style.transform = 'translateX(-50%)';
            label.style.backgroundColor = data.color;
            label.style.color = 'white';
            label.style.padding = '2px 6px';
            label.style.borderRadius = '4px';
            label.style.fontSize = '10px';
            label.style.whiteSpace = 'nowrap';
            
            cursor.appendChild(label);
            this.cursorLayer.appendChild(cursor);
            this.remoteCursors.set(data.userId, cursor);
        }
        
        // Convert canvas coordinates to screen coordinates
        const rect = this.canvas.getBoundingClientRect();
        const scale = window.devicePixelRatio || 1;
        const x = (data.x / (this.canvas.width / (rect.width * scale))) + rect.left;
        const y = (data.y / (this.canvas.height / (rect.height * scale))) + rect.top;
        
        // Update cursor position
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
        
        // Remove cursor after timeout if no updates
        clearTimeout(cursor.timeout);
        cursor.timeout = setTimeout(() => {
            this.removeUserCursor(data.userId);
        }, 3000);
    }

    removeUserCursor(userId) {
        const cursor = this.remoteCursors.get(userId);
        if (cursor) {
            cursor.remove();
            this.remoteCursors.delete(userId);
        }
    }

    clearCanvas() {
        // Save current fill style
        const savedFillStyle = this.ctx.fillStyle;
        
        // Clear with white background
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Restore fill style
        this.ctx.fillStyle = savedFillStyle;
        
        // Clear history
        this.localHistory = [];
        this.historyPointer = -1;
    }

    saveSnapshot() {
        return this.canvas.toDataURL('image/png');
    }

    restoreSnapshot(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Clear canvas
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                
                // Draw the saved state
                this.ctx.drawImage(img, 0, 0);
                resolve();
            };
            img.src = dataUrl;
        });
    }

    // FIXED: Updated saveToHistory method
    saveToHistory() {
        // Save current canvas state
        const snapshot = this.saveSnapshot();
        
        // If we're in the middle of history (after undo), remove future states
        if (this.historyPointer < this.localHistory.length - 1) {
            this.localHistory = this.localHistory.slice(0, this.historyPointer + 1);
        }
        
        // Add new snapshot
        this.localHistory.push(snapshot);
        this.historyPointer = this.localHistory.length - 1;
        
        // Limit history size
        if (this.localHistory.length > 50) {
            this.localHistory.shift();
            this.historyPointer--;
        }
    }

    // FIXED: Simple undo method
    simpleUndo() {
        if (this.historyPointer > 0) {
            this.historyPointer--;
            return this.restoreSnapshot(this.localHistory[this.historyPointer]);
        } else if (this.historyPointer === 0) {
            // If this is the first action, clear canvas
            this.clearCanvas();
            this.historyPointer = -1;
        }
        return Promise.resolve();
    }

    // FIXED: Simple redo method
    simpleRedo() {
        if (this.historyPointer < this.localHistory.length - 1) {
            this.historyPointer++;
            return this.restoreSnapshot(this.localHistory[this.historyPointer]);
        }
        return Promise.resolve();
    }

    undoRemote(actionId) {
        if (!this.remoteActions.has(actionId)) return;
        this.simpleUndo();
        this.remoteActions.delete(actionId);
    }

    redoRemote(actionId) {
        if (!this.remoteActions.has(actionId)) return;
        this.simpleRedo();
        this.remoteActions.add(actionId);
    }

    redrawCanvas() {
        if (this.localHistory.length > 0 && this.historyPointer >= 0) {
            this.restoreSnapshot(this.localHistory[this.historyPointer]);
        } else {
            // Draw white background
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    loadInitialState(data) {
        if (data.canvasState) {
            this.restoreSnapshot(data.canvasState);
        } else {
            // Draw white background if no initial state
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // FIXED: Add method to check if undo is available
    canUndo() {
        return this.historyPointer > 0 || (this.historyPointer === 0 && this.localHistory.length > 0);
    }

    // FIXED: Add method to check if redo is available
    canRedo() {
        return this.historyPointer < this.localHistory.length - 1;
    }

    setTool(tool) {
        this.tool = tool;
        console.log('Tool set to:', tool);
    }

    setColor(color) {
        this.color = color;
        console.log('Color set to:', color);
    }

    setBrushSize(size) {
        this.brushSize = parseInt(size);
        console.log('Brush size set to:', this.brushSize);
    }

    setOpacity(opacity) {
        this.opacity = parseInt(opacity) / 100;
        console.log('Opacity set to:', this.opacity);
    }
}

// Make CanvasManager available globally
if (typeof window !== 'undefined') {
    window.CanvasManager = CanvasManager;
}