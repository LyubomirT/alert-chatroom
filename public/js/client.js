const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const inviteLink = document.getElementById('invite-link');
const toggleInviteLinkBtn = document.getElementById('toggle-invite-link');
const leaveBtn = document.getElementById('leave-btn');
const usersList = document.getElementById('users-list');
const roomNameElement = document.getElementById('room-name');
const editRoomNameBtn = document.getElementById('edit-room-name-btn');
const fileUpload = document.getElementById('file-upload');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResults = document.getElementById('search-results');
const toggleDiscoverabilityBtn = document.getElementById('toggle-discoverability');

let username;
let ws;
let isHost = false;
let currentHost;

let typingTimeout;
let isTyping = false;

let currentPage = 0;
let hasMore = true;
let isLoading = false;

let showPastMessages = false;

function loadMessages() {
    if (isLoading || !hasMore || !showPastMessages) return;
    isLoading = true;

    fetch(`/api/messages/${roomId}?page=${currentPage}`)
        .then(response => response.json())
        .then(data => {
            const messages = data.messages;
            hasMore = data.hasMore;

            messages.forEach(msg => {
                addMessage(msg.sender, msg.content, msg.isFile, msg.fileName, msg.messageId, msg.replyTo, msg.reactions, true);
            });

            currentPage++;
            isLoading = false;
        })
        .catch(error => {
            console.error('Error loading messages:', error);
            isLoading = false;
        });
}

function init() {
    connectWithUsername();
}

function sendTypingStatus(typing) {
    ws.send(JSON.stringify({
        type: 'typing',
        typing: typing,
        username: username
    }));
}

messageInput.addEventListener('input', () => {
    if (!isTyping) {
        isTyping = true;
        sendTypingStatus(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        sendTypingStatus(false);
    }, 3000);
});

// Add this function to update the typing indicator
function updateTypingIndicator(typingUsers) {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingUsers.length === 0) {
        typingIndicator.style.display = 'none';
        return;
    }

    let message = '';
    if (typingUsers.length === 1) {
        message = `${typingUsers[0]} is typing...`;
    } else if (typingUsers.length === 2) {
        message = `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
    } else if (typingUsers.length === 3) {
        message = `${typingUsers[0]}, ${typingUsers[1]}, and ${typingUsers[2]} are typing...`;
    } else {
        message = `${typingUsers.length} people are typing...`;
    }

    typingIndicator.textContent = message;
    typingIndicator.style.display = 'block';
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
                if (data.replyTo) {
                    console.log(data.replyTo);
                }
                addMessage(data.sender, data.content, data.isFile, data.fileName, data.messageId, data.replyTo, data.reactions);
                break;
            case 'userList':
                updateUsersList(data.users, data.host);
                break;
            case 'roomName':
                updateRoomName(data.name);
                currentHost = data.host;
                showPastMessages = data.showPastMessages;
                if (showPastMessages) {
                    loadMessages();
                }
                break;
            case 'host':
                isHost = true;
                editRoomNameBtn.style.display = 'inline-block';
                if (isHost) {
                    toggleDiscoverabilityBtn.style.display = 'inline-block';
                }
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
            case 'deleteMessage':
                const messageToDelete = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
                if (messageToDelete) {
                    messageToDelete.remove();
                }
                break;
            case 'updateReactions':
                updateReactions(data.messageId, data.reactions);
                break;
            case 'banPrompt':
                if (confirm(`Do you want to ban ${data.username} (${data.ip}) from this room?`)) {
                    banUser(data.username, data.ip);
                }
                break;
            case 'updateBannedList':
                updateBannedList(data.bannedList);
                break;
            case 'typingUpdate':
                updateTypingIndicator(data.typingUsers);
                break;
            case 'discoverabilityUpdate':
                toggleDiscoverabilityBtn.innerHTML = data.discoverable ? '<i class="fas fa-eye-slash"></i> Make Private' : '<i class="fas fa-eye"></i> Make Discoverable';
                break;
        }
    };

    ws.onclose = () => {
        // log why the connection was closed
        console.log('Connection closed with code:', event.code, 'reason:', event.reason);
        alert('Connection closed. Please refresh the page.');
    };

    ws.onerror = (error) => {
        // log the error
        console.error('WebSocket error:', error);
    }
}

function addMessage(sender, content, isFile = false, fileName = null, messageId = null, replyTo = null, reactions = null, prepend = false) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === username ? 'sent' : 'received');
    messageElement.dataset.messageId = messageId;
    
    const usernameElement = document.createElement('div');
    usernameElement.classList.add('username');
    usernameElement.textContent = sender;
    
    if (sender === 'System') {
        messageElement.classList.add('system-message');
    }
    
    const contentElement = document.createElement('div');
    contentElement.classList.add('message-content');
    
    if (replyTo) {
        const replyElement = document.createElement('div');
        replyElement.classList.add('reply-to');
        replyElement.innerHTML = `<strong>Replying to ${replyTo.sender}:</strong> ${replyTo.content}`;
        replyElement.onclick = () => scrollToMessage(replyTo.messageId);
        contentElement.appendChild(replyElement);
    }
    
    if (isFile) {
        if (content.startsWith('data:image')) {
            const img = document.createElement('img');
            img.src = content;
            contentElement.appendChild(img);
        } else {
            const fileBox = document.createElement('div');
            fileBox.classList.add('file-box');
            
            const fileIcon = document.createElement('i');
            fileIcon.classList.add('fas', 'fa-file');
            if (fileName) {
                const extension = fileName.split('.').pop().toLowerCase();
                if (['mp3', 'wav', 'ogg'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-file-audio');
                } else if (['mp4', 'webm', 'avi', 'mov'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-file-video');
                } else if (['exe', 'msi', 'dmg', 'pkg'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-file-archive');
                } else if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-file-alt');
                } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-file-archive');
                } else if (['.py', '.js', '.html', '.css', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.sh', '.bat'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-file-code');
                } else if (['fbx', 'obj', 'blend', '3ds', 'stl', 'ply'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-cube');
                } else if (['md', 'rst', 'adoc'].includes(extension)) {
                    fileIcon.classList.remove('fa-file');
                    fileIcon.classList.add('fa-book');
                }
            }
            
            const fileInfo = document.createElement('span');
            fileInfo.textContent = fileName || 'Unnamed file';
            
            const downloadBtn = document.createElement('a');
            downloadBtn.href = content;
            downloadBtn.download = fileName || 'download';
            downloadBtn.textContent = 'Download';
            downloadBtn.classList.add('download-btn');
            
            fileBox.appendChild(fileIcon);
            fileBox.appendChild(fileInfo);
            fileBox.appendChild(downloadBtn);
            
            contentElement.appendChild(fileBox);
        }
    } else {
        const messageTextElement = document.createElement('div');
        messageTextElement.innerHTML = marked.parse(content);
        messageTextElement.querySelectorAll('a').forEach(a => {
            a.target = '_blank';
        });
        contentElement.appendChild(messageTextElement);
    }
    
    messageElement.appendChild(usernameElement);
    messageElement.appendChild(contentElement);
    
    // Add toolbar
    const toolbar = document.createElement('div');
    toolbar.classList.add('message-toolbar');
    
    const replyButton = document.createElement('button');
    replyButton.innerHTML = '<i class="fas fa-reply"></i>';
    replyButton.onclick = () => replyToMessage(messageId, sender, content);
    toolbar.appendChild(replyButton);
    
    const reactButton = document.createElement('button');
    reactButton.innerHTML = '<i class="fas fa-smile"></i>';
    reactButton.onclick = (event) => showEmojiPicker(event, messageId);
    toolbar.appendChild(reactButton);
    
    if (sender === username || isHost) {
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
        deleteButton.onclick = () => deleteMessage(messageId);
        toolbar.appendChild(deleteButton);
    }
    
    messageElement.appendChild(toolbar);
    
    // Add reactions container
    const reactionsContainer = document.createElement('div');
    reactionsContainer.classList.add('reactions-container');
    messageElement.appendChild(reactionsContainer);

    // Add timestamp to the message element
    const timestamp = new Date().toISOString();
    messageElement.dataset.timestamp = timestamp;
    
    messageElement.addEventListener('mouseover', () => {
        toolbar.style.display = 'flex';
    });
    
    messageElement.addEventListener('mouseout', () => {
        toolbar.style.display = 'none';
    });

    // If there are initial reactions, display them
    console.log(reactions);
    if (reactions) {
        updateReactions(messageId, reactions);
    }
    if (prepend) {
        messagesContainer.prepend(messageElement);
    } else {
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
}

function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (query === '') {
        searchResults.style.display = 'none';
        return;
    }

    const messages = Array.from(document.querySelectorAll('.message'));
    const matchingMessages = messages.filter(message => {
        const content = message.querySelector('.message-content').textContent.toLowerCase();
        return content.includes(query);
    });

    displaySearchResults(matchingMessages, query);
}

function displaySearchResults(results, query) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
    } else {
        results.forEach(message => {
            const resultItem = document.createElement('div');
            resultItem.classList.add('search-result-item');
            
            const username = message.querySelector('.username').textContent;
            const content = message.querySelector('.message-content').textContent;
            const timestamp = new Date(message.dataset.timestamp).toLocaleString();
            const messageId = message.dataset.messageId;

            resultItem.innerHTML = `
                <span class="username">${username}</span>
                <span class="timestamp">${timestamp}</span>
                <div class="content">${highlightQuery(content, query)}</div>
            `;

            resultItem.addEventListener('click', () => {
                scrollToMessage(messageId);
                searchResults.style.display = 'none';
            });

            searchResults.appendChild(resultItem);
        });
    }
    searchResults.style.display = 'block';
}

function highlightQuery(content, query) {
    const regex = new RegExp(`(${query})`, 'gi');
    return content.replace(regex, '<mark>$1</mark>');
}

searchInput.addEventListener('input', performSearch);
searchButton.addEventListener('click', performSearch);

// Close search results when clicking outside
document.addEventListener('click', (event) => {
    if (!searchResults.contains(event.target) && event.target !== searchInput && event.target !== searchButton) {
        searchResults.style.display = 'none';
    }
});


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

function banUser(username, ip) {
    ws.send(JSON.stringify({
        type: 'ban',
        username: username,
        ip: ip
    }));
}

function unbanUser(ip) {
    ws.send(JSON.stringify({
        type: 'unban',
        ip: ip
    }));
}

function updateBannedList(bannedList) {
    const bannedListElement = document.getElementById('banned-list');
    bannedListElement.innerHTML = '';
    bannedList.forEach(({ ip, username }) => {
        const li = document.createElement('li');
        li.textContent = `${ip} (${username || 'Unknown'})`;
        const unbanBtn = document.createElement('button');
        unbanBtn.textContent = 'Unban';
        unbanBtn.onclick = () => unbanUser(ip);
        li.appendChild(unbanBtn);
        bannedListElement.appendChild(li);
    });
}

function updateInviteLink(type) {
    let link;
    switch (type) {
        case 'localhost':
            link = window.location.href
            inviteLink.value = link;
            break;
        case 'local':
            getLocalIPs(function(ips) {
                const ip = ips.find(ip => !ip.startsWith('169.254.')) || ips[0];
                link = `http://${ip}:${location.port}/room/${roomId}`;
                inviteLink.value = link;
            });
            return;
        default:
            link = window.location.href;
            inviteLink.value = link;
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

function replyToMessage(messageId, sender, content) {
    const replyTo = { messageId, sender, content };
    messageInput.dataset.replyTo = JSON.stringify(replyTo);
    updateReplyPreview(replyTo);
    messageInput.focus();
}

function updateReplyPreview(replyTo) {
    let replyPreview = document.getElementById('reply-preview');
    if (!replyPreview) {
        replyPreview = document.createElement('div');
        replyPreview.id = 'reply-preview';
        messageForm.insertBefore(replyPreview, messageInput);
    }
    const replyContent = replyTo.content.substring(0, 100) + (replyTo.content.length > 100 ? '...' : '');
    replyPreview.innerHTML = `
        <div>Replying to ${replyTo.sender}: ${replyContent}</div>
        <button id="cancel-reply"><i class="fas fa-times"></i></button>
    `;
    document.getElementById('cancel-reply').onclick = cancelReply;
}

function cancelReply() {
    delete messageInput.dataset.replyTo;
    const replyPreview = document.getElementById('reply-preview');
    if (replyPreview) {
        replyPreview.remove();
    }
}

function scrollToMessage(messageId) {
    const message = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (message) {
        message.scrollIntoView({ behavior: 'smooth', block: 'center' });
        message.classList.add('highlight');
        setTimeout(() => message.classList.remove('highlight'), 2000);
    }
}

function deleteMessage(messageId) {
    ws.send(JSON.stringify({
        type: 'deleteMessage',
        messageId: messageId
    }));
}

function showEmojiPicker(event, messageId) {
    const picker = new EmojiButton();
    picker.on('emoji', emoji => {
        addReaction(messageId, emoji);
    });
    picker.togglePicker(event.target);
}

function addReaction(messageId, emoji) {
    ws.send(JSON.stringify({
        type: 'reaction',
        messageId: messageId,
        emoji: emoji
    }));
}

function updateReactions(messageId, reactions) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    console.log(reactions);
    console.log(messageElement);
    if (messageElement) {
        const reactionsContainer = messageElement.querySelector('.reactions-container');
        reactionsContainer.innerHTML = '';
        
        for (const [emoji, users] of Object.entries(reactions)) {
            const reactionElement = document.createElement('span');
            reactionElement.classList.add('reaction');
            reactionElement.innerHTML = `${emoji} ${users.length}`;
            reactionElement.title = users.join(', ');
            if (users.includes(username)) {
                reactionElement.classList.add('user-reacted');
            }
            reactionElement.onclick = () => toggleReaction(messageId, emoji);
            reactionsContainer.appendChild(reactionElement);
        }
    }
}

function toggleReaction(messageId, emoji) {
    ws.send(JSON.stringify({
        type: 'toggleReaction',
        messageId: messageId,
        emoji: emoji
    }));
}

messageInput.addEventListener('input', resizeTextarea);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
});

messageForm.addEventListener('submit', (e) => {
    e.cancelable = true;
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
        const replyTo = messageInput.dataset.replyTo ? JSON.parse(messageInput.dataset.replyTo) : null;
        ws.send(JSON.stringify({
            type: 'message',
            content: message,
            replyTo: replyTo
        }));
        messageInput.value = '';
        cancelReply();
        resizeTextarea();
    }
});

fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target.result.length > 50000000) {
                alert('File size exceeds 50MB limit');
                return;
            }
            ws.send(JSON.stringify({
                type: 'message',
                content: event.target.result,
                isFile: true,
                fileName: file.name
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
    const currentLink = inviteLink.value;
    if (currentLink.includes('localhost')) {
        updateInviteLink('local');
    } else if (currentLink.match(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:/)) {
        updateInviteLink('public');
    } else {
        updateInviteLink('localhost');
    }
});

toggleDiscoverabilityBtn.addEventListener('click', () => {
    var isDiscoverable = toggleDiscoverabilityBtn.innerHTML.includes('slash');
    ws.send(JSON.stringify({
        type: 'toggleDiscoverability',
        discoverable: !isDiscoverable
    }));
});

// Add scroll event listener to load more messages
messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop === 0) {
        loadMessages();
    }
});

init();