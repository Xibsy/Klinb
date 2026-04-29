// ─── Theme ──────────────────────────────────────────
(function () {
    const saved = localStorage.getItem('blink_theme') || 'dark';
    document.body.setAttribute('data-theme', saved);
})();

function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('blink_theme', next);
}

// ─── Logout ─────────────────────────────────────────
function logout() {
    fetch('/api/logout', { method: 'POST' }).then(() => {
        localStorage.removeItem('blink_user');
        window.location.href = '/';
    });
}

// ─── Avatar helpers ──────────────────────────────────
/**
 * Получает инициалы из имени пользователя.
 * "@alice_wonder" → "AW", "@bob" → "B"
 */
function getInitials(username) {
    const clean = username.replace(/^@/, '');
    const parts = clean.split(/[_\-.\s]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
}

/**
 * Детерминированный цвет фона плейсхолдера на основе имени
 * (чтобы у одного и того же пользователя всегда был одинаковый цвет).
 */
function getUserColor(username) {
    const palette = [
        '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c',
        '#4dabf7', '#748ffc', '#da77f2', '#f783ac',
        '#38d9a9', '#63e6be',
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
}

/**
 * Инициализирует все аватарки на странице:
 * - если у элемента .post-avatar-placeholder есть data-avatar-url → показываем <img>
 * - иначе → генерируем цветной кружок с инициалами
 */
function initAvatars() {
    document.querySelectorAll('.post-avatar-placeholder').forEach(el => {
        const username = el.dataset.username || '';
        const avatarUrl = el.dataset.avatarUrl || '';

        if (avatarUrl) {
            // Есть URL аватарки — заменяем плейсхолдер на <img>
            const img = document.createElement('img');
            img.className = 'post-avatar';
            img.src = avatarUrl;
            img.alt = username;
            img.onerror = () => {
                // Если картинка не загрузилась — возвращаем плейсхолдер с инициалами
                img.replaceWith(buildInitialsEl(username));
            };
            el.replaceWith(img);
        } else {
            // Нет аватарки — рисуем инициалы
            const initialsEl = buildInitialsEl(username);
            el.replaceWith(initialsEl);
        }
    });
}

function buildInitialsEl(username) {
    const div = document.createElement('div');
    div.className = 'post-avatar-placeholder';
    div.textContent = getInitials(username);
    div.style.background = getUserColor(username);
    div.style.borderColor = getUserColor(username);
    div.style.color = '#fff';
    return div;
}

// ─── Like buttons ───────────────────────────────────
function initLikeButtons() {
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.dataset.postId;
            if (!postId) return;

            try {
                const response = await fetch(`/api/posts/${postId}/like`, { method: 'POST' });
                const data = await response.json();

                if (data.status === 'success') {
                    btn.classList.toggle('liked', data.liked);
                    const countEl = btn.querySelector('.like-count');
                    if (countEl) countEl.textContent = data.likes;
                } else {
                    console.warn('Like error:', data.message);
                }
            } catch (err) {
                console.error('Like request failed:', err);
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initAvatars();
    initLikeButtons();
});
