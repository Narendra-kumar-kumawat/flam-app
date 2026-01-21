class CollaborativeCanvasApp {
    constructor() {
        this.canvasManager = null;
        this.wsClient = null;
        this.userId = this.generateUserId();
        this.userColor = this.generateRandomColor();
        this.currentRoom = 'default';
        this.username = `User_${this.userId.substr(0, 4)}`;
        
        this.initializeApp();
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    generateRandomColor() {
        const colors = ['#ff3b30', '#4cd964', '#007aff', '#ff9500', '#ffcc00', '#8e44ad'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    initializeApp() {
        this.setupEventListeners();
        this.initializeCanvas();
        this.initializeWebSocket();
        this.updateUserDisplay();
        this.showNotification('Welcome to Collaborative Canvas!', 'info');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                console.log('Tool clicked:', tool);
                this.selectTool(tool);
            });
        });

        // Color selection
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const color = e.currentTarget.dataset.color;
                console.log('Color clicked:', color);
                this.selectColor(color);
            });
        });

        // Custom color
        document.getElementById('customColor').addEventListener('change', (e) => {
            const color = e.target.value;
            console.log('Custom color selected:', color);
            this.selectColor(color);
        });

        // Brush settings
        document.getElementById('brushSize').addEventListener('input', (e) => {
            const size = e.target.value;
            document.getElementById('brushSizeValue').textContent = size;
            console.log('Brush size changed:', size);
            if (this.canvasManager) {
                this.canvasManager.setBrushSize(size);
            }
        });

        document.getElementById('opacity').addEventListener('input', (e) => {
            const opacity = e.target.value;
            document.getElementById('opacityValue').textContent = opacity;
            console.log('Opacity changed:', opacity);
            if (this.canvasManager) {
                this.canvasManager.setOpacity(opacity);
            }
        });

        // Action buttons
        document.getElementById('clearBtn').addEventListener('click', () => {
            if (confirm('Clear the entire canvas?')) {
                console.log('Clearing canvas');
                if (this.canvasManager) {
                    this.canvasManager.clearCanvas();
                    this.updateButtonStates(); // Update button states after clear
                    this.updateHistoryCount(); // Update history count
                }
                if (this.wsClient) {
                    this.wsClient.sendClearCanvas();
                }
            }
        });

        // FIXED: Undo button handler
        document.getElementById('undoBtn').addEventListener('click', () => {
            console.log('Undo button clicked');
            if (this.canvasManager && this.canvasManager.canUndo()) {
                this.canvasManager.simpleUndo().then(() => {
                    this.updateButtonStates();
                    this.updateHistoryCount();
                });
            }
            
            // Send undo request to server for synchronization
            if (this.wsClient) {
                this.wsClient.sendUndoRequest();
            }
        });

        // FIXED: Redo button handler
        document.getElementById('redoBtn').addEventListener('click', () => {
            console.log('Redo button clicked');
            if (this.canvasManager && this.canvasManager.canRedo()) {
                this.canvasManager.simpleRedo().then(() => {
                    this.updateButtonStates();
                    this.updateHistoryCount();
                });
            }
            
            // Send redo request to server for synchronization
            if (this.wsClient) {
                this.wsClient.sendRedoRequest();
            }
        });

        document.getElementById('copyRoomBtn').addEventListener('click', () => {
            const link = `${window.location.origin}?room=${this.currentRoom}`;
            navigator.clipboard.writeText(link).then(() => {
                this.showNotification('Room link copied to clipboard!', 'success');
            });
        });

        // Handle room from URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
            this.currentRoom = roomParam;
            document.getElementById('roomId').textContent = roomParam;
        }

        // Handle beforeunload
        window.addEventListener('beforeunload', () => {
            if (this.wsClient) {
                this.wsClient.sendUserLeave();
            }
        });
        
        console.log('Event listeners setup complete');
    }

    selectTool(tool) {
        console.log('Selecting tool:', tool);
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
        if (this.canvasManager) {
            this.canvasManager.setTool(tool);
        }
    }

    selectColor(color) {
        console.log('Selecting color:', color);
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
        });
        const colorOption = document.querySelector(`[data-color="${color}"]`);
        if (colorOption) {
            colorOption.classList.add('active');
        }
        document.getElementById('customColor').value = color;
        if (this.canvasManager) {
            this.canvasManager.setColor(color);
        }
    }

    initializeCanvas() {
        console.log('Initializing canvas...');
        const canvas = document.getElementById('drawingCanvas');
        const cursorLayer = document.getElementById('cursorLayer');
        
        if (!canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        if (!cursorLayer) {
            console.error('Cursor layer element not found!');
            return;
        }
        
        // Initialize CanvasManager
        this.canvasManager = new CanvasManager(canvas, cursorLayer, this.userId, this.userColor);
        
        // Setup drawing events
        this.canvasManager.onDrawStart = (data) => {
            console.log('Draw start:', data);
            if (this.wsClient) {
                this.wsClient.sendDrawStart(data);
            }
        };
        
        this.canvasManager.onDraw = (data) => {
            console.log('Drawing:', data);
            if (this.wsClient) {
                this.wsClient.sendDrawing(data);
            }
        };
        
        this.canvasManager.onDrawEnd = (data) => {
            console.log('Draw end:', data);
            // Update button states and history count after drawing is complete
            this.updateButtonStates();
            this.updateHistoryCount();
            
            if (this.wsClient) {
                this.wsClient.sendDrawEnd(data);
            }
        };
        
        this.canvasManager.onCursorMove = (data) => {
            if (this.wsClient) {
                this.wsClient.sendCursorMove(data);
            }
        };

        // Select default tool and color
        this.selectTool('brush');
        this.selectColor('#000000');

        // Initialize button states and history count
        this.updateButtonStates();
        this.updateHistoryCount();

        console.log('Canvas initialization complete');
    }

    initializeWebSocket() {
        console.log('Initializing WebSocket...');
        
        // Initialize WebSocketClient
        this.wsClient = new WebSocketClient(
            this.userId,
            this.userColor,
            this.currentRoom,
            this.username
        );

        // Setup WebSocket event handlers
        this.wsClient.onUserJoin = (data) => {
            console.log('User joined:', data);
            this.showNotification(`${data.username || 'User'} joined the room`, 'info');
            this.updateUsersList(data.users);
        };

        this.wsClient.onUserLeave = (data) => {
            console.log('User left:', data);
            this.showNotification(`${data.username || 'User'} left the room`, 'warning');
            this.updateUsersList(data.users);
            if (this.canvasManager) {
                this.canvasManager.removeUserCursor(data.userId);
            }
        };

        this.wsClient.onDrawing = (data) => {
            console.log('Remote drawing:', data);
            if (this.canvasManager) {
                this.canvasManager.drawRemote(data);
            }
        };

        this.wsClient.onCursorMove = (data) => {
            if (this.canvasManager) {
                this.canvasManager.updateRemoteCursor(data);
            }
        };

        this.wsClient.onClearCanvas = () => {
            console.log('Canvas cleared');
            if (this.canvasManager) {
                this.canvasManager.clearCanvas();
                this.updateButtonStates(); // Update button states
                this.updateHistoryCount(); // Update history count
            }
            this.showNotification('Canvas was cleared', 'info');
        };

        this.wsClient.onUndo = (data) => {
            console.log('Remote undo:', data);
            if (this.canvasManager) {
                this.canvasManager.undoRemote(data.actionId);
                this.updateButtonStates(); // Update button states
                this.updateHistoryCount(); // Update history count
            }
        };

        this.wsClient.onRedo = (data) => {
            console.log('Remote redo:', data);
            if (this.canvasManager) {
                this.canvasManager.redoRemote(data.actionId);
                this.updateButtonStates(); // Update button states
                this.updateHistoryCount(); // Update history count
            }
        };

        this.wsClient.onHistoryUpdate = (data) => {
            console.log('History update:', data);
            this.updateHistoryCount(data.count);
        };

        this.wsClient.onLatencyUpdate = (latency) => {
            document.getElementById('latency').textContent = `${latency}ms`;
        };

        this.wsClient.onConnectionStatus = (status) => {
            document.getElementById('connectionStatus').textContent = status;
            console.log('Connection status:', status);
        };

        this.wsClient.onInitialState = (data) => {
            console.log('Initial state:', data);
            if (this.canvasManager) {
                this.canvasManager.loadInitialState(data);
            }
            this.updateUsersList(data.users);
            this.updateHistoryCount(data.historyCount);
            this.updateButtonStates(); // Update button states
            this.showNotification('Connected to room!', 'success');
        };
        
        console.log('WebSocket initialization complete');
    }

    updateUsersList(users) {
        const usersList = document.getElementById('usersList');
        const userCount = document.getElementById('userCount');
        
        if (!usersList || !userCount) {
            console.error('User list elements not found');
            return;
        }
        
        usersList.innerHTML = '';
        userCount.textContent = users ? users.length : 0;
        
        if (users) {
            users.forEach(user => {
                const userElement = document.createElement('div');
                userElement.className = 'user-item';
                userElement.innerHTML = `
                    <div class="user-color" style="background-color: ${user.color}"></div>
                    <span>${user.username || 'User'} ${user.id === this.userId ? '(You)' : ''}</span>
                `;
                usersList.appendChild(userElement);
            });
        }
    }

    updateHistoryCount(count = null) {
        const historyCountElement = document.getElementById('historyCount');
        if (historyCountElement) {
            if (count !== null) {
                // Use provided count
                historyCountElement.textContent = count;
            } else if (this.canvasManager) {
                // Get count from canvas manager
                historyCountElement.textContent = this.canvasManager.localHistory.length;
            } else {
                historyCountElement.textContent = '0';
            }
        }
    }

    showNotification(message, type = 'info') {
        const notificationArea = document.getElementById('notificationArea');
        if (!notificationArea) {
            console.error('Notification area not found');
            return;
        }

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        notificationArea.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // FIXED: Update button states method
    updateButtonStates() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (this.canvasManager) {
            // Check if buttons exist before trying to disable them
            if (undoBtn) {
                undoBtn.disabled = !this.canvasManager.canUndo();
            }
            if (redoBtn) {
                redoBtn.disabled = !this.canvasManager.canRedo();
            }
        } else {
            if (undoBtn) undoBtn.disabled = true;
            if (redoBtn) redoBtn.disabled = true;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.app = new CollaborativeCanvasApp();
});