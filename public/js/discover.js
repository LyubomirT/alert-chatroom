document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const randomBtn = document.getElementById('random-btn');
    const roomsContainer = document.getElementById('rooms-container');

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    randomBtn.addEventListener('click', joinRandomRoom);

    function performSearch() {
        const query = searchInput.value.trim();
        if (query) {
            fetch(`/api/search-rooms?q=${encodeURIComponent(query)}`)
                .then(response => response.json())
                .then(rooms => displayRooms(rooms))
                .catch(error => console.error('Error:', error));
        }
    }

    function joinRandomRoom() {
        fetch('/api/random-room')
            .then(response => response.json())
            .then(room => {
                if (room.id) {
                    window.location.href = `/room/${room.id}`;
                } else {
                    alert('No discoverable rooms available. Try again later.');
                }
            })
            .catch(error => console.error('Error:', error));
    }

    function displayRooms(rooms) {
        roomsContainer.innerHTML = '';
        if (rooms.length === 0) {
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
});