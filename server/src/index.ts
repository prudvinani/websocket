import express from "express";
import { createServer } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { randomBytes } from "crypto";

// Type definitions
interface Message {
    id: string;
    content: string;
    sender: string;
    senderId: string;
    timestamp: Date;
}

interface RoomData {
    users: Set<string>;
    messages: Message[];
    lastActive: number;  // Fixed property name from 'lastactive'
}

interface WSClient extends WebSocket {
    userId?: string;
    roomCode?: string;
}

// Create Express app and HTTP server
const app = express();
app.use(express.json());
const httpServer = createServer(app);

// Initialize WebSocket server - attach to existing HTTP server
const wss = new WebSocketServer({ server: httpServer });

// Store rooms data
const rooms = new Map<string, RoomData>();

// WebSocket connection handler
wss.on("connection", function connection(ws: WSClient) {
    ws.on("error", console.error);

    // Handle incoming messages
    ws.on("message", function incoming(data: WebSocket.RawData) {
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
                    const roomCode = randomBytes(5).toString("hex").toUpperCase();
                    rooms.set(roomCode, {
                        users: new Set<string>([ws.userId]),
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

                    const newMessage: Message = {
                        id: randomBytes(4).toString("hex"),
                        content: message.content,
                        sender: message.sender ,
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
        } catch (error) {
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
function broadcastToRoom(roomCode: string, message: any) {
    wss.clients.forEach((client: WSClient) => {
        if (client.roomCode === roomCode && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

app.get("/", (req, res) => {
    res.status(200).json({ message: "WebSocket server is running" });
});

// Start the server
const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});