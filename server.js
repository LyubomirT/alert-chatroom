const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const chatrooms = new Map();

app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/create-room', (req, res) => {
  const roomId = uuidv4();
  chatrooms.set(roomId, { 
    users: new Map(),
    host: null,
    hostUsername: null,
    name: 'Alert Chatroom',
    showPastMessages: req.body.showPastMessages === 'on',
    messages: [],
    hostTimeout: null
  });
  res.redirect(`/room/${roomId}`);
});

app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (chatrooms.has(roomId)) {
    res.render('chatroom', { roomId });
  } else {
    res.redirect('/');
  }
});

wss.on('connection', (ws, req) => {
  let roomId;
  let username;

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'join':
        roomId = data.roomId;
        username = data.username;

        if (chatrooms.has(roomId)) {
          const room = chatrooms.get(roomId);
          room.users.set(ws, username);
          
          if (!room.host) {
            setNewHost(room, ws, username);
          } else if (username === room.hostUsername && room.hostTimeout) {
            // If the joining user has the same name as the previous host
            clearTimeout(room.hostTimeout);
            room.hostTimeout = null;
            setNewHost(room, ws, username);
          }

          broadcastToRoom(roomId, {
            type: 'message',
            content: `${username} has joined the chat`,
            sender: 'System'
          });
          updateUsersList(roomId);
          ws.send(JSON.stringify({ type: 'roomName', name: room.name }));

          if (room.showPastMessages) {
            room.messages.forEach(msg => {
              ws.send(JSON.stringify(msg));
            });
          }
        }
        break;

      case 'message':
        const messageData = {
          type: 'message',
          content: data.content,
          sender: username,
          isImage: data.isImage || false
        };
        chatrooms.get(roomId).messages.push(messageData);
        broadcastToRoom(roomId, messageData);
        break;

      case 'roomName':
        if (chatrooms.get(roomId).host === ws) {
          chatrooms.get(roomId).name = data.name;
          broadcastToRoom(roomId, {
            type: 'roomName',
            name: data.name
          });
        }
        break;

      case 'kick':
        if (chatrooms.get(roomId).host === ws) {
          const userToKick = Array.from(chatrooms.get(roomId).users.entries())
            .find(([_, name]) => name === data.username);
          
          if (userToKick) {
            userToKick[0].send(JSON.stringify({ type: 'kicked' }));
            userToKick[0].close();
          }
        }
        break;

      case 'leave':
        handleUserLeave(ws, roomId, username);
        break;
    }
  });

  ws.on('close', () => {
    handleUserLeave(ws, roomId, username);
  });
});

function setNewHost(room, ws, username) {
  room.host = ws;
  room.hostUsername = username;
  ws.send(JSON.stringify({ type: 'host' }));
}

function handleUserLeave(ws, roomId, username) {
  if (roomId && chatrooms.has(roomId)) {
    const room = chatrooms.get(roomId);
    room.users.delete(ws);

    if (room.host === ws) {
      room.host = null;
      room.hostTimeout = setTimeout(() => {
        if (room.users.size > 0) {
          broadcastToRoom(roomId, {
            type: 'message',
            content: 'The host has left and no one took over. This room will be closed.',
            sender: 'System'
          });
          room.users.forEach((_, userWs) => {
            userWs.close();
          });
        }
        chatrooms.delete(roomId);
      }, 120000); // 2 minutes
    }

    if (room.users.size > 0) {
      broadcastToRoom(roomId, {
        type: 'message',
        content: `${username} has left the chat`,
        sender: 'System'
      });
      updateUsersList(roomId);
    } else {
      chatrooms.delete(roomId);
    }
  }
}

function broadcastToRoom(roomId, message) {
  if (chatrooms.has(roomId)) {
    chatrooms.get(roomId).users.forEach((username, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}

function updateUsersList(roomId) {
  if (chatrooms.has(roomId)) {
    const users = Array.from(chatrooms.get(roomId).users.values());
    broadcastToRoom(roomId, {
      type: 'userList',
      users: users
    });
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});