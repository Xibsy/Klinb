def generate_html(user, host: str) -> str:
    username = user.username

    code = '''<!DOCTYPE html>
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
        <img id="ext-aaa" class="badge-icon" src="${origin}api/image/%D0%90%D0%90%D0%90%20%D0%A2%D0%95%D0%A0%D0%90%D0%A0%D0%98%D0%A1%D0%A2.svg" style="display:none" title="ААА ТЕРАРИСТ">
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
    return ORIGIN + 'api/image/' + encodeURIComponent(file);
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
      const res  = await fetch(ORIGIN + 'api/find_user/' + encodeURIComponent(USERNAME));
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
</script>
</body>
</html>'''

    code = code.replace('${rawUsername}', username)
    code = code.replace('${origin}', host)

    return code