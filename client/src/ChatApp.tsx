import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Users, Copy, Check, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Toaster, toast } from 'sonner';

interface Message {
  id: string;
  content: string;
  sender: string;
  senderId: string;
  timestamp: Date;
}

const ChatApp = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userCount, setUserCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:5001');
    setWs(websocket);

    websocket.onopen = () => {
      toast.success('Connected to chat server');
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    websocket.onerror = () => {
      toast.error('Failed to connect to chat server');
    };

    websocket.onclose = () => {
      toast.error('Lost connection to chat server');
    };

    return () => {
      websocket.close();
    };
  }, []);

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case "userId-set":
        setUserId(data.userId);
        setError(null);
        toast.success('User ID set successfully');
        break;
        
      case "room-created":
        setRoomCode(data.roomCode);
        setError(null);
        toast.success('Room created successfully');
        break;
        
      case "joined-room":
        setJoined(true);
        setMessages(data.messages);
        setError(null);
        toast.success('Joined room successfully');
        break;
        
      case "user-joined":
        setUserCount(data.userCount);
        toast.info(`${data.userCount} users in room`);
        break;
        
      case "user-left":
        setUserCount(data.userCount);
        toast(`${data.userCount} users remaining`);
        break;
        
      case "new-message":
        setMessages(prev => [...prev, data.message]);
        break;
        
      case "error":
        setError(data.message);
        toast.error(data.message);
        break;
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const setUser = () => {
    const generatedUserId = Math.random().toString(36).substring(2, 15);
    ws?.send(JSON.stringify({
      type: "set-userId",
      userId: generatedUserId
    }));
  };

  const createRoom = () => {
    ws?.send(JSON.stringify({
      type: "create-room"
    }));
  };

  const joinRoom = () => {
    ws?.send(JSON.stringify({
      type: "join-room",
      roomCode: roomCode
    }));
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    ws?.send(JSON.stringify({
      type: "chat-message",
      content: newMessage,
      sender: username
    }));
    setNewMessage('');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Room code copied to clipboard');
  };

  if (!joined) {
    return (
      <>
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-center">Join Chat Room</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full"
                  />
                  <Button 
                    className="w-full mt-2" 
                    onClick={setUser}
                    disabled={!username.trim()}
                  >
                    Set Username
                  </Button>
                </div>

                <Separator />
                
                <div className="space-y-2">
                  <Input
                    placeholder="Enter room code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full"
                  />
                  <div className="flex gap-2">
                    <Button 
                      className="w-full" 
                      onClick={joinRoom}
                      disabled={!userId || !roomCode}
                    >
                      Join Room
                    </Button>
                    <Button 
                      className="w-full" 
                      onClick={createRoom}
                      disabled={!userId}
                      variant="outline"
                    >
                      Create Room
                    </Button>
                  </div>
                </div>

                {roomCode && (
                  <Alert>
                    <AlertDescription className="flex items-center justify-between">
                      <span className="font-mono">Room Code: {roomCode}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={copyRoomCode}
                        className="h-8 w-8"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <Toaster position="top-right" expand={true} richColors />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 flex flex-col p-4">
        <Card className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold">Chat Room: {roomCode}</CardTitle>
                <div className="text-sm text-muted-foreground">Logged in as {username}</div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {userCount} online
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-4 flex flex-col">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.senderId !== userId && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{msg.sender[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                    )}
                    <div 
                      className={`max-w-[80%] ${
                        msg.senderId === userId 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      } rounded-lg p-3`}
                    >
                      <div className="text-sm font-medium mb-1">{msg.sender}</div>
                      <div className="text-sm">{msg.content}</div>
                      <div className="text-xs opacity-70 mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <form onSubmit={sendMessage} className="mt-4 flex gap-2">
              <Input
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={!newMessage.trim()}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Toaster position="top-right" expand={true} richColors />
    </>
  );
};

export default ChatApp;