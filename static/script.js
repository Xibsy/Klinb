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
let currentRequestsTab = 'incoming';
let requestsPollingInterval = null;

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
            startRequestsPolling();
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

    if (!username) { if (errorEl) errorEl.textContent = 'Укажите username'; return; }
    if (!password) { if (errorEl) errorEl.textContent = 'Введите пароль'; return; }
    if (errorEl) errorEl.textContent = '';

    const actionBtn = document.getElementById('auth-action-btn');
    if (actionBtn) { actionBtn.disabled = true; actionBtn.textContent = 'Вход...'; }

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
            startRequestsPolling();
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
        if (actionBtn) { actionBtn.disabled = false; actionBtn.textContent = 'Войти'; }
    }
}

async function registerUser() {
    const name     = document.getElementById('auth-name')?.value.trim();
    const username = document.getElementById('auth-username')?.value.trim().replace('@', '');
    const password = document.getElementById('auth-password')?.value;
    const discord  = document.getElementById('auth-discord')?.value.trim();
    const telegram = document.getElementById('auth-telegram')?.value.trim();
    const errorEl  = document.getElementById('auth-username-error');

    if (!name)           { showToast('Укажите имя'); return; }
    if (!password)       { showToast('Укажите пароль'); return; }
    if (password.length < 4) { showToast('Пароль должен быть минимум 4 символа'); return; }

    const usernameErr = validateUsername(username);
    if (usernameErr) { if (errorEl) errorEl.textContent = usernameErr; return; }
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
            startRequestsPolling();
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
    if (!username)          return 'Укажите username';
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
    if (navAvatar)   navAvatar.src           = userState.avatar;
    if (navUsername) navUsername.textContent  = userState.name || 'Гость';

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

    if (editAvatar)    editAvatar.src      = userState.avatar;
    if (inputName)     inputName.value     = userState.name;
    if (inputUsername) inputUsername.value = userState.username;
    if (inputDiscord)  inputDiscord.value  = userState.discord;
    if (inputTelegram) inputTelegram.value = userState.telegram;
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
    if (usernameErr) { if (errorEl) errorEl.textContent = usernameErr; return; }
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

// ─── AVATAR CROP ──────────────────────────────────────────────────────────────

const CROP_PX = 272; // размер холста (совпадает с CSS)

const cropState = {
    img:           null,
    scale:         1,
    minScale:      1,
    maxScale:      4,
    offsetX:       0,
    offsetY:       0,
    dragging:      false,
    startX:        0,
    startY:        0,
    startOffsetX:  0,
    startOffsetY:  0,
    lastPinchDist: null
};

/* Открываем кроппер, загружая файл в Image */
function openCropModal(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            cropState.img       = img;
            cropState.minScale  = Math.max(CROP_PX / img.width, CROP_PX / img.height);
            cropState.maxScale  = cropState.minScale * 4;
            cropState.scale     = cropState.minScale;
            cropState.offsetX   = 0;
            cropState.offsetY   = 0;

            const zoomEl = document.getElementById('crop-zoom');
            if (zoomEl) zoomEl.value = '0'; // слайдер идёт от 0 до 1

            drawCrop();
            document.getElementById('crop-modal')?.classList.add('active');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function closeCropModal() {
    document.getElementById('crop-modal')?.classList.remove('active');
    const inp = document.getElementById('avatar-input');
    if (inp) inp.value = '';
}

/* Рендер изображения на холсте */
function drawCrop() {
    const canvas = document.getElementById('crop-canvas');
    if (!canvas || !cropState.img) return;

    canvas.width  = CROP_PX;
    canvas.height = CROP_PX;
    const ctx = canvas.getContext('2d');
    const { img, scale, offsetX, offsetY } = cropState;
    const w = img.width  * scale;
    const h = img.height * scale;
    const x = (CROP_PX - w) / 2 + offsetX;
    const y = (CROP_PX - h) / 2 + offsetY;

    ctx.clearRect(0, 0, CROP_PX, CROP_PX);
    ctx.drawImage(img, x, y, w, h);
}

/* Не даём выехать за границы круга */
function clampOffset() {
    const { img, scale } = cropState;
    const w = img.width  * scale;
    const h = img.height * scale;
    const maxX = Math.max(0, (w - CROP_PX) / 2);
    const maxY = Math.max(0, (h - CROP_PX) / 2);
    cropState.offsetX = Math.max(-maxX, Math.min(maxX, cropState.offsetX));
    cropState.offsetY = Math.max(-maxY, Math.min(maxY, cropState.offsetY));
}

/* Подтверждаем кроп → загружаем на сервер */
async function confirmCrop() {
    const output = document.createElement('canvas');
    output.width  = CROP_PX;
    output.height = CROP_PX;
    const ctx = output.getContext('2d');

    // Круговой клип
    ctx.beginPath();
    ctx.arc(CROP_PX / 2, CROP_PX / 2, CROP_PX / 2, 0, Math.PI * 2);
    ctx.clip();

    const { img, scale, offsetX, offsetY } = cropState;
    const w = img.width  * scale;
    const h = img.height * scale;
    const x = (CROP_PX - w) / 2 + offsetX;
    const y = (CROP_PX - h) / 2 + offsetY;
    ctx.drawImage(img, x, y, w, h);

    closeCropModal();

    const statusEl = document.getElementById('avatar-upload-status');
    if (statusEl) { statusEl.textContent = 'Загрузка...'; statusEl.className = 'upload-status'; }

    output.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('avatar', blob, 'avatar.jpg');
        try {
            const response = await fetch('/api/upload_avatar', { method: 'POST', body: formData });
            const data     = await response.json();
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
    }, 'image/jpeg', 0.92);
}

/* Расстояние между двумя пальцами (пинч) */
function getPinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/* Перевод значения слайдера [0..1] → реальный scale */
function sliderToScale(v) {
    const { minScale, maxScale } = cropState;
    return minScale + (maxScale - minScale) * v;
}

/* Инициализация событий кроппера */
function initCropCanvas() {
    const stage = document.querySelector('.crop-stage');
    if (!stage) return;

    // ── Mouse ──
    stage.addEventListener('mousedown', (e) => {
        e.preventDefault();
        cropState.dragging     = true;
        cropState.startX       = e.clientX;
        cropState.startY       = e.clientY;
        cropState.startOffsetX = cropState.offsetX;
        cropState.startOffsetY = cropState.offsetY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!cropState.dragging) return;
        cropState.offsetX = cropState.startOffsetX + (e.clientX - cropState.startX);
        cropState.offsetY = cropState.startOffsetY + (e.clientY - cropState.startY);
        clampOffset();
        drawCrop();
    });

    window.addEventListener('mouseup', () => { cropState.dragging = false; });

    // Колёсико мыши — зум
    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const { minScale, maxScale } = cropState;
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        cropState.scale = Math.max(minScale, Math.min(maxScale, cropState.scale + delta * (maxScale - minScale)));
        clampOffset();
        drawCrop();
        // синхронизируем слайдер
        const zoomEl = document.getElementById('crop-zoom');
        if (zoomEl) {
            zoomEl.value = String((cropState.scale - minScale) / (maxScale - minScale));
        }
    }, { passive: false });

    // ── Touch ──
    stage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            cropState.dragging      = true;
            cropState.startX        = e.touches[0].clientX;
            cropState.startY        = e.touches[0].clientY;
            cropState.startOffsetX  = cropState.offsetX;
            cropState.startOffsetY  = cropState.offsetY;
            cropState.lastPinchDist = null;
        } else if (e.touches.length === 2) {
            cropState.dragging      = false;
            cropState.lastPinchDist = getPinchDist(e.touches);
        }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && cropState.dragging) {
            cropState.offsetX = cropState.startOffsetX + (e.touches[0].clientX - cropState.startX);
            cropState.offsetY = cropState.startOffsetY + (e.touches[0].clientY - cropState.startY);
            clampOffset();
            drawCrop();
        } else if (e.touches.length === 2) {
            const dist  = getPinchDist(e.touches);
            if (cropState.lastPinchDist) {
                const ratio    = dist / cropState.lastPinchDist;
                const { minScale, maxScale } = cropState;
                cropState.scale = Math.max(minScale, Math.min(maxScale, cropState.scale * ratio));
                clampOffset();
                drawCrop();
                const zoomEl = document.getElementById('crop-zoom');
                if (zoomEl) {
                    zoomEl.value = String((cropState.scale - minScale) / (maxScale - minScale));
                }
            }
            cropState.lastPinchDist = dist;
        }
    }, { passive: false });

    stage.addEventListener('touchend', () => {
        cropState.dragging      = false;
        cropState.lastPinchDist = null;
    });

    // ── Zoom slider ──
    document.getElementById('crop-zoom')?.addEventListener('input', (e) => {
        cropState.scale = sliderToScale(parseFloat(e.target.value));
        clampOffset();
        drawCrop();
    });
}

// ─── AVATAR UPLOAD (перехватываем → кроппер) ──────────────────────────────────

document.getElementById('avatar-input')?.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('avatar-upload-status');

    if (file.size > 10 * 1024 * 1024) {
        if (statusEl) { statusEl.textContent = 'Файл слишком большой (макс. 10 МБ)'; statusEl.className = 'upload-status error'; }
        e.target.value = '';
        return;
    }

    openCropModal(file);
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
    const query    = document.getElementById('friend-search-input')?.value.trim().replace('@', '');
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
            loadFriendRequests(); // обновить счётчик
        } else {
            showToast('Ошибка: ' + data.message);
        }
    } catch (err) {
        console.error('Add friend error:', err);
        showToast('Ошибка соединения');
    }
}

// ─── FRIEND REQUESTS ──────────────────────────────────────────────────────────

/**
 * Запускаем фоновый опрос каждые 30 секунд,
 * чтобы обновлять бейдж уведомлений.
 */
function startRequestsPolling() {
    loadFriendRequests(); // сразу при входе
    if (requestsPollingInterval) clearInterval(requestsPollingInterval);
    requestsPollingInterval = setInterval(loadFriendRequests, 30_000);
}

/**
 * Загружаем входящие и исходящие запросы,
 * обновляем бейдж на кнопке 🔔.
 */
async function loadFriendRequests() {
    if (!isAuthenticated) return;

    try {
        const response = await fetch('/api/friend_requests');
        const data = await response.json();

        if (data.status !== 'success') return;

        const incoming = data.incoming || [];
        const outgoing = data.outgoing || [];

        // Обновляем счётчики вкладок
        document.getElementById('incoming-count').textContent = incoming.length;
        document.getElementById('outgoing-count').textContent = outgoing.length;

        // Бейдж на кнопке (только входящие — они требуют действия)
        const badge = document.getElementById('requests-badge');
        if (badge) {
            if (incoming.length > 0) {
                badge.textContent = incoming.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        // Если модал открыт — перерисовываем список
        const modal = document.getElementById('requests-modal');
        if (modal?.classList.contains('active')) {
            renderRequestsList(incoming, outgoing);
        }

        return { incoming, outgoing };
    } catch (err) {
        console.warn('Could not load friend requests:', err);
        return { incoming: [], outgoing: [] };
    }
}

function openRequestsModal() {
    if (!isAuthenticated) { showAuthModal(); return; }

    currentRequestsTab = 'incoming';

    // Сбросить стиль вкладок
    document.getElementById('tab-incoming')?.classList.add('active');
    document.getElementById('tab-outgoing')?.classList.remove('active');

    document.getElementById('requests-modal')?.classList.add('active');
    document.getElementById('requests-list').innerHTML = '<div class="requests-empty">Загрузка...</div>';

    loadFriendRequests().then(result => {
        if (result) renderRequestsList(result.incoming, result.outgoing);
    });
}

function closeRequestsModal() {
    document.getElementById('requests-modal')?.classList.remove('active');
}

function switchRequestsTab(tab) {
    currentRequestsTab = tab;

    document.getElementById('tab-incoming')?.classList.toggle('active', tab === 'incoming');
    document.getElementById('tab-outgoing')?.classList.toggle('active', tab === 'outgoing');

    // Перерисовать без нового запроса, данные уже в DOM-счётчиках
    loadFriendRequests().then(result => {
        if (result) renderRequestsList(result.incoming, result.outgoing);
    });
}

function renderRequestsList(incoming, outgoing) {
    const listEl = document.getElementById('requests-list');
    if (!listEl) return;

    const items = currentRequestsTab === 'incoming' ? incoming : outgoing;

    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="requests-empty">
                ${currentRequestsTab === 'incoming'
                    ? '🎉 Входящих запросов нет'
                    : '📤 Вы никому не отправляли запросы'}
            </div>`;
        return;
    }

    listEl.innerHTML = '';

    items.forEach(req => {
        // req = { id, name, username, avatar }
        const card = document.createElement('div');
        card.className = 'request-card';
        card.id = `req-card-${req.id}`;

        const isIncoming = currentRequestsTab === 'incoming';

        card.innerHTML = `
            <img src="${escapeHtml(req.avatar || DEFAULT_STATE.avatar)}" alt="${escapeHtml(req.name)}" class="request-avatar">
            <div class="request-info">
                <b>${escapeHtml(req.name)}</b>
                <span>@${escapeHtml(req.username)}</span>
            </div>
            <div class="request-actions">
                ${isIncoming ? `
                    <button class="req-accept-btn" onclick="respondFriendRequest(${req.id}, 'accept')">✓</button>
                    <button class="req-decline-btn" onclick="respondFriendRequest(${req.id}, 'decline')">✕</button>
                ` : `
                    <button class="req-cancel-btn" onclick="respondFriendRequest(${req.id}, 'cancel')">Отменить</button>
                `}
            </div>
        `;

        listEl.appendChild(card);
    });
}

/**
 * Принять, отклонить или отменить запрос.
 * action: 'accept' | 'decline' | 'cancel'
 */
async function respondFriendRequest(requestId, action) {
    // Быстро убираем карточку из DOM для плавности UX
    const card = document.getElementById(`req-card-${requestId}`);
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'translateX(40px)';
        card.style.transition = 'opacity 0.25s, transform 0.25s';
        setTimeout(() => card.remove(), 250);
    }

    try {
        const response = await fetch('/api/friend_request_respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId, action })
        });
        const data = await response.json();

        if (data.status === 'success') {
            const messages = {
                accept:  '🎉 Теперь вы друзья!',
                decline: 'Запрос отклонён',
                cancel:  'Запрос отменён'
            };
            showToast(messages[action] || 'Готово');

            if (action === 'accept') loadFriends(); // обновить список друзей на карте
            loadFriendRequests(); // обновить бейдж
        } else {
            showToast('Ошибка: ' + (data.message || 'попробуйте снова'));
            if (card) { card.style.opacity = '1'; card.style.transform = 'none'; } // вернуть
        }
    } catch (err) {
        console.error('Respond friend request error:', err);
        showToast('Ошибка соединения');
        if (card) { card.style.opacity = '1'; card.style.transform = 'none'; }
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
            { name: "Алекс", pos: [55.755, 37.618], avatar: "/static/uploads/koliman.jpg" },
            { name: "Мария", pos: [55.742, 37.610], avatar: "/static/uploads/koliman.jpg" }
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
    if (requestsPollingInterval) clearInterval(requestsPollingInterval);
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
initCropCanvas();
