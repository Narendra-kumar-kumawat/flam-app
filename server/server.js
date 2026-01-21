const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RoomManager = require('./roomManager.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const roomManager = new RoomManager();

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

// API endpoint to get room info
app.get('/api/room/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const room = roomManager.getRoom(roomId);
    
    if (room) {
        res.json({
            roomId,
            userCount: room.users.size,
            canvasState: room.canvasState,
            historyCount: room.actionHistory.length
        });
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// API endpoint to create or join room
app.post('/api/room/:roomId/join', (req, res) => {
    const roomId = req.params.roomId;
    const { userId, username, color } = req.body;
    
    const room = roomManager.joinRoom(roomId, userId, username, color);
    res.json({
        roomId,
        userId,
        users: Array.from(room.users.values()),
        canvasState: room.canvasState,
        historyCount: room.actionHistory.length
    });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    let currentUser = null;
    let currentRoom = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket connection closed');
        if (currentUser && currentRoom) {
            handleUserLeave(currentRoom, currentUser.id);
        }
    });
    
    function handleMessage(ws, data) {
        switch (data.type) {
            case 'join':
                handleJoin(ws, data);
                break;
            case 'draw_start':
                handleDrawStart(data);
                break;
            case 'draw':
                handleDrawing(data);
                break;
            case 'draw_end':
                handleDrawEnd(data);
                break;
            case 'cursor_move':
                handleCursorMove(data);
                break;
            case 'clear_canvas':
                handleClearCanvas(data);
                break;
            case 'undo':
                handleUndo(data);
                break;
            case 'redo':
                handleRedo(data);
                break;
            case 'ping':
                handlePing(ws, data);
                break;
        }
    }
    
    function handleJoin(ws, data) {
        const { roomId, userId, username, color } = data;
        
        const room = roomManager.joinRoom(roomId, userId, username, color);
        currentUser = { id: userId, username, color, ws };
        currentRoom = roomId;
        
        // Add WebSocket reference to user
        room.users.set(userId, { ...currentUser, lastSeen: Date.now() });
        
        // Send initial state to the joining user
        ws.send(JSON.stringify({
            type: 'initial_state',
            roomId,
            users: Array.from(room.users.values()),
            canvasState: room.canvasState,
            historyCount: room.actionHistory.length
        }));
        
        // Notify other users in the room
        broadcastToRoom(roomId, userId, {
            type: 'user_join',
            userId,
            username,
            color,
            users: Array.from(room.users.values())
        });
    }
    
    function handleDrawStart(data) {
        const { roomId, userId, ...drawData } = data;
        roomManager.addAction(roomId, {
            type: 'draw_start',
            userId,
            ...drawData,
            timestamp: Date.now(),
            actionId: generateActionId()
        });
        
        broadcastToRoom(roomId, userId, {
            type: 'draw_start',
            userId,
            ...drawData
        });
    }
    
    function handleDrawing(data) {
        const { roomId, userId, ...drawData } = data;
        broadcastToRoom(roomId, userId, {
            type: 'draw',
            userId,
            ...drawData
        });
    }
    
    function handleDrawEnd(data) {
        const { roomId, userId } = data;
        roomManager.addAction(roomId, {
            type: 'draw_end',
            userId,
            timestamp: Date.now(),
            actionId: generateActionId()
        });
        
        // Update history count for all users
        const room = roomManager.getRoom(roomId);
        if (room) {
            broadcastToRoom(roomId, null, {
                type: 'history_update',
                count: room.actionHistory.length
            });
        }
    }
    
    function handleCursorMove(data) {
        const { roomId, userId, ...cursorData } = data;
        broadcastToRoom(roomId, userId, {
            type: 'cursor_move',
            userId,
            ...cursorData
        });
    }
    
    function handleClearCanvas(data) {
        const { roomId, userId } = data;
        
        roomManager.clearCanvas(roomId);
        
        broadcastToRoom(roomId, userId, {
            type: 'clear_canvas'
        });
        
        const room = roomManager.getRoom(roomId);
        if (room) {
            broadcastToRoom(roomId, null, {
                type: 'history_update',
                count: room.actionHistory.length
            });
        }
    }
    
    function handleUndo(data) {
        const { roomId, userId } = data;
        const action = roomManager.undoLastAction(roomId, userId);
        
        if (action) {
            broadcastToRoom(roomId, userId, {
                type: 'undo',
                actionId: action.actionId,
                userId
            });
            
            const room = roomManager.getRoom(roomId);
            if (room) {
                broadcastToRoom(roomId, null, {
                    type: 'history_update',
                    count: room.actionHistory.length
                });
            }
        }
    }
    
    function handleRedo(data) {
        const { roomId, userId } = data;
        const action = roomManager.redoAction(roomId, userId);
        
        if (action) {
            broadcastToRoom(roomId, userId, {
                type: 'redo',
                actionId: action.actionId,
                userId
            });
            
            const room = roomManager.getRoom(roomId);
            if (room) {
                broadcastToRoom(roomId, null, {
                    type: 'history_update',
                    count: room.actionHistory.length
                });
            }
        }
    }
    
    function handlePing(ws, data) {
        ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
            clientTimestamp: data.timestamp
        }));
    }
    
    function handleUserLeave(roomId, userId) {
        const room = roomManager.getRoom(roomId);
        if (room && room.users.has(userId)) {
            room.users.delete(userId);
            
            broadcastToRoom(roomId, userId, {
                type: 'user_leave',
                userId,
                users: Array.from(room.users.values())
            });
            
            // Clean up empty rooms
            if (room.users.size === 0) {
                roomManager.cleanupRoom(roomId);
            }
        }
    }
    
    function broadcastToRoom(roomId, excludeUserId, message) {
        const room = roomManager.getRoom(roomId);
        if (!room) return;
        
        const messageStr = JSON.stringify(message);
        
        room.users.forEach((user, userId) => {
            if (userId !== excludeUserId && user.ws && user.ws.readyState === WebSocket.OPEN) {
                user.ws.send(messageStr);
            }
        });
    }
    
    function generateActionId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
});

// Clean up inactive rooms periodically
setInterval(() => {
    roomManager.cleanupInactiveRooms(30 * 60 * 1000); // 30 minutes
}, 5 * 60 * 1000); // Every 5 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready`);
});