def generate_html(user, host: str) -> str:
    username = user.username
    name = user.name
    avatar = user.avatar.split('/')[-1]
    discord = user.discord
    telegram = user.telegram

    social_rows = []

    if discord:
        social_rows.append(f'<div class="si-row"><span class="si-icon">💬</span><span>{discord}</span></div>')
    if telegram:
        social_rows.append(f'<div class="si-row"><span class="si-icon">✈️</span><span>{telegram}</span></div>')

    social_block = f'<div class="social-info">{''.join(social_rows)}</div>' if social_rows \
        else '<div class="social-info" style="display:none"></div>'


    code = '''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} — Klinb Profile</title>
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
  }
  .avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #30d158;
    margin-bottom: 16px;
  }
  .display-name {
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.3px;
    margin-bottom: 4px;
  }
  .display-username {
    color: rgba(255,255,255,0.45);
    font-size: 14px;
    margin-bottom: 20px;
  }
  .social-info {
    background: rgba(255,255,255,0.04);
    border-radius: 14px;
    padding: 4px 0;
    margin-top: 4px;
  }
  .si-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    color: rgba(255,255,255,0.8);
    font-size: 15px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .si-row:last-child { border-bottom: none; }
  .si-icon { font-size: 18px; }
  .blink-badge {
    display: inline-block;
    margin-top: 22px;
    font-size: 11px;
    color: rgba(255,255,255,0.2);
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>
  <div class="profile-card">
    <img class="avatar" src="${avatar}" alt="${name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 96 96%22><rect width=%2296%22 height=%2296%22 fill=%22%231c1c1e%22/><text x=%2248%22 y=%2260%22 text-anchor=%22middle%22 font-size=%2240%22>👤</text></svg>'">
    <div class="display-name">${name}</div>
    <div class="display-username">@${username}</div>
    ${socialBlock}
    <span class="blink-badge">Klinb</span>
  </div>
  <script>
    (function() {
      function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      async function loadProfile() {
        try {
          const username = '${username}';
          const origin = '${origin}';
          const resp = await fetch(origin + 'api/find_user/' + username);
          const data = await resp.json();
          if (data.status === 'success' && data.user) {
            const u = data.user;
            document.querySelector('.display-name').textContent = u.name || 'Без имени';
            document.querySelector('.display-username').textContent = '@' + (u.username || 'user');
            const avatarImg = document.querySelector('.avatar');
            if (avatarImg && u.avatar) {
              avatarImg.src = origin + '/api/image/' + u.avatar.split("/").slice(-1);
              avatarImg.alt = u.name || 'Аватар';
            }
            const socialBlock = document.querySelector('.social-info');
            if (socialBlock) {
              let html = '';
              if (u.discord) html += '<div class="si-row"><span class="si-icon">💬</span><span>' + escapeHtml(u.discord) + '</span></div>';
              if (u.telegram) html += '<div class="si-row"><span class="si-icon">✈️</span><span>' + escapeHtml(u.telegram) + '</span></div>';
              socialBlock.innerHTML = html;
              socialBlock.style.display = html ? '' : 'none';
            }
          }
        } catch (e) {
          console.warn('Could not load profile:', e);
        }
      }
      loadProfile();
    })();
  </script>
</body>
</html>'''

    code = code.replace('${avatar}', avatar)
    code = code.replace('${username}', username)
    code = code.replace('${name}', name)
    code = code.replace('${origin}', host)
    code = code.replace('${socialBlock}', social_block)

    return code