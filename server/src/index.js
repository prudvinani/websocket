"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = __importStar(require("ws"));
const crypto_1 = require("crypto");
// Create Express app and HTTP server
const app = (0, express_1.default)();
app.use(express_1.default.json());
const httpServer = (0, http_1.createServer)(app);
// Initialize WebSocket server - attach to existing HTTP server
const wss = new ws_1.WebSocketServer({ server: httpServer });
// Store rooms data
const rooms = new Map();
// WebSocket connection handler
wss.on("connection", function connection(ws) {
    ws.on("error", console.error);
    // Handle incoming messages
    ws.on("message", function incoming(data) {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case "set-userId":
                    if (!message.userId) {
                        throw new Error("userId is required");
                    }
                    ws.userId = message.userId;
                    ws.send(JSON.stringify({
                        type: "userId-set",
                        userId: ws.userId
                    }));
                    break;
                case "create-room":
                    if (!ws.userId) {
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Must set userId before creating a room"
                        }));
                        return;
                    }
                    const roomCode = (0, crypto_1.randomBytes)(5).toString("hex").toUpperCase();
                    rooms.set(roomCode, {
                        users: new Set([ws.userId]),
                        messages: [],
                        lastActive: Date.now()
                    });
                    ws.roomCode = roomCode;
                    ws.send(JSON.stringify({
                        type: "room-created",
                        roomCode: roomCode
                    }));
                    break;
                case "join-room":
                    if (!message.roomCode) {
                        throw new Error("roomCode is required");
                    }
                    if (!ws.userId) {
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Must set userId before joining a room"
                        }));
                        return;
                    }
                    const room = rooms.get(message.roomCode);
                    if (!room) {
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Room not found"
                        }));
                        return;
                    }
                    ws.roomCode = message.roomCode;
                    room.users.add(ws.userId);
                    room.lastActive = Date.now();
                    // Send room data to the joining user
                    ws.send(JSON.stringify({
                        type: "joined-room",
                        roomCode: message.roomCode,
                        messages: room.messages
                    }));
                    // Broadcast to all clients in the room
                    broadcastToRoom(message.roomCode, {
                        type: "user-joined",
                        userCount: room.users.size
                    });
                    break;
                case "chat-message":
                    if (!message.content || !message.sender) {
                        throw new Error("Message content  and sender is required");
                    }
                    if (!ws.roomCode || !ws.userId) {
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Not joined to a room or userId not set"
                        }));
                        return;
                    }
                    const roomData = rooms.get(ws.roomCode);
                    if (!roomData) {
                        ws.send(JSON.stringify({
                            type: "error",
                            message: "Room no longer exists"
                        }));
                        return;
                    }
                    const newMessage = {
                        id: (0, crypto_1.randomBytes)(4).toString("hex"),
                        content: message.content,
                        sender: message.sender,
                        senderId: ws.userId,
                        timestamp: new Date()
                    };
                    roomData.messages.push(newMessage);
                    roomData.lastActive = Date.now();
                    broadcastToRoom(ws.roomCode, {
                        type: "new-message",
                        message: newMessage
                    });
                    break;
                default:
                    throw new Error(`Unknown message type: ${message.type}`);
            }
        }
        catch (error) {
            console.error("Error processing message:", error);
            ws.send(JSON.stringify({
                type: "error",
                message: error instanceof Error ? error.message : "Invalid message format"
            }));
        }
    });
    // Handle client disconnect
    ws.on("close", () => {
        if (ws.roomCode && ws.userId) {
            const room = rooms.get(ws.roomCode);
            if (room) {
                room.users.delete(ws.userId);
                room.lastActive = Date.now();
                broadcastToRoom(ws.roomCode, {
                    type: "user-left",
                    userCount: room.users.size
                });
            }
        }
    });
});
// // Cleanup inactive rooms every hour
// setInterval(() => {
//     const now = Date.now();
//     rooms.forEach((room, roomCode) => {
//         // Clean up rooms that have been inactive for 1 hour
//         if (room.users.size === 0 && now - room.lastActive > 3600000) {
//             console.log(`Cleaning up inactive room: ${roomCode}`);
//             rooms.delete(roomCode);
//         }
//     });
// }, 3600000); // Run every hour
// Utility function to broadcast messages to all clients in a room
function broadcastToRoom(roomCode, message) {
    wss.clients.forEach((client) => {
        if (client.roomCode === roomCode && client.readyState === ws_1.default.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}
// function broadcastToRoom(roomCode: string, message: any, excludeClient?: WSClient) {
//     wss.clients.forEach((client: WSClient) => {
//         if (
//             client.roomCode === roomCode && 
//             client.readyState === WebSocket.OPEN && 
//             (!excludeClient || client !== excludeClient)
//         ) {
//             client.send(JSON.stringify(message));
//         }
//     });
// }
// Express route
app.get("/", (req, res) => {
    res.status(200).json({ message: "WebSocket server is running" });
});
// Start the server
const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
