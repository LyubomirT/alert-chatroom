const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const inviteLink = document.getElementById('invite-link');
const leaveBtn = document.getElementById('leave-btn');
const usersList = document.getElementById('users-list');
const roomNameElement = document.getElementById('room-name');
const editRoomNameBtn = document.getElementById('edit-room-name-btn');

let username;
let ws;
let isHost = false;

function init() {
    username = prompt('Enter your username:');
    if (!username) {
        alert('Username is required');
        window.location.href = '/';
        return;
    }

    inviteLink.textContent = window.location.href;

    ws = new WebSocket(`ws://${window.location.host}`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            roomId: roomId,
            username: username
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'message':
                addMessage(data.sender, data.content);
                break;
            case 'userList':
                updateUsersList(data.users);
                break;
            case 'roomName':
                updateRoomName(data.name);
                break;
            case 'host':
                isHost = true;
                editRoomNameBtn.style.display = 'inline-block';
                break;
            case 'kicked':
                alert('You have been kicked from the room.');
                window.location.href = '/';
                break;
        }
    };

    ws.onclose = () => {
        alert('Connection closed. Please refresh the page.');
    };
}

function addMessage(sender, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === username ? 'sent' : 'received');
    
    const usernameElement = document.createElement('div');
    usernameElement.classList.add('username');
    usernameElement.textContent = sender;
    
    const contentElement = document.createElement('div');
    contentElement.textContent = content;
    
    messageElement.appendChild(usernameElement);
    messageElement.appendChild(contentElement);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        const indicator = document.createElement('span');
        indicator.classList.add('online-indicator');
        li.appendChild(indicator);
        li.appendChild(document.createTextNode(user));
        
        if (isHost && user !== username) {
            const kickBtn = document.createElement('button');
            kickBtn.classList.add('kick-button');
            kickBtn.innerHTML = '<i class="fas fa-user-times"></i>';
            kickBtn.onclick = () => kickUser(user);
            li.appendChild(kickBtn);
        }
        
        usersList.appendChild(li);
    });
}

function updateRoomName(name) {
    roomNameElement.textContent = name;
}

function kickUser(userToKick) {
    ws.send(JSON.stringify({
        type: 'kick',
        username: userToKick
    }));
}

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
        ws.send(JSON.stringify({
            type: 'message',
            content: message
        }));
        messageInput.value = '';
    }
});

leaveBtn.addEventListener('click', () => {
    ws.close();
    window.location.href = '/';
});

editRoomNameBtn.addEventListener('click', () => {
    const newName = prompt('Enter new room name:');
    if (newName) {
        ws.send(JSON.stringify({
            type: 'roomName',
            name: newName
        }));
    }
});

init();