class WebSocketClient {
    constructor(userId, userColor, roomId, username = null) {
        this.userId = userId;
        this.userColor = userColor;
        this.roomId = roomId;
        this.username = username || `User_${userId.substr(0, 4)}`;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.pingInterval = null;
        this.lastPingTime = null;
        
        // Event handlers
        this.onUserJoin = null;
        this.onUserLeave = null;
        this.onDrawing = null;
        this.onCursorMove = null;
        this.onClearCanvas = null;
        this.onUndo = null;
        this.onRedo = null;
        this.onHistoryUpdate = null;
        this.onLatencyUpdate = null;
        this.onConnectionStatus = null;
        this.onInitialState = null;
        
        this.connect();
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            if (this.onConnectionStatus) {
                this.onConnectionStatus('Connected');
            }
            
            // Join the room
            this.sendJoin();
            
            // Start ping interval
            this.startPingInterval();
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data.type);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error, event.data);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            
            if (this.onConnectionStatus) {
                this.onConnectionStatus('Disconnected');
            }
            
            this.stopPingInterval();
            this.attemptReconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    handleMessage(data) {
        switch (data.type) {
            case 'initial_state':
                console.log('Received initial state');
                if (this.onInitialState) {
                    this.onInitialState(data);
                }
                break;
                
            case 'user_join':
                console.log('User joined:', data.userId);
                if (this.onUserJoin) {
                    this.onUserJoin(data);
                }
                break;
                
            case 'user_leave':
                console.log('User left:', data.userId);
                if (this.onUserLeave) {
                    this.onUserLeave(data);
                }
                break;
                
            case 'draw_start':
                console.log('Remote draw start');
                break;
                
            case 'draw':
                console.log('Remote drawing event');
                if (this.onDrawing) {
                    this.onDrawing(data);
                }
                break;
                
            case 'cursor_move':
                if (this.onCursorMove) {
                    this.onCursorMove(data);
                }
                break;
                
            case 'clear_canvas':
                console.log('Canvas cleared');
                if (this.onClearCanvas) {
                    this.onClearCanvas(data);
                }
                break;
                
            case 'undo':
                console.log('Remote undo');
                if (this.onUndo) {
                    this.onUndo(data);
                }
                break;
                
            case 'redo':
                console.log('Remote redo');
                if (this.onRedo) {
                    this.onRedo(data);
                }
                break;
                
            case 'history_update':
                console.log('History update');
                if (this.onHistoryUpdate) {
                    this.onHistoryUpdate(data);
                }
                break;
                
            case 'pong':
                this.handlePong(data);
                break;
                
            default:
                console.log('Unknown message type:', data.type);
        }
    }
    
    sendJoin() {
        this.send({
            type: 'join',
            roomId: this.roomId,
            userId: this.userId,
            username: this.username,
            color: this.userColor
        });
    }
    
    sendDrawStart(data) {
        this.send({
            type: 'draw_start',
            roomId: this.roomId,
            userId: this.userId,
            x: data.x,
            y: data.y,
            color: data.color,
            brushSize: data.brushSize,
            opacity: data.opacity,
            tool: data.tool,
            snapshot: data.snapshot
        });
    }
    
    sendDrawing(data) {
        this.send({
            type: 'draw',
            roomId: this.roomId,
            userId: this.userId,
            x: data.x,
            y: data.y,
            color: data.color,
            brushSize: data.brushSize,
            opacity: data.opacity,
            tool: data.tool
        });
    }
    
    sendDrawEnd(data) {
        this.send({
            type: 'draw_end',
            roomId: this.roomId,
            userId: this.userId
        });
    }
    
    sendCursorMove(data) {
        this.send({
            type: 'cursor_move',
            roomId: this.roomId,
            userId: this.userId,
            username: this.username,
            x: data.x,
            y: data.y,
            color: data.color
        });
    }
    
    sendClearCanvas() {
        this.send({
            type: 'clear_canvas',
            roomId: this.roomId,
            userId: this.userId
        });
    }
    
    sendUndoRequest() {
        this.send({
            type: 'undo',
            roomId: this.roomId,
            userId: this.userId
        });
    }
    
    sendRedoRequest() {
        this.send({
            type: 'redo',
            roomId: this.roomId,
            userId: this.userId
        });
    }
    
    sendUserLeave() {
        if (this.isConnected) {
            this.send({
                type: 'user_leave',
                roomId: this.roomId,
                userId: this.userId
            });
        }
    }
    
    send(data) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            console.log('Sending WebSocket message:', data.type);
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected, cannot send:', data.type);
        }
    }
    
    startPingInterval() {
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 30000); // Ping every 30 seconds
    }
    
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    sendPing() {
        this.lastPingTime = Date.now();
        this.send({
            type: 'ping',
            timestamp: this.lastPingTime
        });
    }
    
    handlePong(data) {
        if (this.lastPingTime) {
            const latency = Date.now() - data.clientTimestamp;
            if (this.onLatencyUpdate) {
                this.onLatencyUpdate(latency);
            }
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            console.log(`Attempting to reconnect in ${delay}ms...`);
            
            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
            if (this.onConnectionStatus) {
                this.onConnectionStatus('Failed to connect');
            }
        }
    }
    
    disconnect() {
        this.stopPingInterval();
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Make WebSocketClient available globally
if (typeof window !== 'undefined') {
    window.WebSocketClient = WebSocketClient;
}