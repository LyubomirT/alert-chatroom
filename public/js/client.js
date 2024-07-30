const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const inviteLink = document.getElementById('invite-link');
const leaveBtn = document.getElementById('leave-btn');
const usersList = document.getElementById('users-list');

let username;
let ws;

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
        if (data.type === 'message') {
            addMessage(data.sender, data.content);
        } else if (data.type === 'userList') {
            updateUsersList(data.users);
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
    messageElement.textContent = `${sender}: ${content}`;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        usersList.appendChild(li);
    });
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

init();