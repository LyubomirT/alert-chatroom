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

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/create-room', (req, res) => {
  const roomId = uuidv4();
  chatrooms.set(roomId, { users: new Map() });
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

    if (data.type === 'join') {
      roomId = data.roomId;
      username = data.username;

      if (chatrooms.has(roomId)) {
        chatrooms.get(roomId).users.set(ws, username);
        broadcastToRoom(roomId, {
          type: 'message',
          content: `${username} has joined the chat`,
          sender: 'System'
        });
        updateUsersList(roomId);
      }
    } else if (data.type === 'message') {
      broadcastToRoom(roomId, {
        type: 'message',
        content: data.content,
        sender: username
      });
    }
  });

  ws.on('close', () => {
    if (roomId && chatrooms.has(roomId)) {
      chatrooms.get(roomId).users.delete(ws);
      broadcastToRoom(roomId, {
        type: 'message',
        content: `${username} has left the chat`,
        sender: 'System'
      });
      updateUsersList(roomId);
    }
  });
});

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