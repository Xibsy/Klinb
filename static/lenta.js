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

// ─── Toast ──────────────────────────────────────────
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

// ─── Logout ─────────────────────────────────────────
function logout() {
    fetch('/api/logout', { method: 'POST' }).then(() => {
        localStorage.removeItem('blink_user');
        window.location.href = '/';
    });
}

// ─── Avatar helpers ──────────────────────────────────
function getInitials(username) {
    const clean = username.replace(/^@/, '');
    const parts = clean.split(/[_\-.\s]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
}

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

function buildInitialsEl(username) {
    const div = document.createElement('div');
    div.className = 'post-avatar-placeholder';
    div.textContent = getInitials(username);
    div.style.background = getUserColor(username);
    div.style.borderColor = getUserColor(username);
    div.style.color = '#fff';
    return div;
}

function initAvatars() {
    document.querySelectorAll('.post-avatar-placeholder').forEach(el => {
        const username = el.dataset.username || '';
        const avatarUrl = el.dataset.avatarUrl || '';

        if (avatarUrl && avatarUrl !== 'None') {
            const img = document.createElement('img');
            img.className = 'post-avatar';
            img.src = avatarUrl;
            img.alt = username;
            img.onerror = () => {
                img.replaceWith(buildInitialsEl(username));
            };
            el.replaceWith(img);
        } else {
            const initialsEl = buildInitialsEl(username);
            el.replaceWith(initialsEl);
        }
    });
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

// ─── Delete post ────────────────────────────────────
async function deletePost(postId, cardElement) {
    if (!confirm('Удалить пост?')) return;

    const originalHTML = cardElement.innerHTML;

    cardElement.style.transition = 'opacity 0.2s, transform 0.2s';
    cardElement.style.opacity = '0.5';
    cardElement.style.transform = 'scale(0.98)';

    try {
        const response = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.status === 'success') {
            cardElement.style.opacity = '0';
            cardElement.style.transform = 'scale(0.95)';
            setTimeout(() => {
                cardElement.remove();
                showToast('Пост удалён');

                const remainingPosts = document.querySelectorAll('.post-card');
                if (remainingPosts.length === 0) {
                    location.reload();
                }
            }, 200);
        } else {
            cardElement.style.opacity = '1';
            cardElement.style.transform = 'scale(1)';
            setTimeout(() => {
                cardElement.style.transition = '';
            }, 200);
            showToast('Ошибка: ' + (data.message || 'Не удалось удалить пост'));
        }
    } catch (err) {
        console.error('Delete error:', err);
        cardElement.style.opacity = '1';
        cardElement.style.transform = 'scale(1)';
        setTimeout(() => {
            cardElement.style.transition = '';
        }, 200);
        showToast('Ошибка соединения');
    }
}

function initDeleteButtons() {
    document.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.removeEventListener('click', btn._deleteHandler);

        const handler = (e) => {
            e.stopPropagation();
            const postId = btn.dataset.postId;
            const card = btn.closest('.post-card');
            if (postId && card) {
                deletePost(postId, card);
            }
        };

        btn.addEventListener('click', handler);
        btn._deleteHandler = handler;
    });
}

// ─── Apply liked state from server ──────────────────
async function loadLikeStates() {
    try {
        const response = await fetch('/api/posts');
        const data = await response.json();
        if (data.status === 'success') {
            const postsData = data.posts;
            document.querySelectorAll('.like-btn').forEach(btn => {
                const postId = parseInt(btn.dataset.postId);
                const postInfo = postsData.find(p => p.id === postId);
                if (postInfo) {
                    if (postInfo.liked) {
                        btn.classList.add('liked');
                    } else {
                        btn.classList.remove('liked');
                    }
                    const countEl = btn.querySelector('.like-count');
                    if (countEl) countEl.textContent = postInfo.likes || 0;
                }
            });
        }
    } catch (err) {
        console.warn('Could not load like states:', err);
    }
}

// ─── Initialization ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initAvatars();
    initLikeButtons();
    initDeleteButtons();
    loadLikeStates();
});