const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const inviteLink = document.getElementById('invite-link');
const toggleInviteLinkBtn = document.getElementById('toggle-invite-link');
const leaveBtn = document.getElementById('leave-btn');
const usersList = document.getElementById('users-list');
const roomNameElement = document.getElementById('room-name');
const editRoomNameBtn = document.getElementById('edit-room-name-btn');
const imageUpload = document.getElementById('image-upload');

let username;
let ws;
let isHost = false;
let currentHost;

function init() {
    connectWithUsername();
}

function connectWithUsername() {
    username = prompt('Enter your username:');
    if (!username) {
        alert('Username is required');
        window.location.href = '/';
        return;
    }

    updateInviteLink('localhost');

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
                addMessage(data.sender, data.content, data.isImage);
                break;
            case 'userList':
                updateUsersList(data.users, data.host);
                break;
            case 'roomName':
                updateRoomName(data.name);
                currentHost = data.host;
                break;
            case 'host':
                isHost = true;
                editRoomNameBtn.style.display = 'inline-block';
                break;
            case 'kicked':
                alert('You have been kicked from the room.');
                window.location.href = '/';
                break;
            case 'error':
                if (data.message === 'Username already taken') {
                    alert('Username already taken. Please choose a different username.');
                    connectWithUsername();
                }
                break;
            case 'newHost':
                currentHost = data.host;
                updateUsersList(null, data.host);
                break;
        }
    };

    ws.onclose = () => {
        alert('Connection closed. Please refresh the page.');
    };
}

function addMessage(sender, content, isImage = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === username ? 'sent' : 'received');
    
    const usernameElement = document.createElement('div');
    usernameElement.classList.add('username');
    usernameElement.textContent = sender;
    
    if (sender === 'System') {
        messageElement.classList.add('system-message');
    }
    
    const contentElement = document.createElement('div');
    contentElement.classList.add('message-content');
    
    if (isImage) {
        const img = document.createElement('img');
        img.src = content;
        contentElement.appendChild(img);
    } else {
        // Replace newline characters with <br> tags
        const formattedContent = content.replace(/\n/g, '<br>');
        contentElement.innerHTML = formattedContent;
    }
    
    messageElement.appendChild(usernameElement);
    messageElement.appendChild(contentElement);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollIntoView(false);
}

function updateUsersList(users, host) {
    if (users) {
        usersList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            const indicator = document.createElement('span');
            indicator.classList.add('online-indicator');
            li.appendChild(indicator);
            li.appendChild(document.createTextNode(user));

            if (user === host) {
                const crown = document.createElement('i');
                crown.classList.add('fas', 'fa-crown');
                crown.style.color = 'gold';
                crown.style.marginLeft = '5px';
                li.appendChild(crown);
            }
            
            if (isHost && user !== username) {
                const kickBtn = document.createElement('button');
                kickBtn.classList.add('kick-button');
                kickBtn.innerHTML = '<i class="fas fa-user-times"></i>';
                kickBtn.onclick = () => kickUser(user);
                li.appendChild(kickBtn);
            }
            
            usersList.appendChild(li);
        });
    } else if (host) {
        // Update only the host crown
        const userItems = usersList.getElementsByTagName('li');
        for (let item of userItems) {
            const userName = item.textContent;
            const existingCrown = item.querySelector('.fa-crown');
            if (userName === host) {
                if (!existingCrown) {
                    const crown = document.createElement('i');
                    crown.classList.add('fas', 'fa-crown');
                    crown.style.color = 'gold';
                    crown.style.marginLeft = '5px';
                    item.appendChild(crown);
                }
            } else if (existingCrown) {
                item.removeChild(existingCrown);
            }
        }
    }
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

function updateInviteLink(type) {
    let link;
    switch (type) {
        case 'localhost':
            link = `http://localhost:${location.port}/room/${roomId}`;
            inviteLink.textContent = link;
            break;
        case 'local':
            getLocalIPs(function(ips) {
                // Prefer non-link-local IP if available
                const ip = ips.find(ip => !ip.startsWith('169.254.')) || ips[0];
                link = `http://${ip}:${location.port}/room/${roomId}`;
                inviteLink.textContent = link;
            });
            return;
        default:
            link = window.location.href;
            inviteLink.textContent = link;
    }
}

function getLocalIPs(callback) {
    const ips = [];
    const RTCPeerConnection = window.RTCPeerConnection ||
                              window.webkitRTCPeerConnection ||
                              window.mozRTCPeerConnection;

    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');
    pc.onicecandidate = (e) => {
        if (!e.candidate) {
            pc.close();
            callback(ips);
            return;
        }
        const ip = e.candidate.candidate.split(' ')[4];
        if (ips.indexOf(ip) === -1) ips.push(ip);
    };
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(err => console.error(err));
}

function resizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
}

messageInput.addEventListener('input', resizeTextarea);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit'));
    }
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
        ws.send(JSON.stringify({
            type: 'message',
            content: message
        }));
        messageInput.value = '';
        resizeTextarea();
    }
});

imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            ws.send(JSON.stringify({
                type: 'message',
                content: event.target.result,
                isImage: true
            }));
        };
        reader.readAsDataURL(file);
    }
});

leaveBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({
        type: 'leave',
        roomId: roomId,
        username: username
    }));
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

toggleInviteLinkBtn.addEventListener('click', () => {
    const currentLink = inviteLink.textContent;
    if (currentLink.includes('localhost')) {
        updateInviteLink('local');
    } else if (currentLink.match(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:/)) {
        updateInviteLink('public');
    } else {
        updateInviteLink('localhost');
    }
});

init();