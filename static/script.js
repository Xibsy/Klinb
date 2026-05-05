// ─── STATE ────────────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
    name: "",
    username: "",
    avatar: "/static/uploads/volosatic.jpg",
    discord: "",
    telegram: "",
    theme: "dark",
    status: "",
    show_aaa: false,
    bio: ""
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
let isAdmin = false;
let currentRequestsTab = 'incoming';
let requestsPollingInterval = null;
let broadcastPollingInterval = null;
let lastBroadcastId = 0;
let currentFriendForMenu = null;   // храним друга, для которого открыто меню
let adminEditingFriend = null;     // друг, профиль которого редактирует админ

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
            await checkAdminStatus();
            updateUI();
            loadFriends();
            startRequestsPolling();
            startBroadcastPolling();
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
            await checkAdminStatus();
            updateUI();
            closeAuthModal();
            loadFriends();
            startRequestsPolling();
            startBroadcastPolling();
            saveCurrentAccountToList();
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
            await checkAdminStatus();
            updateUI();
            closeAuthModal();
            loadFriends();
            startRequestsPolling();
            startBroadcastPolling();
            saveCurrentAccountToList();
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

// ─── UI (свои профиль, скрытие строк) ───────────────────────────────────────────────────────────────

function updateUI() {
    const displayBio = document.getElementById('display-bio');
    if (displayBio) {
        const bioText = userState.bio || "";
        if (bioText.trim()) {
            displayBio.className = 'profile-bio-card';
            displayBio.innerHTML = `<div class="bio-icon">✏️</div><span class="bio-text">${escapeHtml(bioText)}</span>`;
        } else {
            displayBio.className = 'profile-bio';
            displayBio.innerHTML = '';
            displayBio.textContent = '';
        }
    }

    const inBio = document.getElementById('input-bio');
    if(inBio) inBio.value = userState.bio || "";

    // Badges update
    const displayAaa = document.getElementById('display-aaa');
    const displayStatus = document.getElementById('display-status');
    if(displayAaa) {
        displayAaa.src = "/static/uploads/ААА ТЕРАРИСТ.svg";
        displayAaa.style.display = userState.show_aaa ? 'block' : 'none';
    }
    if(displayStatus) {
        if(userState.status) {
            displayStatus.src = "/static/uploads/" + userState.status;
            displayStatus.style.display = 'block';
        } else {
            displayStatus.style.display = 'none';
        }
    }
    const inAaa = document.getElementById('input-aaa');
    const inStatus = document.getElementById('input-status');
    if(inAaa) inAaa.checked = !!userState.show_aaa;
    if(inStatus) inStatus.value = userState.status || "";

    // AAA badge только для админов
    const badgeCheckboxRow = document.querySelector('.badge-checkbox');
    if (badgeCheckboxRow) {
        badgeCheckboxRow.style.display = isAdmin ? 'flex' : 'none';
    }

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

    // Стилизованные ссылки соцсетей в своём профиле
    const mySocialInfo = document.getElementById('my-social-info');
    if (mySocialInfo) {
        const hasD = !!(userState.discord  && userState.discord  !== 'не указан');
        const hasT = !!(userState.telegram && userState.telegram !== 'не указан');
        mySocialInfo.innerHTML = '';
        if (hasD) {
            const row = document.createElement('div');
            row.className = 'social-link-row';
            row.title = 'Скопировать Discord ID';
            row.innerHTML = `
                <div class="social-link-icon dc-icon">💬</div>
                <span class="social-link-text">${escapeHtml(userState.discord)}</span>
                <span class="social-link-arrow">📋</span>
            `;
            row.onclick = () => {
                navigator.clipboard.writeText(userState.discord).then(() => showToast('Discord ID скопирован!'));
            };
            mySocialInfo.appendChild(row);
        }
        if (hasT) {
            const tgHandle = userState.telegram.replace(/^@/, '');
            const row = document.createElement('div');
            row.className = 'social-link-row';
            row.title = 'Открыть в Telegram';
            row.innerHTML = `
                <div class="social-link-icon tg-icon">✈️</div>
                <span class="social-link-text">@${escapeHtml(tgHandle)}</span>
                <span class="social-link-arrow">↗</span>
            `;
            row.onclick = () => window.open(`https://t.me/${encodeURIComponent(tgHandle)}`, '_blank');
            mySocialInfo.appendChild(row);
        }
        mySocialInfo.style.display = (hasD || hasT) ? '' : 'none';
    }

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

// ─── PROFILE (свой) ──────────────────────────────────────────────────────────────────

function toggleEdit(isEdit) {
    document.getElementById('view-mode').style.display = isEdit ? 'none'  : 'block';
    document.getElementById('edit-mode').style.display = isEdit ? 'block' : 'none';
    const errEl = document.getElementById('username-error');
    if (errEl) errEl.textContent = '';
}

function openProfile() {
    if (!isAuthenticated) { showAuthModal(); return; }
    toggleEdit(false);
    renderAccountsList();
    document.getElementById('profile-modal')?.classList.add('active');
}

function closeProfile() {
    document.getElementById('profile-modal')?.classList.remove('active');
}

async function saveProfile() {
    const status = document.getElementById('input-status').value;
    const bio = document.getElementById("input-bio").value;
    // ААА ТЕРАРИСТ только для администраторов
    const show_aaa = isAdmin ? document.getElementById('input-aaa').checked : false;

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

    const payload = { name, username, discord, telegram, status, show_aaa, bio };

    try {
        const response = await fetch('/api/update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            userState = { ...userState, name, username, discord, telegram, status, show_aaa, bio };
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

const CROP_PX = 272;

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
            if (zoomEl) zoomEl.value = '0';

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

function clampOffset() {
    const { img, scale } = cropState;
    const w = img.width  * scale;
    const h = img.height * scale;
    const maxX = Math.max(0, (w - CROP_PX) / 2);
    const maxY = Math.max(0, (h - CROP_PX) / 2);
    cropState.offsetX = Math.max(-maxX, Math.min(maxX, cropState.offsetX));
    cropState.offsetY = Math.max(-maxY, Math.min(maxY, cropState.offsetY));
}

async function confirmCrop() {
    const output = document.createElement('canvas');
    output.width  = CROP_PX;
    output.height = CROP_PX;
    const ctx = output.getContext('2d');

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

function getPinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function sliderToScale(v) {
    const { minScale, maxScale } = cropState;
    return minScale + (maxScale - minScale) * v;
}

function initCropCanvas() {
    const stage = document.querySelector('.crop-stage');
    if (!stage) return;

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

    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const { minScale, maxScale } = cropState;
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        cropState.scale = Math.max(minScale, Math.min(maxScale, cropState.scale + delta * (maxScale - minScale)));
        clampOffset();
        drawCrop();
        const zoomEl = document.getElementById('crop-zoom');
        if (zoomEl) {
            zoomEl.value = String((cropState.scale - minScale) / (maxScale - minScale));
        }
    }, { passive: false });

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

    document.getElementById('crop-zoom')?.addEventListener('input', (e) => {
        cropState.scale = sliderToScale(parseFloat(e.target.value));
        clampOffset();
        drawCrop();
    });
}

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
            loadFriendRequests();
        } else {
            showToast('Ошибка: ' + data.message);
        }
    } catch (err) {
        console.error('Add friend error:', err);
        showToast('Ошибка соединения');
    }
}

// ─── FRIEND REQUESTS ──────────────────────────────────────────────────────────

function startRequestsPolling() {
    loadFriendRequests();
    if (requestsPollingInterval) clearInterval(requestsPollingInterval);
    requestsPollingInterval = setInterval(loadFriendRequests, 30_000);
}

async function loadFriendRequests() {
    if (!isAuthenticated) return;

    try {
        const response = await fetch('/api/friend_requests');
        const data = await response.json();

        if (data.status !== 'success') return;

        const incoming = data.incoming || [];
        const outgoing = data.outgoing || [];

        document.getElementById('incoming-count').textContent = incoming.length;
        document.getElementById('outgoing-count').textContent = outgoing.length;

        const badge = document.getElementById('requests-badge');
        if (badge) {
            if (incoming.length > 0) {
                badge.textContent = incoming.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

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

async function respondFriendRequest(requestId, action) {
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

            if (action === 'accept') loadFriends();
            loadFriendRequests();
        } else {
            showToast('Ошибка: ' + (data.message || 'попробуйте снова'));
            if (card) { card.style.opacity = '1'; card.style.transform = 'none'; }
        }
    } catch (err) {
        console.error('Respond friend request error:', err);
        showToast('Ошибка соединения');
        if (card) { card.style.opacity = '1'; card.style.transform = 'none'; }
    }
}

// ─── FRIENDS LIST & MAP MARKERS ─────────────────────────────────────────────────────────

async function loadFriends() {
    try {
        const response = await fetch('/api/friends');
        const data = await response.json();
        if (data.status === 'success' && Array.isArray(data.friends)) {
            renderFriends(data.friends);
        }
    } catch (err) {
        console.warn('Could not load friends:', err);
        renderFriends([]);
    }
}

function renderFriends(friends) {
    const listEl = document.getElementById('friends-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Удаляем все существующие маркеры друзей, кроме myMarker
    map.eachLayer((layer) => {
        if (layer instanceof L.Marker && layer !== myMarker) {
            map.removeLayer(layer);
        }
    });

    friends.forEach(f => {
        const pos = f.pos;
        if (!pos) return;

        const icon = L.divIcon({
            className: 'map-avatar-wrapper',
            html: `<img src="${escapeHtml(f.avatar)}" class="map-avatar-img" alt="${escapeHtml(f.name)}">`,
            iconSize: [46, 46],
            iconAnchor: [23, 23]
        });
        const marker = L.marker(pos, { icon }).addTo(map);
        // Клик по маркеру → только приближение
        marker.on('click', () => {
            map.flyTo(pos, 15, { duration: 1.2 });
        });

        // Карточка в нижней панели
        const card = document.createElement('div');
        card.className = 'friend-item';
        card.innerHTML = `<img src="${escapeHtml(f.avatar)}" alt="${escapeHtml(f.name)}"><span>${escapeHtml(f.name)}</span>`;
        card.onclick = () => openFriendProfile(f);
        listEl.appendChild(card);
    });
}

// ─── FRIEND PROFILE MODAL ─────────────────────────────────────────────────────

function openFriendProfile(friend) {
    if (!friend) return;
    currentFriendForMenu = friend;

    // Bio — стилизованная карточка в стиле соцсетей
    const fBio = document.getElementById('friend-bio');
    if (fBio) {
        if (friend.bio && friend.bio.trim()) {
            fBio.className = 'profile-bio-card';
            fBio.innerHTML = `<div class="bio-icon">✏️</div><span class="bio-text">${escapeHtml(friend.bio.trim())}</span>`;
        } else {
            fBio.className = 'profile-bio';
            fBio.innerHTML = '';
        }
    }

    const fAaa = document.getElementById('friend-aaa');
    const fStatus = document.getElementById('friend-status');
    if (fAaa) {
        fAaa.src = "/static/uploads/ААА ТЕРАРИСТ.svg";
        fAaa.style.display = friend.show_aaa ? 'block' : 'none';
    }
    if (fStatus) {
        if (friend.status) {
            fStatus.src = "/static/uploads/" + friend.status;
            fStatus.style.display = 'block';
        } else {
            fStatus.style.display = 'none';
        }
    }

    document.getElementById('friend-avatar').src = friend.avatar || DEFAULT_STATE.avatar;
    document.getElementById('friend-name').textContent = friend.name || 'Без имени';
    document.getElementById('friend-username').textContent = '@' + (friend.username || 'user');

    // Стилизованные ссылки на соцсети
    const friendSocialBlock = document.getElementById('friend-social-info');
    const hasDiscord  = !!(friend.discord  && friend.discord  !== 'не указан');
    const hasTelegram = !!(friend.telegram && friend.telegram !== 'не указан');

    if (friendSocialBlock) {
        friendSocialBlock.innerHTML = '';
        if (hasDiscord) {
            const row = document.createElement('div');
            row.className = 'social-link-row';
            row.title = 'Скопировать Discord ID';
            row.innerHTML = `
                <div class="social-link-icon dc-icon">💬</div>
                <span class="social-link-text">${escapeHtml(friend.discord)}</span>
                <span class="social-link-arrow">📋</span>
            `;
            row.onclick = () => {
                navigator.clipboard.writeText(friend.discord).then(() => showToast('Discord ID скопирован!'));
            };
            friendSocialBlock.appendChild(row);
        }
        if (hasTelegram) {
            const tgHandle = friend.telegram.replace(/^@/, '');
            const row = document.createElement('div');
            row.className = 'social-link-row';
            row.title = 'Открыть в Telegram';
            row.innerHTML = `
                <div class="social-link-icon tg-icon">✈️</div>
                <span class="social-link-text">@${escapeHtml(tgHandle)}</span>
                <span class="social-link-arrow">↗</span>
            `;
            row.onclick = () => window.open(`https://t.me/${encodeURIComponent(tgHandle)}`, '_blank');
            friendSocialBlock.appendChild(row);
        }
        friendSocialBlock.style.display = (hasDiscord || hasTelegram) ? '' : 'none';
    }

    // Показываем кнопку редактирования для администраторов
    const adminEditBtn = document.getElementById('admin-edit-friend-btn');
    if (adminEditBtn) adminEditBtn.style.display = isAdmin ? 'block' : 'none';

    // Закрыть меню, если открыто
    document.getElementById('friend-menu-dropdown').style.display = 'none';
    document.getElementById('friend-profile-modal')?.classList.add('active');
}

function closeFriendProfile() {
    document.getElementById('friend-profile-modal')?.classList.remove('active');
    document.getElementById('friend-menu-dropdown').style.display = 'none';
    currentFriendForMenu = null;
}

function toggleFriendMenu() {
    if (event) event.stopPropagation();
    const menu = document.getElementById('friend-menu-dropdown');
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    }
}

async function removeCurrentFriend() {
    if (!currentFriendForMenu) return;
    const friendId = currentFriendForMenu.id;
    if (!friendId) {
        showToast('Не удалось определить ID друга');
        return;
    }

    try {
        const response = await fetch('/api/delete_friend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friend_id: friendId })
        });
        const data = await response.json();
        if (data.status === 'success') {
            showToast(`Друг ${currentFriendForMenu.name} удалён`);
            closeFriendProfile();
            loadFriends();  // перезагрузим список и карту
        } else {
            showToast('Ошибка: ' + (data.message || 'Не удалось удалить друга'));
        }
    } catch (err) {
        console.error('Remove friend error:', err);
        showToast('Ошибка соединения');
    }
}

function showSoonToast() {
    showToast('⏳ Скоро...');
    document.getElementById('friend-menu-dropdown').style.display = 'none';
}

// Закрытие меню при клике вне
window.addEventListener('click', (e) => {
    const menu = document.getElementById('friend-menu-dropdown');
    const btn = document.querySelector('.friend-menu-btn');
    if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});

// ─── MY PROFILE MENU (троеточие) ───────────────────────────────────────────

function toggleMyProfileMenu() {
    const menu = document.getElementById('my-profile-menu-dropdown');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

window.addEventListener('click', (e) => {
    const menu = document.getElementById('my-profile-menu-dropdown');
    const btn  = document.querySelector('.my-profile-menu-btn');
    if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function openHtmlPreview(htmlString) {
    const modal = document.getElementById('html-preview-modal');
    const codeEl = document.getElementById('html-preview-code');
    if (modal && codeEl) {
        codeEl.textContent = htmlString;
        modal.classList.add('active');
    }
}

function closeHtmlPreview() {
    document.getElementById('html-preview-modal')?.classList.remove('active');
}

function copyHtmlCode() {
    const code = document.getElementById('html-preview-code')?.textContent;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => showToast('Код скопирован!'));
}

function generateMyProfileHTML() {
    document.getElementById('my-profile-menu-dropdown').style.display = 'none';

    const rawUsername = userState.username || 'user';
    const origin      = window.location.origin;

    // Вытаскиваем имя файла аватарки из пути (последний сегмент)
    function extractFilename(url) {
        if (!url) return '';
        return url.split('/').pop();
    }

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>@${rawUsername} — Blink Profile</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f0f0f;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 24px;
  }
  .profile-card {
    background: #1c1c1e;
    border-radius: 24px;
    padding: 36px 28px 32px;
    width: 100%;
    max-width: 340px;
    text-align: center;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.06);
    transition: opacity 0.3s;
  }
  .avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #30d158;
    margin-bottom: 16px;
    transition: opacity 0.3s;
  }
  .name-wrapper { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px; }
  .badge-icon { width: 20px; height: 20px; object-fit: contain; }
  .display-name { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .display-username { color: #30d158; font-size: 14px; margin-bottom: 12px; font-weight: 500; }
  .profile-bio { color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 20px; line-height: 1.4; min-height: 0; }
  .social-info { background: rgba(255,255,255,0.04); border-radius: 14px; padding: 4px 0; }
  .si-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; color: rgba(255,255,255,0.8); font-size: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .si-row:last-child { border-bottom: none; }
  .si-icon { font-size: 18px; }
  .blink-badge { display: inline-block; margin-top: 22px; font-size: 11px; color: rgba(255,255,255,0.2); letter-spacing: 0.5px; }
  .sync-dot {
    position: fixed;
    top: 12px; right: 14px;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #30d158;
    opacity: 0;
    transition: opacity 0.4s;
  }
  .sync-dot.pulse { opacity: 1; }
</style>
</head>
<body>
  <div class="sync-dot" id="sync-dot"></div>
  <div class="profile-card" id="profile-card">
    <img class="avatar" id="ext-avatar" src="" alt="">
    <div class="name-wrapper">
        <img id="ext-aaa" class="badge-icon" src="${origin}/api/image/%D0%90%D0%90%D0%90%20%D0%A2%D0%95%D0%A0%D0%90%D0%A0%D0%98%D0%A1%D0%A2.svg" style="display:none" title="ААА ТЕРАРИСТ">
        <div class="display-name" id="ext-name">...</div>
        <img id="ext-status" class="badge-icon" src="" style="display:none">
    </div>
    <div class="display-username" id="ext-username">@${rawUsername}</div>
    <p class="profile-bio" id="ext-bio"></p>
    <div class="social-info" id="ext-social" style="display:none"></div>
    <span class="blink-badge">Blink Web Pro</span>
  </div>

<script>
(function () {
  const ORIGIN   = '${origin}';
  const USERNAME = '${rawUsername}';
  const INTERVAL = 30_000; // синхронизация каждые 30 секунд

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function imageUrl(filename) {
    if (!filename) return '';
    // Если уже полный URL — берём только имя файла
    const file = filename.split('/').pop();
    return ORIGIN + '/api/image/' + encodeURIComponent(file);
  }

  function pulseDot() {
    const dot = document.getElementById('sync-dot');
    if (!dot) return;
    dot.classList.add('pulse');
    setTimeout(() => dot.classList.remove('pulse'), 1000);
  }

  function applyUser(u) {
    document.title = '@' + u.username + ' — Blink Profile';

    // Аватарка
    const avatarEl = document.getElementById('ext-avatar');
    if (avatarEl) {
      const newSrc = imageUrl(u.avatar);
      if (newSrc && avatarEl.src !== newSrc) avatarEl.src = newSrc;
      avatarEl.alt = esc(u.name);
    }

    // Имя
    const nameEl = document.getElementById('ext-name');
    if (nameEl) nameEl.textContent = u.name || 'Без имени';

    // @username
    const unEl = document.getElementById('ext-username');
    if (unEl) unEl.textContent = '@' + u.username;

    // Бейдж ААА
    const aaaEl = document.getElementById('ext-aaa');
    if (aaaEl) aaaEl.style.display = u.show_aaa ? 'block' : 'none';

    // Бейдж статуса
    const statusEl = document.getElementById('ext-status');
    if (statusEl) {
      if (u.status) {
        const newSrc = imageUrl(u.status);
        if (statusEl.src !== newSrc) statusEl.src = newSrc;
        statusEl.style.display = 'block';
      } else {
        statusEl.style.display = 'none';
      }
    }

    // Био
    const bioEl = document.getElementById('ext-bio');
    if (bioEl) bioEl.textContent = u.bio || '';

    // Соцсети
    const socialEl = document.getElementById('ext-social');
    if (socialEl) {
      const rows = [];
      if (u.discord)  rows.push('<div class="si-row"><span class="si-icon">💬</span><span>' + esc(u.discord)  + '</span></div>');
      if (u.telegram) rows.push('<div class="si-row"><span class="si-icon">✈️</span><span>' + esc(u.telegram) + '</span></div>');
      if (rows.length) {
        socialEl.innerHTML = rows.join('');
        socialEl.style.display = '';
      } else {
        socialEl.style.display = 'none';
      }
    }
  }

  async function sync() {
    try {
      const res  = await fetch(ORIGIN + '/api/find_user/' + encodeURIComponent(USERNAME));
      const data = await res.json();
      if (data.status === 'success' && data.user) {
        applyUser(data.user);
        pulseDot();
      }
    } catch (e) {
      console.warn('Sync failed:', e);
    }
  }

  // Первая загрузка — сразу
  sync();
  // Периодическая синхронизация
  setInterval(sync, INTERVAL);
})();
<\/script>
</body>
</html>`;

    openHtmlPreview(html);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
    map.removeLayer(layers[userState.theme]);
    userState.theme = userState.theme === 'dark' ? 'light' : 'dark';
    layers[userState.theme].addTo(map);
    updateUI();
    saveStateLocally();
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

async function checkAdminStatus() {
    try {
        const res = await fetch('/api/admins');
        const data = await res.json();
        if (data.admins && Array.isArray(data.admins)) {
            isAdmin = data.admins.includes(userState.username);
        } else {
            isAdmin = false;
        }
    } catch (e) {
        console.warn('Could not fetch admin list:', e);
        isAdmin = false;
    }
    updateAdminUI();
}

function updateAdminUI() {
    // Показываем кнопку рассылки в меню своего профиля
    const broadcastBtn = document.getElementById('admin-broadcast-menu-btn');
    if (broadcastBtn) broadcastBtn.style.display = isAdmin ? 'block' : 'none';

    // AAA checkbox видим только для админов
    const badgeRow = document.querySelector('.badge-checkbox');
    if (badgeRow) badgeRow.style.display = isAdmin ? 'flex' : 'none';
}

// ─── ADMIN BROADCAST ──────────────────────────────────────────────────────────

function openBroadcastModal() {
    document.getElementById('my-profile-menu-dropdown').style.display = 'none';
    const input = document.getElementById('broadcast-input');
    if (input) input.value = '';
    document.getElementById('broadcast-modal')?.classList.add('active');
}

function closeBroadcastModal() {
    document.getElementById('broadcast-modal')?.classList.remove('active');
}

async function sendBroadcast() {
    const message = document.getElementById('broadcast-input')?.value.trim();
    if (!message) { showToast('Введите текст сообщения'); return; }

    const btn = document.querySelector('#broadcast-modal .admin-action-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }

    try {
        const res = await fetch('/api/broadcasts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast('✅ Сообщение отправлено всем!');
            closeBroadcastModal();
            // Обновляем lastBroadcastId чтобы сами себе не показывать
            if (data.id) lastBroadcastId = data.id;
        } else {
            showToast('Ошибка: ' + (data.message || 'не удалось отправить'));
        }
    } catch (e) {
        showToast('Ошибка соединения');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📤 Отправить всем'; }
    }
}

function startBroadcastPolling() {
    pollBroadcasts();
    if (broadcastPollingInterval) clearInterval(broadcastPollingInterval);
    broadcastPollingInterval = setInterval(pollBroadcasts, 8_000);
}

async function pollBroadcasts() {
    if (!isAuthenticated) return;
    try {
        const res = await fetch(`/api/broadcasts/latest`);
        const data = await res.json();
        if (data.status === 'success' && data.broadcast) {
            const b = data.broadcast;
            if (b.id && b.id > lastBroadcastId) {
                lastBroadcastId = b.id;
                showBroadcastNotification(b.message);
            }
        }
    } catch (e) {
        // тихо
    }
}

function showBroadcastNotification(message) {
    const banner = document.getElementById('broadcast-banner');
    const msgEl  = document.getElementById('broadcast-message-text');
    if (!banner || !msgEl) return;

    msgEl.textContent = message;
    banner.classList.add('visible');

    // Автоскрытие через 8 секунд
    if (banner._autoHideTimer) clearTimeout(banner._autoHideTimer);
    banner._autoHideTimer = setTimeout(dismissBroadcast, 8000);
}

function dismissBroadcast() {
    const banner = document.getElementById('broadcast-banner');
    if (banner) {
        banner.classList.remove('visible');
        if (banner._autoHideTimer) clearTimeout(banner._autoHideTimer);
    }
}

// ─── ADMIN EDIT FRIEND PROFILE ────────────────────────────────────────────────

function openAdminEditFriendModal() {
    if (!isAdmin || !currentFriendForMenu) return;

    document.getElementById('friend-menu-dropdown').style.display = 'none';

    const f = currentFriendForMenu;
    adminEditingFriend = f;

    const subtitle = document.getElementById('admin-edit-subtitle');
    if (subtitle) subtitle.textContent = `Редактирование: @${f.username}`;

    document.getElementById('admin-edit-name').value     = f.name     || '';
    document.getElementById('admin-edit-username').value = f.username || '';
    document.getElementById('admin-edit-bio').value      = f.bio      || '';
    document.getElementById('admin-edit-discord').value  = f.discord  || '';
    document.getElementById('admin-edit-telegram').value = f.telegram || '';
    document.getElementById('admin-edit-aaa').checked    = !!f.show_aaa;
    document.getElementById('admin-edit-status').value   = f.status   || '';
    document.getElementById('admin-edit-username-error').textContent = '';

    document.getElementById('admin-edit-friend-modal')?.classList.add('active');
}

function closeAdminEditFriendModal() {
    document.getElementById('admin-edit-friend-modal')?.classList.remove('active');
    adminEditingFriend = null;
}

async function saveAdminFriendEdit() {
    if (!isAdmin || !adminEditingFriend) return;

    const name     = document.getElementById('admin-edit-name').value.trim()     || 'Без имени';
    const username = document.getElementById('admin-edit-username').value.trim().replace('@', '');
    const bio      = document.getElementById('admin-edit-bio').value.trim();
    const discord  = document.getElementById('admin-edit-discord').value.trim();
    const telegram = document.getElementById('admin-edit-telegram').value.trim();
    const show_aaa = document.getElementById('admin-edit-aaa').checked;
    const status   = document.getElementById('admin-edit-status').value;
    const errorEl  = document.getElementById('admin-edit-username-error');

    const usernameErr = validateUsername(username);
    if (usernameErr) { if (errorEl) errorEl.textContent = usernameErr; return; }
    if (errorEl) errorEl.textContent = '';

    const saveBtn = document.getElementById('admin-edit-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Сохранение...'; }

    const payload = {
        target_id: adminEditingFriend.id,
        name, username, discord, telegram, status, show_aaa, bio
    };

    try {
        const res = await fetch('/api/update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            showToast(`Профиль @${adminEditingFriend.username} обновлён`);
            closeAdminEditFriendModal();
            closeFriendProfile();
            loadFriends();
        } else {
            const data = await res.json().catch(() => ({}));
            showToast('Ошибка: ' + (data.message || 'попробуйте снова'));
        }
    } catch (e) {
        showToast('Ошибка соединения');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Сохранить'; }
    }
}

// ─── SAVED ACCOUNTS ──────────────────────────────────────────────────────────
// Хранит [{username, name, avatar, token}] в localStorage
// token — remember-токен, выданный сервером после входа

const ACCOUNTS_KEY = 'klinb_saved_accounts';

function getSavedAccounts() {
    try {
        return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
    } catch { return []; }
}

function setSavedAccounts(list) {
    try {
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    } catch (e) { console.warn('Cannot save accounts:', e); }
}

/** Сохраняет текущий аккаунт в список, обновляя если уже есть */
async function saveCurrentAccountToList() {
    let token = null;
    try {
        const res = await fetch('/api/remember_token');
        const data = await res.json();
        if (data.token) token = data.token;
    } catch (e) {
        console.warn('Cannot get remember token:', e);
    }
    if (!token) return; // сервер не поддерживает — не сохраняем

    const accounts = getSavedAccounts();
    const idx = accounts.findIndex(a => a.username === userState.username);
    const entry = {
        username: userState.username,
        name:     userState.name     || userState.username,
        avatar:   userState.avatar   || DEFAULT_STATE.avatar,
        token
    };
    if (idx >= 0) accounts[idx] = entry;
    else accounts.unshift(entry);
    setSavedAccounts(accounts);
    renderAccountsList();
}

/** Рендерит список аккаунтов в профиле */
function renderAccountsList() {
    const container = document.getElementById('accounts-list');
    if (!container) return;

    const accounts = getSavedAccounts();
    // Фильтруем текущий аккаунт — он уже открыт
    const others = accounts.filter(a => a.username !== userState.username);

    if (others.length === 0) {
        container.innerHTML = '<div style="padding:10px 0; color:#8e8e93; font-size:14px;">Нет других аккаунтов</div>';
        return;
    }

    container.innerHTML = others.map(a => `
        <div class="account-row" onclick="switchToAccount('${escapeHtml(a.username)}')">
            <img class="account-row-avatar"
                 src="${escapeHtml(a.avatar)}"
                 onerror="this.src='${DEFAULT_STATE.avatar}'"
                 alt="">
            <div class="account-row-info">
                <div class="account-row-name">${escapeHtml(a.name)}</div>
                <div class="account-row-username">@${escapeHtml(a.username)}</div>
            </div>
            <button class="account-row-remove"
                    onclick="event.stopPropagation(); removeSavedAccount('${escapeHtml(a.username)}')"
                    title="Удалить из списка">✕</button>
        </div>
    `).join('');
}

function removeSavedAccount(username) {
    const list = getSavedAccounts().filter(a => a.username !== username);
    setSavedAccounts(list);
    renderAccountsList();
    showToast(`Аккаунт @${username} удалён из списка`);
}

/** Быстрое переключение без ввода пароля */
async function switchToAccount(username) {
    const accounts = getSavedAccounts();
    const account  = accounts.find(a => a.username === username);
    if (!account?.token) {
        showToast('Нет токена — войдите вручную');
        showAddAccountOverlay();
        return;
    }

    // Показываем оверлей переключения
    const overlay = document.getElementById('account-switching-overlay');
    const label   = document.getElementById('account-switching-label');
    if (overlay) {
        if (label) label.textContent = `Вход в @${username}…`;
        overlay.classList.add('visible');
    }

    try {
        await saveCurrentAccountToList();
        const res = await fetch('/api/login_with_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, token: account.token })
        });
        const data = await res.json();

        if (data.status === 'success') {
            // Сохраняем старый аккаунт
            // Переключаемся
            userState = { ...DEFAULT_STATE, ...data.user };
            saveStateLocally();
            isAuthenticated = true;
            await checkAdminStatus();
            updateUI();
            await saveCurrentAccountToList();
            loadFriends();
            startRequestsPolling();
            startBroadcastPolling();
            closeProfile();
            showToast(`Вошёл как ${userState.name || username}`);
        } else {
            // Токен протух — убираем из списка и просим войти вручную
            removeSavedAccount(username);
            showToast('Сессия истекла — войдите вручную');
            showAddAccountOverlay();
        }
    } catch (e) {
        showToast('Ошибка соединения');
    } finally {
        if (overlay) overlay.classList.remove('visible');
    }
}

/** Открывает форму входа в новый аккаунт поверх текущего */
function showAddAccountOverlay() {
    closeProfile();
    // Показываем стандартный модал логина, но после входа возвращаемся к switchToAccount
    showAuthModal('login');
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

function logout() {
    if (requestsPollingInterval) clearInterval(requestsPollingInterval);
    if (broadcastPollingInterval) clearInterval(broadcastPollingInterval);
    isAdmin = false;

    // Убираем текущий аккаунт из быстрого доступа (токен стал невалидным после logout)
    const accounts = getSavedAccounts().filter(a => a.username !== userState.username);
    setSavedAccounts(accounts);

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