import Darkmode from 'darkmode-js';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const randomBtn = document.getElementById('random-btn');
    const roomsContainer = document.getElementById('rooms-container');

    let currentPage = 0;
    let hasMore = true;
    let isLoading = false;
    let currentQuery = '';

    searchBtn.addEventListener('click', () => {
        currentQuery = searchInput.value.trim();
        currentPage = 0;
        hasMore = true;
        roomsContainer.innerHTML = '';
        loadRooms();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchBtn.click();
        }
    });

    randomBtn.addEventListener('click', joinRandomRoom);

    function loadRooms() {
        if (isLoading || !hasMore) return;
        isLoading = true;

        fetch(`/api/search-rooms?q=${encodeURIComponent(currentQuery)}&page=${currentPage}`)
            .then(response => response.json())
            .then(data => {
                displayRooms(data.rooms);
                hasMore = data.hasMore;
                currentPage++;
                isLoading = false;
            })
            .catch(error => {
                console.error('Error:', error);
                isLoading = false;
            });
    }

    function displayRooms(rooms) {
        if (rooms.length === 0 && currentPage === 0) {
            roomsContainer.innerHTML = '<p>No rooms found.</p>';
            return;
        }

        rooms.forEach(room => {
            const roomCard = document.createElement('div');
            roomCard.className = 'room-card';
            roomCard.innerHTML = `
                <h3>${room.name}</h3>
                <p><i class="fas fa-users"></i> ${room.userCount} users</p>
                <a href="/room/${room.id}" class="join-btn">Join</a>
            `;
            roomsContainer.appendChild(roomCard);
        });
    }

    function joinRandomRoom() {
        fetch('/api/random-room')
            .then(response => response.json())
            .then(room => {
                if (room.id) {
                    window.location.href = `/room/${room.id}`;
                } else {
                    // Replace alert with a more user-friendly notification method
                    showNotification('No discoverable rooms available. Try again later.');
                }
            })
            .catch(error => console.error('Error:', error));
    }

    // New function to handle notifications
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerText = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000); // Remove after 3 seconds
    }

    // Infinite scroll
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
            loadRooms();
        }
    });

    // Initial load
    loadRooms();
});

new Darkmode().showWidget();