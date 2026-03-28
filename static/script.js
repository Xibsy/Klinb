const DEFAULT_STATE = {
    name: "",
    username: "",
    avatar: "/static/uploads/volosatic.jpg",
    discord: "",
    telegram: "",
    theme: "dark"
};

let userState = JSON.parse(localStorage.getItem('blink_user')) || DEFAULT_STATE;
let isAuthenticated = false;

// 2. Карта
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([55.7512, 37.6184], 13);
const layers = {
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png')
};
layers[userState.theme].addTo(map);

// 3. Проверка авторизации
async function checkAuth() {
    try {
        const response = await fetch('/api/current_user');
        const data = await response.json();
        if (data.status === 'success' && data.user) {
            isAuthenticated = true;
            userState = { ...userState, ...data.user };
            localStorage.setItem('blink_user', JSON.stringify(userState));
            updateUI();
        } else {
            showAuthModal();
        }
    } catch (error) {
        console.error('Auth error:', error);
    }
}

// 4. Показать модалку регистрации
function showAuthModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 350px;">
            <div class="modal-handle"></div>
            <h3 style="text-align: center;">Добро пожаловать в Blink!</h3>
            <div id="auth-form">
                <input type="text" id="auth-name" placeholder="Ваше имя" class="edit-input-field" style="margin-bottom: 10px;">
                <input type="text" id="auth-username" placeholder="@username" class="edit-input-field" style="margin-bottom: 10px;">
                <input type="text" id="auth-discord" placeholder="Discord (необязательно)" class="edit-input-field" style="margin-bottom: 10px;">
                <input type="text" id="auth-telegram" placeholder="Telegram (необязательно)" class="edit-input-field" style="margin-bottom: 20px;">
                <button onclick="registerUser()" class="save-btn">Создать аккаунт</button>
                <button onclick="closeAuthModal()" class="close-btn">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window.authModal = modal;
}

function closeAuthModal() {
    if (window.authModal) {
        window.authModal.remove();
        window.authModal = null;
    }
}

// 5. Регистрация
async function registerUser() {
    const name = document.getElementById('auth-name')?.value;
    const username = document.getElementById('auth-username')?.value;
    const discord = document.getElementById('auth-discord')?.value;
    const telegram = document.getElementById('auth-telegram')?.value;

    if (!name || !username) {
        alert("Укажите имя и username");
        return;
    }

    const userData = {
        name: name,
        username: username.replace('@', ''),
        avatar: "/static/uploads/volosatic.jpg",  // базовое фото
        discord: discord,
        telegram: telegram
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await response.json();
        if (data.status === 'success') {
            userState = { ...userState, ...data.user };
            localStorage.setItem('blink_user', JSON.stringify(userState));
            isAuthenticated = true;
            updateUI();
            closeAuthModal();
            alert("Регистрация успешна!");
        } else {
            alert("Ошибка: " + data.message);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert("Ошибка подключения к серверу");
    }
}

// 6. Обновление UI
function updateUI() {
    document.body.setAttribute('data-theme', userState.theme);

    const navAvatar = document.getElementById('nav-avatar');
    const navUsername = document.getElementById('nav-username');
    if (navAvatar) navAvatar.src = userState.avatar;
    if (navUsername) navUsername.innerText = userState.name || "Гость";

    const displayAvatar = document.getElementById('display-avatar');
    const displayName = document.getElementById('display-name');
    const displayUsername = document.getElementById('display-username');
    const displayDiscord = document.getElementById('display-discord');
    const displayTelegram = document.getElementById('display-telegram');

    if (displayAvatar) displayAvatar.src = userState.avatar;
    if (displayName) displayName.innerText = userState.name || "Гость";
    if (displayUsername) displayUsername.innerText = "@" + (userState.username || "user");
    if (displayDiscord) displayDiscord.innerText = userState.discord || "не указан";
    if (displayTelegram) displayTelegram.innerText = userState.telegram || "не указан";

    const editAvatar = document.getElementById('edit-avatar');
    const inputName = document.getElementById('input-name');
    const inputUsername = document.getElementById('input-username');
    const inputDiscord = document.getElementById('input-discord');
    const inputTelegram = document.getElementById('input-telegram');

    if (editAvatar) editAvatar.src = userState.avatar;
    if (inputName) inputName.value = userState.name;
    if (inputUsername) inputUsername.value = userState.username;
    if (inputDiscord) inputDiscord.value = userState.discord;
    if (inputTelegram) inputTelegram.value = userState.telegram;
}

// 7. Профиль
function toggleEdit(isEdit) {
    const viewMode = document.getElementById('view-mode');
    const editMode = document.getElementById('edit-mode');
    if (viewMode) viewMode.style.display = isEdit ? 'none' : 'block';
    if (editMode) editMode.style.display = isEdit ? 'block' : 'none';
}

function openProfile() {
    if (!isAuthenticated) {
        showAuthModal();
        return;
    }
    toggleEdit(false);
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.add('active');
}

function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.remove('active');
}

async function saveProfile() {
    if (!isAuthenticated) {
        showAuthModal();
        return;
    }

    userState.name = document.getElementById('input-name').value || "Без имени";
    userState.username = document.getElementById('input-username').value.replace('@', '') || "user";
    userState.discord = document.getElementById('input-discord').value;
    userState.telegram = document.getElementById('input-telegram').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userState)
        });

        if (response.ok) {
            localStorage.setItem('blink_user', JSON.stringify(userState));
            updateUI();
            toggleEdit(false);
        } else {
            alert("Ошибка сохранения профиля");
        }
    } catch (error) {
        console.error('Save error:', error);
    }
}

function addFriendPrompt() {
    if (!isAuthenticated) {
        showAuthModal();
        return;
    }

    const friendName = prompt("Введите имя друга, которого хотите добавить:");
    if (friendName) {
        fetch('/add_friend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: friendName })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert("Ответ сервера: " + data.message);
            } else {
                alert("Ошибка: " + data.message);
            }
        })
        .catch((error) => {
            console.error('Ошибка:', error);
            alert("Сервер не отвечает");
        });
    }
}

function logout() {
    fetch('/api/logout', { method: 'POST' })
        .then(() => {
            localStorage.removeItem('blink_user');
            isAuthenticated = false;
            window.location.reload();
        });
}

// 8. Загрузка фото
document.getElementById('avatar-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && file.size > 2 * 1024 * 1024) {
        alert("Файл слишком большой! Выбери фото до 2МБ.");
        return;
    }
    const reader = new FileReader();
    reader.onload = function() {
        userState.avatar = reader.result;
        const editAvatar = document.getElementById('edit-avatar');
        if (editAvatar) editAvatar.src = reader.result;
    };
    reader.readAsDataURL(file);
});

// 9. Смена темы
document.getElementById('theme-toggle')?.addEventListener('click', () => {
    map.removeLayer(layers[userState.theme]);
    userState.theme = userState.theme === 'dark' ? 'light' : 'dark';
    layers[userState.theme].addTo(map);
    updateUI();
    localStorage.setItem('blink_user', JSON.stringify(userState));
});

// 10. Друзья
const friends = [
    { name: "Алекс", pos: [55.755, 37.62], img: "/static/uploads/koliman.jpg" },
    { name: "Мария", pos: [55.742, 37.61], img: "/static/uploads/koliman.jpg" }
];

friends.forEach(f => {
    const customIcon = L.divIcon({
        className: 'map-avatar-wrapper',
        html: `<img src="${f.img}" class="map-avatar-img">`,
        iconSize: [46, 46],
        iconAnchor: [23, 23]
    });

    L.marker(f.pos, { icon: customIcon }).addTo(map).bindPopup(`<b>${f.name}</b>`);

    const fCard = document.createElement('div');
    fCard.className = 'friend-item';
    fCard.innerHTML = `<img src="${f.img}"><span>${f.name}</span>`;
    fCard.onclick = () => map.flyTo(f.pos, 15, { duration: 1.5 });
    document.getElementById('friends-list')?.appendChild(fCard);
});

// 11. Стили
const style = document.createElement('style');
style.innerHTML = `
    .map-avatar-img { width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.2); object-fit: cover; }
`;
document.head.appendChild(style);

// 12. Инициализация
updateUI();
checkAuth();