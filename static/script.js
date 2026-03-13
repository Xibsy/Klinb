// 1. Инициализация и очистка данных
const DEFAULT_STATE = {
    name: "Твоё Имя",
    username: "new_user",
    avatar: "https://i.pravatar.cc/150?img=3",
    discord: "",
    telegram: "",
    theme: "dark"
};

let userState = JSON.parse(localStorage.getItem('blink_user')) || DEFAULT_STATE;

// 2. Карта
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([55.7512, 37.6184], 13);
const layers = {
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png')
};
layers[userState.theme].addTo(map);

// 3. Обновление UI
function updateUI() {
    document.body.setAttribute('data-theme', userState.theme);

    // Элементы навигации
    document.getElementById('nav-avatar').src = userState.avatar;
    document.getElementById('nav-username').innerText = userState.name;

    // Поля в модалке
    document.getElementById('edit-avatar').src = userState.avatar;
    document.getElementById('input-name').value = userState.name;
    document.getElementById('input-username').value = userState.username;
    document.getElementById('input-discord').value = userState.discord;
    document.getElementById('input-telegram').value = userState.telegram;
}

// 4. Профиль и сохранение
function openProfile() {
    document.getElementById('profile-modal').classList.add('active');
}

function closeProfile() {
    document.getElementById('profile-modal').classList.remove('active');
}

function saveProfile() {
    try {
        userState.name = document.getElementById('input-name').value || "Без имени";
        userState.username = document.getElementById('input-username').value || "user";
        userState.discord = document.getElementById('input-discord').value;
        userState.telegram = document.getElementById('input-telegram').value;

        localStorage.setItem('blink_user', JSON.stringify(userState));
        updateUI();
        closeProfile();
    } catch (e) {
        alert("Ошибка сохранения: возможно, фото слишком тяжелое.");
    }
}

// 5. Загрузка фото
document.getElementById('avatar-input').onchange = function(e) {
    const file = e.target.files[0];
    if (file && file.size > 2 * 1024 * 1024) {
        alert("Файл слишком большой! Выбери фото до 2МБ.");
        return;
    }
    const reader = new FileReader();
    reader.onload = function() {
        userState.avatar = reader.result;
        document.getElementById('edit-avatar').src = reader.result;
    };
    reader.readAsDataURL(file);
};

// 6. Смена темы
document.getElementById('theme-toggle').onclick = () => {
    map.removeLayer(layers[userState.theme]);
    userState.theme = userState.theme === 'dark' ? 'light' : 'dark';
    layers[userState.theme].addTo(map);
    updateUI();
    localStorage.setItem('blink_user', JSON.stringify(userState));
};

// 7. Рендер друзей (с исправленным центрированием иконок)
const friends = [
    { name: "Алекс", pos: [55.755, 37.62], img: "https://i.pravatar.cc/150?img=11" },
    { name: "Мария", pos: [55.742, 37.61], img: "https://i.pravatar.cc/150?img=5" }
];

friends.forEach(f => {
    const customIcon = L.divIcon({
        className: 'map-avatar-wrapper',
        html: `<img src="${f.img}" class="map-avatar-img">`,
        iconSize: [46, 46],
        iconAnchor: [23, 23] // Центрируем иконку точно по координате
    });

    L.marker(f.pos, { icon: customIcon }).addTo(map).bindPopup(`<b>${f.name}</b>`);

    const fCard = document.createElement('div');
    fCard.className = 'friend-item';
    fCard.innerHTML = `<img src="${f.img}"><span>${f.name}</span>`;
    fCard.onclick = () => map.flyTo(f.pos, 15, { duration: 1.5 });
    document.getElementById('friends-list').appendChild(fCard);
});

// Стили для иконок на карте (добавлены динамически)
const style = document.createElement('style');
style.innerHTML = `
    .map-avatar-img { width: 40px; height: 40px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.2); object-fit: cover; }
`;
document.head.appendChild(style);

// Инициализация
updateUI();