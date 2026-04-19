// ─── STATE ────────────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
    name: "",
    username: "",
    avatar: "/static/uploads/volosatic.jpg",
    discord: "",
    telegram: "",
    theme: "dark"
};

let userState = { ...DEFAULT_STATE };
try {
    const saved = localStorage.getItem('blink_user');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.avatar && parsed.avatar.startsWith('data:')) {
            parsed.avatar = DEFAULT_STATE.avatar;
        }
        userState = { ...DEFAULT_STATE, ...parsed };
    }
} catch (e) {
    console.warn('Failed to parse localStorage state:', e);
}

let isAuthenticated = false;

// ─── MAP ──────────────────────────────────────────────────────────────────────

const map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView([55.7512, 37.6184], 13);

const layers = {
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'),
    dark:  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png')
};

layers[userState.theme].addTo(map);

// ─── GEOLOCATION ──────────────────────────────────────────────────────────────

let myMarker          = null;
let myAccuracyCircle  = null;
let watchId           = null;
let lastSentAt        = 0;
let isFirstFix        = true;

function startLocationTracking() {
    if (!navigator.geolocation) {
        showToast('Геолокация не поддерживается вашим браузером');
        return;
    }

    if (watchId !== null) return;

    watchId = navigator.geolocation.watchPosition(
        onPositionUpdate,
        onPositionError,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}

function onPositionUpdate(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const latlng = [lat, lng];

    if (!myMarker) {
        if (isFirstFix) {
            map.flyTo(latlng, 15, { duration: 1.5 });
            isFirstFix = false;
        }

        const icon = L.divIcon({
            className: '',
            html: `<div class="my-location-dot"><div class="my-location-pulse"></div></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        myMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);

        myAccuracyCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#007aff',
            fillColor: '#007aff',
            fillOpacity: 0.08,
            weight: 1,
            opacity: 0.3
        }).addTo(map);

    } else {
        myMarker.setLatLng(latlng);
        myAccuracyCircle.setLatLng(latlng).setRadius(accuracy);
    }

    if (isAuthenticated) {
        sendMyLocation(lat, lng);
    }
}

function onPositionError(err) {
    console.warn('Geolocation error:', err.code, err.message);
    switch (err.code) {
        case 1: showToast('Разрешите доступ к геолокации в браузере'); break;
        case 2: showToast('Не удалось определить позицию'); break;
        case 3: showToast('Время ожидания геолокации истекло'); break;
    }
}

async function sendMyLocation(lat, lng) {
    const now = Date.now();
    if (now - lastSentAt < 10_000) return;
    lastSentAt = now;

    try {
        await fetch('/api/update_location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng })
        });
    } catch (e) {
        console.warn('Could not send location to server:', e);
    }
}

function flyToMyLocation() {
    if (myMarker) {
        map.flyTo(myMarker.getLatLng(), 16, { duration: 1.2 });
    } else {
        showToast('Определяем вашу позицию...');
        isFirstFix = true;
        startLocationTracking();
    }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function checkAuth() {
    try {
        const response = await fetch('/api/current_user');
        const data = await response.json();
        if (data.status === 'success' && data.user) {
            isAuthenticated = true;
            userState = { ...userState, ...data.user };
            saveStateLocally();
            updateUI();
            loadFriends();
        } else {
            showAuthModal();
        }
    } catch (error) {
        console.error('Auth error:', error);
        showAuthModal();
    }
}

function showAuthModal(mode = 'register') {
    const existing = document.getElementById('auth-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'auth-modal';

    const isRegister = mode === 'register';
    const title = isRegister ? 'Создать аккаунт' : 'Войти в профиль';
    const subtitle = isRegister ? 'Заполните данные для регистрации' : 'Введите ваш @username и пароль';

    modal.innerHTML = `
        <div class="modal-content auth-modal-content">
            <div class="modal-handle"></div>
            <h2 class="auth-title">${title}</h2>
            <p class="auth-subtitle">${subtitle}</p>

            <div id="auth-fields">
                ${isRegister ? `
                    <input type="text" id="auth-name" class="edit-input-field" placeholder="Ваше имя">
                    <input type="text" id="auth-username" class="edit-input-field" placeholder="@username">
                    <div id="auth-username-error" class="field-error"></div>
                    <input type="password" id="auth-password" class="edit-input-field" placeholder="Пароль (мин. 4 символа)">
                    <input type="text" id="auth-discord" class="edit-input-field" placeholder="Discord (необязательно)">
                    <input type="text" id="auth-telegram" class="edit-input-field" placeholder="Telegram (необязательно)">
                ` : `
                    <input type="text" id="login-username" class="edit-input-field" placeholder="@username">
                    <input type="password" id="login-password" class="edit-input-field" placeholder="Пароль">
                    <div id="login-error" class="field-error"></div>
                `}
            </div>

            <button id="auth-action-btn" class="save-btn">${isRegister ? 'Создать аккаунт' : 'Войти'}</button>
            <button class="close-btn" onclick="closeAuthModal()">Пропустить</button>

            <div class="auth-toggle">
                ${isRegister ?
                    '<span>Уже есть аккаунт? <a href="#" onclick="switchAuthMode(\'login\'); return false;">Войти</a></span>' :
                    '<span>Нет аккаунта? <a href="#" onclick="switchAuthMode(\'register\'); return false;">Зарегистрироваться</a></span>'
                }
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const actionBtn = document.getElementById('auth-action-btn');
    if (actionBtn) {
        actionBtn.onclick = () => {
            if (mode === 'register') registerUser();
            else loginUser();
        };
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal')?.remove();
}

function switchAuthMode(mode) {
    showAuthModal(mode);
}

async function loginUser() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput?.value.trim().replace('@', '');
    const password = passwordInput?.value;
    const errorEl = document.getElementById('login-error');

    if (!username) {
        if (errorEl) errorEl.textContent = 'Укажите username';
        return;
    }
    if (!password) {
        if (errorEl) errorEl.textContent = 'Введите пароль';
        return;
    }
    if (errorEl) errorEl.textContent = '';

    const actionBtn = document.getElementById('auth-action-btn');
    if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Вход...';
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (data.status === 'success') {
            userState = { ...userState, ...data.user };
            saveStateLocally();
            isAuthenticated = true;
            updateUI();
            closeAuthModal();
            loadFriends();
            showToast(`С возвращением, ${userState.name || username}!`);
        } else {
            if (errorEl) errorEl.textContent = data.message || 'Ошибка входа';
            showToast('Ошибка входа: ' + (data.message || 'неверный username или пароль'));
        }
    } catch (error) {
        console.error('Login error:', error);
        if (errorEl) errorEl.textContent = 'Ошибка соединения';
        showToast('Не удалось подключиться к серверу');
    } finally {
        if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.textContent = 'Войти';
        }
    }
}

async function registerUser() {
    const name = document.getElementById('auth-name')?.value.trim();
    const username = document.getElementById('auth-username')?.value.trim().replace('@', '');
    const password = document.getElementById('auth-password')?.value;
    const discord = document.getElementById('auth-discord')?.value.trim();
    const telegram = document.getElementById('auth-telegram')?.value.trim();

    const errorEl = document.getElementById('auth-username-error');

    if (!name) { showToast('Укажите имя'); return; }
    if (!password) { showToast('Укажите пароль'); return; }
    if (password.length < 4) { showToast('Пароль должен быть минимум 4 символа'); return; }

    const usernameErr = validateUsername(username);
    if (usernameErr) {
        if (errorEl) errorEl.textContent = usernameErr;
        return;
    }
    if (errorEl) errorEl.textContent = '';

    const userData = { name, username, password, avatar: DEFAULT_STATE.avatar, discord, telegram };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await response.json();
        if (data.status === 'success') {
            userState = { ...userState, ...data.user };
            saveStateLocally();
            isAuthenticated = true;
            updateUI();
            closeAuthModal();
            loadFriends();
            showToast('Добро пожаловать!');
        } else {
            showToast('Ошибка: ' + data.message);
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Ошибка подключения к серверу');
    }
}

// ─── VALIDATION ───────────────────────────────────────────────────────────────

function validateUsername(username) {
    if (!username) return 'Укажите username';
    if (username.length < 3)  return 'Минимум 3 символа';
    if (username.length > 32) return 'Максимум 32 символа';
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Только латинские буквы, цифры и _';
    return null;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function updateUI() {
    document.body.setAttribute('data-theme', userState.theme);

    const navAvatar   = document.getElementById('nav-avatar');
    const navUsername = document.getElementById('nav-username');
    if (navAvatar)   navAvatar.src     = userState.avatar;
    if (navUsername) navUsername.textContent = userState.name || 'Гость';

    const displayAvatar   = document.getElementById('display-avatar');
    const displayName     = document.getElementById('display-name');
    const displayUsername = document.getElementById('display-username');
    const displayDiscord  = document.getElementById('display-discord');
    const displayTelegram = document.getElementById('display-telegram');

    if (displayAvatar)   displayAvatar.src          = userState.avatar;
    if (displayName)     displayName.textContent     = userState.name     || 'Гость';
    if (displayUsername) displayUsername.textContent = '@' + (userState.username || 'user');
    if (displayDiscord)  displayDiscord.textContent  = userState.discord  || 'не указан';
    if (displayTelegram) displayTelegram.textContent = userState.telegram || 'не указан';

    const editAvatar    = document.getElementById('edit-avatar');
    const inputName     = document.getElementById('input-name');
    const inputUsername = document.getElementById('input-username');
    const inputDiscord  = document.getElementById('input-discord');
    const inputTelegram = document.getElementById('input-telegram');

    if (editAvatar)    editAvatar.src        = userState.avatar;
    if (inputName)     inputName.value       = userState.name;
    if (inputUsername) inputUsername.value   = userState.username;
    if (inputDiscord)  inputDiscord.value    = userState.discord;
    if (inputTelegram) inputTelegram.value   = userState.telegram;
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────

function toggleEdit(isEdit) {
    document.getElementById('view-mode').style.display = isEdit ? 'none'  : 'block';
    document.getElementById('edit-mode').style.display = isEdit ? 'block' : 'none';
    const errEl = document.getElementById('username-error');
    if (errEl) errEl.textContent = '';
}

function openProfile() {
    if (!isAuthenticated) { showAuthModal(); return; }
    toggleEdit(false);
    document.getElementById('profile-modal')?.classList.add('active');
}

function closeProfile() {
    document.getElementById('profile-modal')?.classList.remove('active');
}

async function saveProfile() {
    if (!isAuthenticated) { showAuthModal(); return; }

    const name     = document.getElementById('input-name').value.trim() || 'Без имени';
    const username = document.getElementById('input-username').value.trim().replace('@', '');
    const discord  = document.getElementById('input-discord').value.trim();
    const telegram = document.getElementById('input-telegram').value.trim();
    const errorEl  = document.getElementById('username-error');

    const usernameErr = validateUsername(username);
    if (usernameErr) {
        if (errorEl) errorEl.textContent = usernameErr;
        return;
    }
    if (errorEl) errorEl.textContent = '';

    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...'; }

    const payload = { name, username, discord, telegram };

    try {
        const response = await fetch('/api/update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            userState = { ...userState, name, username, discord, telegram };
            saveStateLocally();
            updateUI();
            toggleEdit(false);
            showToast('Профиль сохранён');
        } else {
            const data = await response.json().catch(() => ({}));
            showToast('Ошибка: ' + (data.message || 'попробуйте снова'));
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast('Ошибка подключения');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; }
    }
}

// ─── AVATAR UPLOAD ────────────────────────────────────────────────────────────

document.getElementById('avatar-input')?.addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('avatar-upload-status');

    if (file.size > 2 * 1024 * 1024) {
        if (statusEl) { statusEl.textContent = 'Файл слишком большой (макс. 2 МБ)'; statusEl.className = 'upload-status error'; }
        return;
    }

    if (statusEl) { statusEl.textContent = 'Загрузка...'; statusEl.className = 'upload-status'; }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
        const response = await fetch('/api/upload_avatar', { method: 'POST', body: formData });
        const data = await response.json();

        if (response.ok && data.avatar_url) {
            userState.avatar = data.avatar_url;
            saveStateLocally();
            updateUI();
            if (statusEl) { statusEl.textContent = '✓ Фото обновлено'; statusEl.className = 'upload-status'; }
        } else {
            if (statusEl) { statusEl.textContent = data.message || 'Ошибка загрузки'; statusEl.className = 'upload-status error'; }
        }
    } catch (err) {
        console.error('Avatar upload error:', err);
        if (statusEl) { statusEl.textContent = 'Ошибка соединения'; statusEl.className = 'upload-status error'; }
    }

    e.target.value = '';
});

// ─── ADD FRIEND MODAL ─────────────────────────────────────────────────────────

function openAddFriendModal() {
    if (!isAuthenticated) { showAuthModal(); return; }
    document.getElementById('friend-search-input').value = '';
    document.getElementById('friend-search-result').innerHTML = '';
    document.getElementById('add-friend-modal')?.classList.add('active');
}

function closeAddFriendModal() {
    document.getElementById('add-friend-modal')?.classList.remove('active');
}

async function searchAndAddFriend() {
    const query   = document.getElementById('friend-search-input')?.value.trim().replace('@', '');
    const resultEl = document.getElementById('friend-search-result');

    if (!query) { showToast('Введите имя или username'); return; }

    resultEl.innerHTML = '<span>Поиск...</span>';

    try {
        const response = await fetch(`/api/find_user/${query}`);
        const data = await response.json();

        if (data.status === 'success' && data.user) {
            const u = data.user;
            resultEl.innerHTML = `
                <div class="friend-found-card">
                    <img src="${escapeHtml(u.avatar || DEFAULT_STATE.avatar)}" alt="">
                    <div class="info">
                        <b>${escapeHtml(u.name)}</b>
                        <span>@${escapeHtml(u.username)}</span>
                    </div>
                    <button class="save-btn" style="width:auto;padding:10px 18px;font-size:14px;"
                        onclick="confirmAddFriend('${escapeHtml(u.username)}')">
                        Добавить
                    </button>
                </div>
            `;
        } else {
            resultEl.innerHTML = '<span>Пользователь не найден</span>';
        }
    } catch (err) {
        console.error('Search error:', err);
        resultEl.innerHTML = '<span>Ошибка соединения</span>';
    }
}

async function confirmAddFriend(username) {
    try {
        const response = await fetch('/api/add_friend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (data.status === 'success') {
            showToast('Запрос отправлен!');
            closeAddFriendModal();
        } else {
            showToast('Ошибка: ' + data.message);
        }
    } catch (err) {
        console.error('Add friend error:', err);
        showToast('Ошибка соединения');
    }
}

// ─── FRIENDS LIST ─────────────────────────────────────────────────────────────

async function loadFriends() {
    try {
        const response = await fetch('/api/friends');
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.friends)) {
            renderFriends(data.friends);
        }
    } catch (err) {
        console.warn('Could not load friends:', err);
        renderFriends([
            { name: "Алекс", pos: [55.155, 61.431], avatar: "/static/uploads/koliman.jpg" },
            { name: "Мария", pos: [55.742, 37.61], avatar: "/static/uploads/koliman.jpg" }
        ]);
    }
}

function renderFriends(friends) {
    const listEl = document.getElementById('friends-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    friends.forEach(f => {
        const pos = f.pos || f.position;

        if (pos) {
            const icon = L.divIcon({
                className: 'map-avatar-wrapper',
                html: `<img src="${escapeHtml(f.avatar)}" class="map-avatar-img" alt="${escapeHtml(f.name)}">`,
                iconSize: [46, 46],
                iconAnchor: [23, 23]
            });
            L.marker(pos, { icon }).addTo(map).bindPopup(`<b>${escapeHtml(f.name)}</b>`);
        }

        const card = document.createElement('div');
        card.className = 'friend-item';
        card.innerHTML = `<img src="${escapeHtml(f.avatar)}" alt="${escapeHtml(f.name)}"><span>${escapeHtml(f.name)}</span>`;
        if (pos) card.onclick = () => map.flyTo(pos, 15, { duration: 1.5 });
        listEl.appendChild(card);
    });
}

// ─── THEME ────────────────────────────────────────────────────────────────────

document.getElementById('theme-toggle')?.addEventListener('click', () => {
    map.removeLayer(layers[userState.theme]);
    userState.theme = userState.theme === 'dark' ? 'light' : 'dark';
    layers[userState.theme].addTo(map);
    updateUI();
    saveStateLocally();
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

function logout() {
    fetch('/api/logout', { method: 'POST' })
        .finally(() => {
            localStorage.removeItem('blink_user');
            isAuthenticated = false;
            window.location.reload();
        });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function saveStateLocally() {
    const toSave = { ...userState };
    if (toSave.avatar?.startsWith('data:')) toSave.avatar = DEFAULT_STATE.avatar;
    try {
        localStorage.setItem('blink_user', JSON.stringify(toSave));
    } catch (e) {
        console.warn('localStorage write failed:', e);
    }
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 400);
    }, 2600);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

updateUI();
checkAuth();
startLocationTracking();