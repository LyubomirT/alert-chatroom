const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');

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
    name: req.body.roomName,
    showPastMessages: req.body.showPastMessages === 'on',
    messages: [],
    pinnedMessages: new Map(),
    hostTimeout: null,
    deletionTimeout: null,
    bannedIPs: new Set(),
    discoverable: false // New: default to not discoverable
  });
  res.redirect(`/room/${roomId}`);
});

app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (chatrooms.has(roomId)) {
    res.render('chatroom', { roomId });
  } else {
    res.status(404).render('404');
  }
});

// New: Discover route
app.get('/discover', (req, res) => {
  const discoverableRooms = Array.from(chatrooms.entries())
    .filter(([_, room]) => room.discoverable)
    .map(([id, room]) => ({
      id,
      name: room.name,
      userCount: room.users.size
    }));
  res.render('discover', { rooms: discoverableRooms });
});

app.get('/api/search-rooms', (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : '';
  const page = parseInt(req.query.page) || 0;
  const pageSize = 10;

  const matchingRooms = Array.from(chatrooms.entries())
    .filter(([_, room]) => room.discoverable && room.name.toLowerCase().includes(query))
    .map(([id, room]) => ({
      id,
      name: room.name,
      userCount: room.users.size
    }));

  const startIndex = page * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRooms = matchingRooms.slice(startIndex, endIndex);

  res.json({
    rooms: paginatedRooms,
    hasMore: endIndex < matchingRooms.length
  });
});

// New: Get random room
app.get('/api/random-room', (req, res) => {
  const discoverableRooms = Array.from(chatrooms.entries())
    .filter(([_, room]) => room.discoverable);
  if (discoverableRooms.length > 0) {
    const randomRoom = discoverableRooms[Math.floor(Math.random() * discoverableRooms.length)];
    res.json({ id: randomRoom[0], name: randomRoom[1].name });
  } else {
    res.status(404).json({ error: 'No discoverable rooms available' });
  }
});

app.post('/join-room', (req, res) => {
  const link = req.body.inviteLink;
  const roomId = link.substring(link.lastIndexOf('/') + 1);
  if (chatrooms.has(roomId)) {
    res.redirect(`/room/${roomId}`);
  } else {
    res.status(404).render('404');
  }
});

// Modify the GET /api/messages/:roomId route
app.get('/api/messages/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const page = parseInt(req.query.page) || 0;
  const pageSize = 20;

  if (chatrooms.has(roomId)) {
      const room = chatrooms.get(roomId);
      if (room.showPastMessages) {
          const startIndex = room.messages.length - (page + 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const messages = room.messages.slice(Math.max(0, startIndex), endIndex);
          res.json({
              messages: messages.reverse(),
              hasMore: startIndex > 0
          });
      } else {
          res.json({
              messages: [],
              hasMore: false
          });
      }
  } else {
      res.status(404).json({ error: 'Room not found' });
  }
});

wss.on('connection', (ws, req) => {
  let roomId;
  let username;
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'join':
        roomId = data.roomId;
        username = data.username;

        if (chatrooms.has(roomId)) {
            const room = chatrooms.get(roomId);
            
            // Check if IP is banned
            if (room.bannedIPs.has(clientIP)) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'You are banned from this room'
                }));
                ws.close();
                return;
            }

            // Clear deletion timeout if it exists
            if (room.deletionTimeout) {
                clearTimeout(room.deletionTimeout);
                room.deletionTimeout = null;
            }

            // Check if username already exists
            if (Array.from(room.users.values()).includes(username)) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Username already taken'
                }));
                return;
            }
            
            room.users.set(ws, username);
            
            if (!room.host) {
                setNewHost(room, ws, username);
            } else if (username === room.hostUsername && room.hostTimeout) {
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
            ws.send(JSON.stringify({ 
                type: 'roomName', 
                name: room.name,
                host: room.hostUsername,
                showPastMessages: room.showPastMessages
            }));

            // Send banned list to host
            if (room.host === ws) {
                ws.send(JSON.stringify({
                    type: 'updateBannedList',
                    bannedList: Array.from(room.bannedIPs).map(ip => ({ ip, username: '' }))
                }));
            }
        } else {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
            }));
        }
        break;

      case 'message':
        if (chatrooms.has(roomId)) {
            const messageId = uuidv4();
            const messageData = {
                type: 'message',
                messageId: messageId,
                content: data.content,
                sender: username,
                isFile: data.isFile || false,
                fileName: data.fileName || null,
                replyTo: data.replyTo ? {
                    messageId: data.replyTo.messageId,
                    sender: data.replyTo.sender,
                    content: data.replyTo.content.substring(0, 100) + (data.replyTo.content.length > 100 ? '...' : '')
                } : null,
                reactions: {}  // Initialize empty reactions object
            };
            chatrooms.get(roomId).messages.push(messageData);
            broadcastToRoom(roomId, messageData);
        } else {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
            }));
        }
        break;

      case 'deleteMessage':
        if (chatrooms.has(roomId)) {
          const room = chatrooms.get(roomId);
          const messageIndex = room.messages.findIndex(m => m.messageId === data.messageId);
          if (messageIndex !== -1) {
            const message = room.messages[messageIndex];
            if (message.sender === username || room.host === ws) {
              room.messages.splice(messageIndex, 1);
              broadcastToRoom(roomId, {
                type: 'deleteMessage',
                messageId: data.messageId
              });
            }
          }
        }
        break;

      case 'pin':
        if (chatrooms.has(roomId)) {
            if(!(chatrooms.get(roomId).pinnedMessages.has(data.id))){
                const pinnedMessageData = {
                    type: 'addPin',
                    messageId: data.id,
                    content: data.content,
                    sender: data.sender,
                    isFile: data.isFile || false,
                    fileName: data.fileName || null,
                };
                chatrooms.get(roomId).pinnedMessages.set(data.id, pinnedMessageData);
                broadcastToRoom(roomId, pinnedMessageData);
            }
        } else {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
            }));
        }
        break;

      case 'unpin':
        if (chatrooms.has(roomId)) {
            if(chatrooms.get(roomId).pinnedMessages.has(data.id)){
                chatrooms.get(roomId).pinnedMessages.delete(data.id);
                const pinnedMessageData = {
                  type: 'removePin',
                  messageId: data.id,
                };
                broadcastToRoom(roomId, pinnedMessageData);
            }
        } else {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Room not found'
            }));
        }
        break;

      case 'roomName':
        if (chatrooms.has(roomId) && chatrooms.get(roomId).host === ws) {
          chatrooms.get(roomId).name = data.name;
          broadcastToRoom(roomId, {
            type: 'roomName',
            name: data.name,
            host: chatrooms.get(roomId).hostUsername
          });
        }
        break;

      case 'kick':
        if (chatrooms.has(roomId) && chatrooms.get(roomId).host === ws) {
          const userToKick = Array.from(chatrooms.get(roomId).users.entries())
            .find(([_, name]) => name === data.username);
          
          if (userToKick) {
            const kickedIP = userToKick[0]._socket.remoteAddress;
            userToKick[0].send(JSON.stringify({ type: 'kicked' }));
            userToKick[0].close();

            // Ask host if they want to ban the IP
            ws.send(JSON.stringify({
              type: 'banPrompt',
              username: data.username,
              ip: kickedIP
            }));
          }
        }
        break;

      case 'ban':
        if (chatrooms.has(roomId) && chatrooms.get(roomId).host === ws) {
          const room = chatrooms.get(roomId);
          room.bannedIPs.add(data.ip);
          broadcastToRoom(roomId, {
            type: 'updateBannedList',
            bannedList: Array.from(room.bannedIPs).map(ip => ({ ip, username: data.username }))
          });
        }
        break;

      case 'unban':
        if (chatrooms.has(roomId) && chatrooms.get(roomId).host === ws) {
          const room = chatrooms.get(roomId);
          room.bannedIPs.delete(data.ip);
          broadcastToRoom(roomId, {
            type: 'updateBannedList',
            bannedList: Array.from(room.bannedIPs).map(ip => ({ ip, username: '' }))
          });
        }
        break;

      case 'leave':
        handleUserLeave(ws, roomId, username);
        break;

      case 'reaction':
        handleReaction(roomId, username, data.messageId, data.emoji);
        break;

      case 'toggleReaction':
        handleToggleReaction(roomId, username, data.messageId, data.emoji);
        break;

      case 'typing':
        handleTypingStatus(roomId, username, data.typing);
        break;

      case 'toggleDiscoverability':
        if (chatrooms.has(roomId) && chatrooms.get(roomId).host === ws) {
          const room = chatrooms.get(roomId);
          room.discoverable = data.discoverable;
          ws.send(JSON.stringify({
            type: 'discoverabilityUpdate',
            discoverable: room.discoverable
          }));
        }
        break;
    }
  });

  ws.on('close', () => {
    handleUserLeave(ws, roomId, username);
  });
});

function handleTypingStatus(roomId, username, isTyping) {
  if (chatrooms.has(roomId)) {
      const room = chatrooms.get(roomId);
      if (isTyping) {
          room.typingUsers = room.typingUsers || new Set();
          room.typingUsers.add(username);
      } else {
          if (room.typingUsers) {
              room.typingUsers.delete(username);
          }
      }
      broadcastTypingStatus(roomId);
  }
}

function broadcastTypingStatus(roomId) {
  if (chatrooms.has(roomId)) {
      const room = chatrooms.get(roomId);
      const typingUsers = Array.from(room.typingUsers || []);
      broadcastToRoom(roomId, {
          type: 'typingUpdate',
          typingUsers: typingUsers
      });
  }
}

function setNewHost(room, ws, username) {
  room.host = ws;
  room.hostUsername = username;
  ws.send(JSON.stringify({ type: 'host' }));
  broadcastToRoom(room, {
    type: 'newHost',
    host: username
  });
}

function handleUserLeave(ws, roomId, username) {
  if (roomId && chatrooms.has(roomId)) {
    const room = chatrooms.get(roomId);
    room.users.delete(ws);

    if (room.host === ws) {
      room.host = null;
      room.hostUsername = null;
      
      // Clear any existing host timeout
      if (room.hostTimeout) {
        clearTimeout(room.hostTimeout);
      }

      // Set a new host immediately if there are other users
      if (room.users.size > 0) {
        const [newHost, newHostUsername] = room.users.entries().next().value;
        setNewHost(room, newHost, newHostUsername);
        broadcastToRoom(roomId, {
          type: 'message',
          content: `${newHostUsername} is now the host.`,
          sender: 'System'
        });
      } else {
        // If no users left, set a deletion timeout
        room.deletionTimeout = setTimeout(() => {
          chatrooms.delete(roomId);
        }, 300000); // 5 minutes
      }
    }

    if (room.users.size > 0) {
        broadcastToRoom(roomId, {
            type: 'message',
            content: `${username} has left the chat`,
            sender: 'System'
        });
        updateUsersList(roomId);
    }

    // Remove user's reactions from all messages
    room.messages.forEach(message => {
        if (message.reactions) {
            Object.keys(message.reactions).forEach(emoji => {
                const index = message.reactions[emoji].indexOf(username);
                if (index > -1) {
                    message.reactions[emoji].splice(index, 1);
                    if (message.reactions[emoji].length === 0) {
                        delete message.reactions[emoji];
                    }
                    broadcastReactions(roomId, message.messageId, message.reactions);
                }
            });
        }
    });
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
    const room = chatrooms.get(roomId);
    const users = Array.from(room.users.values());
    broadcastToRoom(roomId, {
      type: 'userList',
      users: users,
      host: room.hostUsername
    });
  }
}

function handleReaction(roomId, username, messageId, emoji) {
  if (chatrooms.has(roomId)) {
    const room = chatrooms.get(roomId);
    const message = room.messages.find(m => m.messageId === messageId);
    if (message) {
      if (!message.reactions) {
        message.reactions = {};
      }
      if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
      }
      if (!message.reactions[emoji].includes(username)) {
        message.reactions[emoji].push(username);
        broadcastReactions(roomId, messageId, message.reactions);
      }
    }
  }
}

function handleToggleReaction(roomId, username, messageId, emoji) {
  if (chatrooms.has(roomId)) {
    const room = chatrooms.get(roomId);
    const message = room.messages.find(m => m.messageId === messageId);
    if (message && message.reactions && message.reactions[emoji]) {
      const index = message.reactions[emoji].indexOf(username);
      if (index > -1) {
        message.reactions[emoji].splice(index, 1);
        if (message.reactions[emoji].length === 0) {
          delete message.reactions[emoji];
        }
      } else {
        message.reactions[emoji].push(username);
      }
      broadcastReactions(roomId, messageId, message.reactions);
    }
  }
}

function broadcastReactions(roomId, messageId, reactions) {
  broadcastToRoom(roomId, {
    type: 'updateReactions',
    messageId: messageId,
    reactions: reactions
  });
}

app.use((req, res, next) => {
  res.status(404).render('404');
});

function retrieveFromHostIni(section, key) {
  const fs = require('fs');
  const ini = require('ini');
  const config = ini.parse(fs.readFileSync('host.ini', 'utf-8'));
  return config[section][key];
}

function ThreadRunJPRQ() {
  // retrieve COMMAND from host.ini
  const COMMAND = retrieveFromHostIni('JPRQ', 'COMMAND');
  // retrieve ARGS from host.ini
  const ARGS = retrieveFromHostIni('JPRQ', 'ARGS');

  // execute command
  exec(`${COMMAND} http ${retrieveFromHostIni('JPRQ', 'PORT')} ${ARGS}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
}

const PORT = retrieveFromHostIni('JPRQ', 'PORT');
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (retrieveFromHostIni('GENERAL', 'MODE') === 'JPRQ') {
    ThreadRunJPRQ();
  }
});