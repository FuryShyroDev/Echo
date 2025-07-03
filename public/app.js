window.addEventListener('DOMContentLoaded', function() {
  const socket = io();
  let token = null;
  let username = null;
  let currentChannel = null;
  let currentServer = null;
  let isOwner = false;
  let currentInviteCode = null;
  let currentPMUser = null;
  let localStream = null;
  let voicePeers = {};
  let currentVoiceChannel = null;
  let isMuted = false;
  const inviteCodeDiv = document.createElement('div');
  inviteCodeDiv.id = 'invite-code-div';
  inviteCodeDiv.style = 'margin: 10px 0; text-align: center;';

  // Auth
  const authContainer = document.getElementById('auth-container');
  const mainContainer = document.getElementById('main-container');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const showRegister = document.getElementById('show-register');
  const showLogin = document.getElementById('show-login');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');
  const userInfo = document.getElementById('user-info');

  // === Popups ===
  const openCreateServerBtn = document.getElementById('open-create-server');
  const openJoinServerBtn = document.getElementById('open-join-server');
  const openCreateVoiceBtn = document.getElementById('open-create-voice');
  const modalCreateServer = document.getElementById('modal-create-server');
  const modalJoinServer = document.getElementById('modal-join-server');
  const modalCreateVoice = document.getElementById('modal-create-voice');
  const modalCreateServerForm = document.getElementById('modal-create-server-form');
  const modalJoinServerForm = document.getElementById('modal-join-server-form');
  const modalCreateVoiceForm = document.getElementById('modal-create-voice-form');
  const modalServerName = document.getElementById('modal-server-name');
  const modalInviteCode = document.getElementById('modal-invite-code');
  const modalVoiceName = document.getElementById('modal-voice-name');

  // New elements
  const serverNameDiv = document.getElementById('server-name');
  const openCreateTextBtn = document.getElementById('open-create-text');
  const openSettingsBtn = document.getElementById('open-settings');
  const modalCreateText = document.getElementById('modal-create-text');
  const modalCreateTextForm = document.getElementById('modal-create-text-form');
  const modalTextName = document.getElementById('modal-text-name');

  // 2. Gestion paramètres utilisateur
  const userSettingsForm = document.getElementById('user-settings-form');
  const audioOutputSelect = document.getElementById('audio-output');
  const audioInputSelect = document.getElementById('audio-input');
  const langSelect = document.getElementById('lang-select');
  const themeSelect = document.getElementById('theme-select');
  const notifToggle = document.getElementById('notif-toggle');
  const userSettingsPseudo = document.getElementById('user-settings-pseudo');
  const userSettingsLogout = document.getElementById('user-settings-logout');
  const userSettingsVersion = document.getElementById('user-settings-version');

  // === Logique édition profil (avatar + pseudo + email + switches + sliders) ===
  function syncProfileView() {
    const pseudo = document.getElementById('user-settings-pseudo-profile')?.value || '';
    document.getElementById('user-settings-pseudo-view').textContent = pseudo;
    // Avatar
    const imgProfile = document.getElementById('user-avatar-img-profile');
    const imgAccount = document.getElementById('user-avatar-img');
    const letterProfile = document.getElementById('user-avatar-letter-profile');
    const letterAccount = document.getElementById('user-avatar-letter');
    // Si une image est présente dans Profil, affiche-la partout
    if (imgProfile && imgProfile.src && imgProfile.style.display !== 'none' && !imgProfile.src.endsWith('default-avatar.png')) {
      imgProfile.style.display = '';
      if (imgAccount) {
        imgAccount.src = imgProfile.src;
        imgAccount.style.display = '';
      }
      if (letterProfile) letterProfile.style.display = 'none';
      if (letterAccount) letterAccount.style.display = 'none';
    } else {
      if (imgProfile) imgProfile.style.display = 'none';
      if (imgAccount) imgAccount.style.display = 'none';
      if (letterProfile) {
        letterProfile.textContent = (pseudo[0] || 'U').toUpperCase();
        letterProfile.style.display = '';
      }
      if (letterAccount) {
        letterAccount.textContent = (pseudo[0] || 'U').toUpperCase();
        letterAccount.style.display = '';
      }
    }
  }

  // Edition pseudo (inline + sauvegarde API)
  const pseudoInput = document.getElementById('user-settings-pseudo-profile');
  if (pseudoInput) {
    pseudoInput.addEventListener('input', () => {
      syncProfileView();
    });
    pseudoInput.addEventListener('change', async () => {
      const newPseudo = pseudoInput.value.trim();
      if (!newPseudo) return;
      try {
        const res = await fetch('/api/user/pseudo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ username: newPseudo })
        });
        const data = await res.json();
        if (data.success) {
          username = newPseudo;
          syncProfileView();
        } else {
          alert(data.error || 'Erreur lors du changement de pseudo.');
        }
      } catch {
        alert('Erreur réseau lors du changement de pseudo.');
      }
    });
  }

  // Edition email (inline + sauvegarde API)
  const emailInput = document.getElementById('user-settings-email');
  if (emailInput) {
    emailInput.addEventListener('change', async () => {
      const newEmail = emailInput.value.trim();
      if (!newEmail) return;
      try {
        const res = await fetch('/api/user/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ email: newEmail })
        });
        const data = await res.json();
        if (!data.success) alert(data.error || 'Erreur lors du changement d\'email.');
      } catch {
        alert('Erreur réseau lors du changement d\'email.');
      }
    });
  }

  // Edition avatar (upload réel + synchro UI)
  const avatarInput = document.getElementById('user-avatar-upload');
  const avatarImgProfile = document.getElementById('user-avatar-img-profile');
  const avatarLetterProfile = document.getElementById('user-avatar-letter-profile');
  const editAvatarBtnProfile = document.querySelector('.edit-avatar-btn[data-section="profile"]');
  if (editAvatarBtnProfile && avatarInput) {
    editAvatarBtnProfile.onclick = () => avatarInput.click();
    avatarInput.onchange = async (e) => {
      const file = avatarInput.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('avatar', file);
      try {
        const res = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData
        });
        const data = await res.json();
        if (data.avatar_url) {
          // Met à jour l'avatar dans Profil
          avatarImgProfile.src = data.avatar_url;
          avatarImgProfile.style.display = '';
          avatarLetterProfile.style.display = 'none';
          // Met à jour l'avatar dans Mon compte
          const avatarImgAccount = document.getElementById('user-avatar-img');
          const avatarLetterAccount = document.getElementById('user-avatar-letter');
          if (avatarImgAccount && avatarLetterAccount) {
            avatarImgAccount.src = data.avatar_url;
            avatarImgAccount.style.display = '';
            avatarLetterAccount.style.display = 'none';
          }
        } else {
          alert(data.error || 'Erreur lors de l\'upload de l\'avatar.');
        }
      } catch {
        alert('Erreur réseau lors de l\'upload de l\'avatar.');
      }
    };
  }

  // Switchs (checkbox) => sauvegarde API
  document.querySelectorAll('.settings-panel input[type="checkbox"]').forEach(el => {
    el.addEventListener('change', async (e) => {
      const id = el.id;
      const checked = el.checked;
      try {
        await fetch('/api/user/param', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ key: id, value: checked })
        });
      } catch {}
    });
  });

  // Sliders (input[type=range]) => sauvegarde API
  document.querySelectorAll('.settings-panel input[type="range"]').forEach(el => {
    el.addEventListener('input', async (e) => {
      const id = el.id;
      const value = el.value;
      try {
        await fetch('/api/user/param', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ key: id, value })
        });
      } catch {}
    });
  });

  // Initial sync au chargement
  syncProfileView();

  // --- Gestion avatar et pseudo dans les paramètres ---
  const userAvatarLabel = document.getElementById('user-avatar-label');
  const userAvatarImg = document.getElementById('user-avatar-img');
  const userAvatarLetter = document.getElementById('user-avatar-letter');
  const userAvatarUpload = document.getElementById('user-avatar-upload');

  // --- Gestion des onglets dans les paramètres ---
  const settingsTabs = document.querySelectorAll('#modal-settings .settings-tab');
  const settingsSections = document.querySelectorAll('#modal-settings .settings-section');
  settingsTabs.forEach(tab => {
    tab.onclick = () => {
      settingsTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      settingsSections.forEach(section => {
        section.classList.remove('active');
      });
      document.getElementById('settings-' + tab.dataset.tab).classList.add('active');
    };
  });

  showRegister.onclick = (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = '';
  };
  showLogin.onclick = (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = '';
  };

  // Après login ou register, une fois le token connu :
  function registerSocketUser() {
    const userId = getUserIdFromToken(token);
    if (userId) {
      socket.emit('register-user', userId);
    }
  }

  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const emailVal = document.getElementById('login-email').value.trim();
    const passwordVal = document.getElementById('login-password').value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal, password: passwordVal })
      });
      const data = await res.json();
      if (res.ok) {
        token = data.token;
        username = data.username;
        showMain();
        if (token) fetchFriends();
        setTimeout(registerSocketUser, 100);
      } else {
        loginError.textContent = data.error;
      }
    } catch {
      loginError.textContent = 'Erreur réseau.';
    }
  };

  registerForm.onsubmit = async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const usernameVal = document.getElementById('register-username').value.trim();
    const emailVal = document.getElementById('register-email').value.trim();
    const passwordVal = document.getElementById('register-password').value;
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameVal, email: emailVal, password: passwordVal })
      });
      const data = await res.json();
      if (res.ok) {
        token = data.token;
        username = data.username;
        showMain();
        if (token) fetchFriends();
        setTimeout(registerSocketUser, 100);
      } else {
        registerError.textContent = data.error;
      }
    } catch {
      registerError.textContent = 'Erreur réseau.';
    }
  };

  function showMain() {
    authContainer.style.display = 'none';
    mainContainer.style.display = '';
    userInfo.textContent = username;
    loadServers();
    loadUsers();
    if (voicePanel) voicePanel.style.display = 'none';
    channelsAside.style.display = 'none';
    chatSection.style.display = 'none';
    mpPage.style.display = 'none';
    socket.emit('register-user', getUserIdFromToken(token));
    fetchFriends().then(() => {
      renderFriendsListMP();
    });
  }

  // Serveurs
  const serverList = document.getElementById('server-list');
  const channelsAside = document.getElementById('channels');
  const channelList = document.getElementById('channel-list');
  const chatSection = document.getElementById('chat-section');
  const currentChannelSpan = document.getElementById('current-channel');
  const noChannelSelected = document.getElementById('no-channel-selected');
  const voiceChannelList = document.getElementById('voice-channel-list');
  const userList = document.getElementById('user-list');
  const pmSection = document.getElementById('pm-section');
  const pmMessages = document.getElementById('pm-messages');
  const pmForm = document.getElementById('pm-form');
  const pmInput = document.getElementById('pm-input');
  const voicePanel = document.getElementById('voice-panel');

  let currentServerUsers = [];

  async function loadServers() {
    const res = await fetch('/api/servers', { headers: { 'Authorization': 'Bearer ' + token } });
    const servers = await res.json();
    serverList.innerHTML = '';
    servers.forEach(server => {
      const li = document.createElement('li');
      li.textContent = server.name[0].toUpperCase();
      li.title = server.name;
      li.dataset.id = server.id;
      if (server.id == currentServer) li.classList.add('active');
      li.onclick = () => selectServer(server.id, server.owner_id, server.name);
      serverList.appendChild(li);
    });
  }

  async function selectServer(serverId, ownerId, serverName) {
    // Masquer la page MP si elle est ouverte
    if (mpPage) mpPage.style.display = 'none';
    if (pmSection) pmSection.style.display = 'none';
    currentServer = serverId;
    isOwner = (ownerId == null || ownerId == undefined) ? false : (parseInt(ownerId) === parseInt(getUserIdFromToken(token)));
    Array.from(serverList.children).forEach(li => li.classList.remove('active'));
    Array.from(serverList.children).forEach(li => {
      if (li.dataset && li.dataset.id == serverId) li.classList.add('active');
    });
    if (serverNameDiv) serverNameDiv.textContent = serverName;
    if (channelsAside) channelsAside.style.display = '';
    if (chatSection) chatSection.style.display = 'none';
    const res = await fetch('/api/servers', { headers: { 'Authorization': 'Bearer ' + token } });
    const servers = await res.json();
    const server = servers.find(s => s.id == serverId);
    if (server && server.invite_code) {
      renderInviteCode(server.invite_code);
      if (channelsAside && !channelsAside.contains(inviteCodeDiv)) channelsAside.insertBefore(inviteCodeDiv, channelsAside.firstChild.nextSibling);
    } else {
      if (inviteCodeDiv && inviteCodeDiv.parentNode) inviteCodeDiv.parentNode.removeChild(inviteCodeDiv);
    }
    loadChannels();
    loadServerUsers();
    renderLeaveServerBtn();
  }

  // --- Affichage du bloc d'invitation moderne ---
  function renderInviteCode(inviteCode) {
    inviteCodeDiv.innerHTML = `
      <div class="invite-title">Invitation code :</div>
      <span class="invite-code" id="invite-code-span">${inviteCode}</span>
      <button class="invite-btn" id="copy-invite">Copy</button>
    `;
    setTimeout(() => {
      const copyBtn = document.getElementById('copy-invite');
      const codeSpan = document.getElementById('invite-code-span');
      if (copyBtn && codeSpan) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(inviteCode);
          codeSpan.classList.add('copied');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            codeSpan.classList.remove('copied');
            copyBtn.textContent = 'Copy';
          }, 1200);
        };
      }
    }, 100);
  }

  // === Chargement dynamique des salons vocaux ===
  async function loadVoiceChannels() {
    if (!currentServer || !voiceChannelList) {
      if (voiceChannelList) voiceChannelList.innerHTML = '';
      return;
    }
    const res = await fetch(`/api/voice-channels/${currentServer}`, { headers: { 'Authorization': 'Bearer ' + token } });
    const vocaux = await res.json();
    voiceChannelList.innerHTML = '';
    vocaux.forEach(vc => {
      const li = document.createElement('div');
      li.className = 'voice-channel';
      li.dataset.id = vc.id;
      // Header : nom, badge, actions
      const name = document.createElement('span');
      name.className = 'voice-name';
      name.innerHTML = `<span class=\"voice-icon\">🔊</span>${vc.name}`;
      // Badge utilisateurs (sera rempli dynamiquement)
      const badge = document.createElement('span');
      badge.className = 'vocal-badge';
      badge.style.display = 'none';
      name.appendChild(badge);
      li.appendChild(name);
      const actions = document.createElement('div');
      actions.className = 'voice-actions';
      const joinBtn = document.createElement('button');
      joinBtn.className = 'join-voice-btn';
      joinBtn.title = 'Join';
      joinBtn.textContent = '▶';
      actions.appendChild(joinBtn);
      if (isOwner) {
        const delBtn = document.createElement('button');
        delBtn.textContent = '✖';
        delBtn.className = 'delete-btn';
        delBtn.title = 'Delete';
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (confirm('Delete this vocal channel ?')) {
            await fetch(`/api/voice-channels/${vc.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + token }
            });
            socket.emit('voice-channel-updated', { serverId: currentServer });
            loadVoiceChannels();
          }
        };
        actions.appendChild(delBtn);
      }
      li.appendChild(actions);
      // Liste des utilisateurs sous le vocal
      const usersDiv = document.createElement('div');
      usersDiv.className = 'voice-users-col';
      usersDiv.dataset.channelId = vc.id;
      usersDiv.innerHTML = '<span style="color:#888;font-size:0.98em;">No user</span>';
      li.appendChild(usersDiv);
      voiceChannelList.appendChild(li);
    });
  }

  // === Chargement dynamique des channels textuels ===
  async function loadChannels() {
    if (!currentServer || !channelsAside) {
      if (channelsAside) channelsAside.style.display = 'none';
      if (chatSection) chatSection.style.display = 'none';
      if (inviteCodeDiv && inviteCodeDiv.parentNode) inviteCodeDiv.parentNode.removeChild(inviteCodeDiv);
      return;
    }
    const res = await fetch('/api/channels/' + currentServer, { headers: { 'Authorization': 'Bearer ' + token } });
    const channels = await res.json();
    if (channelList) channelList.innerHTML = '';
    channels.forEach(channel => {
      const row = document.createElement('div');
      row.className = 'channel-row';
      const name = document.createElement('span');
      name.className = 'channel-name';
      name.textContent = '#' + channel.name;
      row.appendChild(name);
      const actions = document.createElement('div');
      actions.className = 'channel-actions';
      if (isOwner) {
        const delBtn = document.createElement('button');
        delBtn.textContent = '✖';
        delBtn.className = 'delete-btn';
        delBtn.title = 'Delete';
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          await fetch('/api/channels/' + channel.id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          socket.emit('channel-updated', { serverId: currentServer });
          loadChannels();
        };
        actions.appendChild(delBtn);
      }
      row.appendChild(actions);
      row.onclick = () => joinChannel(channel.id, channel.name);
      if (channelList) channelList.appendChild(row);
    });
    if (chatSection) chatSection.style.display = 'none';
    if (noChannelSelected) noChannelSelected.style.display = '';
    loadVoiceChannels();
  }

  function joinChannel(channelId, channelName) {
    currentChannel = channelId;
    currentChannelSpan.textContent = '#' + (channelName || 'général');
    Array.from(channelList.children).forEach(li => li.classList.remove('active'));
    const idx = Array.from(channelList.children).findIndex(li => li.textContent.startsWith('#' + channelName));
    if (channelList.children[idx]) channelList.children[idx].classList.add('active');
    chatSection.style.display = '';
    noChannelSelected.style.display = 'none';
    socket.emit('join', { channelId, token, serverId: currentServer });
    loadMessages();
    clearChannelNotif(channelId);
    clearServerNotif(currentServer);
  }

  // Messages
  const messagesDiv = document.getElementById('messages');
  const form = document.getElementById('form');
  const input = document.getElementById('input');

  async function loadMessages() {
    messagesDiv.innerHTML = '';
    const res = await fetch('/api/messages/' + currentChannel, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const msgs = await res.json();
    msgs.forEach(msg => addMessage(msg));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    if (!input.value) return;
    socket.emit('chat message', { content: input.value, token, channel_id: currentChannel });
    input.value = '';
  };

  socket.on('chat message', (msg) => {
    addMessage(msg);
    if (msg.username !== username && messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  function addMessage(msg) {
    if (!messagesDiv) return;
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    let content = escapeHTML(msg.content).replace(mentionRegex, '<span class="mention">@$1</span>');
    content = linkify(content);
    if (msg.image_url) content += `<br><img src="${msg.image_url}" alt="image" style="max-width:220px;max-height:180px;border-radius:8px;margin-top:6px;" onerror="this.style.display='none';">`;
    if (msg.video_url) content += `<br><video src="${msg.video_url}" controls style="max-width:220px;max-height:180px;border-radius:8px;margin-top:6px;background:#18191c;" onerror="this.style.display='none';"></video>`;
    if (msg.file_url) content += `<br><a href="${msg.file_url}" target="_blank" class="msg-link">Fichier</a>`;
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<span class=\"username\">${msg.username || 'Utilisateur'}</span> <span class=\"date\">${formatDate(msg.created_at)}</span><br>${content}`;
    messagesDiv.appendChild(div);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]));
  }

  // Messages privés
  const privateMessagesAside = document.getElementById('private-messages');
  async function loadUsers() {
    if (!userList) return;
    try {
      const res = await fetch('/api/users', { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) throw new Error('Erreur API utilisateurs');
      const users = await res.json();
      userList.innerHTML = '';
      users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.username;
        li.onclick = () => selectPMUser(user.id, user.username);
        userList.appendChild(li);
      });
      if (users.length === 0) {
        userList.innerHTML = '<li style="color:#888;text-align:center;">No user</li>';
      }
    } catch (e) {
      userList.innerHTML = '<li style="color:#f04747;text-align:center;">Erreur chargement utilisateurs</li>';
    }
  }
  async function selectPMUser(userId, username) {
    currentPMUser = userId;
    if (pmSection) pmSection.style.display = '';
    if (pmMessages) pmMessages.innerHTML = '';
    try {
      const res = await fetch('/api/pm/' + userId, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) throw new Error('Erreur API MP');
      const msgs = await res.json();
      msgs.forEach(msg => addPMMessage(msg, username));
      if (pmMessages) pmMessages.scrollTop = pmMessages.scrollHeight;
      clearPMNotif(userId);
    } catch (e) {
      if (pmMessages) pmMessages.innerHTML = '<div style="color:#f04747;text-align:center;">Erreur chargement MP</div>';
    }
  }
  // DÉCLARATION AVANT UTILISATION
  const channelNotifs = new Set();
  const serverNotifs = new Set();
  const pmNotifs = new Set();
  // Sécurisation de l'accès à pmForm
  if (pmForm) {
    pmForm.onsubmit = (e) => {
      e.preventDefault();
      if (!pmInput.value || !currentPMUser) return;
      socket.emit('private message', { to_id: currentPMUser, content: pmInput.value, token });
      pmInput.value = '';
    };
  }
  socket.on('private message', (msg) => {
    // Notification seulement si le message vient d'un autre utilisateur
    if (msg.from_id !== getUserIdFromToken(token)) {
      let notifText = msg.content && msg.content.trim() ? msg.content : (msg.image_url ? '[Image]' : '[Message]');
      showInAppNotif(`New private message from ${msg.username || 'someone'}: ${notifText}`, 'info');
      showDesktopNotif(msg.username, notifText, msg.from_id);
    }
    if (msg.from_id == currentPMUser || msg.to_id == currentPMUser) {
      addPMMessageMP(msg, msg.username);
      if (pmMessagesMP) pmMessagesMP.scrollTop = pmMessagesMP.scrollHeight;
    }
  });
  function addPMMessage(msg, username) {
    if (!pmMessages) return;
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    let content = escapeHTML(msg.content).replace(mentionRegex, '<span class="mention">@$1</span>');
    content = linkify(content);
    let imageHtml = '';
    if (msg.image_url) imageHtml = `<br><img src="${msg.image_url}" alt="image" onerror="this.style.display='none';" />`;
    let videoHtml = '';
    if (msg.video_url) videoHtml = `<br><video src="${msg.video_url}" controls style="max-width:220px;max-height:180px;border-radius:8px;margin-top:6px;background:#18191c;" onerror="this.style.display='none';"></video>`;
    const avatarLetter = (msg.from_id == getUserIdFromToken(token) ? username : username)[0]?.toUpperCase() || '?';
    const div = document.createElement('div');
    div.className = 'message pm-message';
    div.innerHTML = `
      <span class="avatar">${avatarLetter}</span>
      <div class="pm-content">
        <span><span class="username">${msg.from_id == getUserIdFromToken(token) ? 'Me' : username}</span> <span class="date">${formatDate(msg.created_at)}</span></span>
        <div class="text">${content}${imageHtml}${videoHtml}</div>
      </div>
    `;
    pmMessages.appendChild(div);
    pmMessages.scrollTop = pmMessages.scrollHeight;
  }

  // --- WebRTC Vocaux ---
  function getAvatarLetter(name) {
    return name ? name[0].toUpperCase() : '?';
  }

  // Panel vocal : gestion des boutons
  document.addEventListener('click', e => {
    // Utilise currentTarget pour que le clic sur le SVG fonctionne aussi
    if (e.target.classList.contains('join-voice-btn')) {
      const li = e.target.closest('.voice-channel');
      joinVoice(li.dataset.id, li.querySelector('.voice-name').textContent);
    }
    if (e.target.classList.contains('leave-voice-btn') || (e.target.parentElement && e.target.parentElement.classList.contains('leave-voice-btn'))) {
      let btn = e.target.classList.contains('leave-voice-btn') ? e.target : e.target.parentElement;
      let channelId = currentVoiceChannel;
      if (!channelId) {
        const panel = document.getElementById('voice-panel');
        channelId = panel?.dataset?.channelId || null;
      }
      leaveVoice(channelId);
    }
    if (e.target.classList.contains('mute-btn') || (e.target.parentElement && e.target.parentElement.classList.contains('mute-btn'))) {
      let btn = e.target.classList.contains('mute-btn') ? e.target : e.target.parentElement;
      isMuted = !isMuted;
      if (localStream) localStream.getAudioTracks()[0].enabled = !isMuted;
      socket.emit('voice-mute', { channelId: currentVoiceChannel, muted: isMuted });
      // Icône micro minimaliste SVG
      btn.innerHTML = isMuted
        ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19v2"/><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 15a7 7 0 0 1-14 0"/><line x1="15" y1="9" x2="21" y2="15"/></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19v2"/><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 15a7 7 0 0 1-14 0"/></svg>`;
    }
  });

  // Indicateur de voix (contour bleu sur l'avatar si on parle)
  let audioAnalyser, audioDataArray, audioSource;
  async function setupVoiceIndicator() {
    if (!localStream) return;
    const panel = document.getElementById('voice-panel');
    const avatar = panel?.querySelector('.avatar');
    if (!avatar) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioCtx.createMediaStreamSource(localStream);
    audioAnalyser = audioCtx.createAnalyser();
    audioAnalyser.fftSize = 256;
    audioSource.connect(audioAnalyser);
    audioDataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
    function checkVoice() {
      audioAnalyser.getByteFrequencyData(audioDataArray);
      const volume = audioDataArray.reduce((a, b) => a + b, 0) / audioDataArray.length;
      if (volume > 30 && !isMuted) {
        avatar.style.boxShadow = '0 0 0 3px #3b82f6, 0 0 8px 2px #3b82f6aa';
        avatar.style.border = '2px solid #3b82f6';
      } else {
        avatar.style.boxShadow = '';
        avatar.style.border = '';
      }
      requestAnimationFrame(checkVoice);
    }
    checkVoice();
  }
  // Lance l'indicateur à chaque joinVoice
  async function joinVoice(channelId, channelName) {
    if (currentVoiceChannel) leaveVoice(currentVoiceChannel);
    currentVoiceChannel = channelId;
    // UI
    document.querySelectorAll('.voice-channel').forEach(li => li.classList.remove('active'));
    const li = document.querySelector('.voice-channel[data-id="' + channelId + '"]');
    if (li) li.classList.add('active');
    document.getElementById('voice-panel').style.display = '';
    document.querySelector('#voice-panel .voice-username').textContent = username;
    document.querySelector('#voice-panel .avatar').textContent = getAvatarLetter(username);
    // Micro
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true
      }
    });
    isMuted = false;
    localStream.getAudioTracks()[0].enabled = true;
    // Signalisation
    socket.emit('join-voice', { channelId, username, userId: getUserIdFromToken(token) });
    // Indicateur de voix
    setupVoiceIndicator();
    // Affiche le bon icône micro
    const muteBtn = document.querySelector('#voice-panel .mute-btn');
    if (muteBtn) muteBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
  }
  function leaveVoice(channelId) {
    if (!currentVoiceChannel) return;
    socket.emit('leave-voice', { channelId });
    for (const id in voicePeers) {
      voicePeers[id].pc.close();
      if (voicePeers[id].audio) voicePeers[id].audio.remove();
    }
    voicePeers = {};
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    document.getElementById('voice-panel').style.display = 'none';
    currentVoiceChannel = null;
    renderVoiceUsers([]);
  }
  // Signalisation WebRTC
  socket.on('voice-users', users => {
    renderVoiceUsers(users);
  });
  socket.on('new-voice-peer', ({ socketId }) => {
    if (!voicePeers[socketId]) createVoicePeer(socketId, true);
  });
  socket.on('webrtc-offer', async ({ from, offer }) => {
    if (!voicePeers[from]) createVoicePeer(from, false);
    await voicePeers[from].pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await voicePeers[from].pc.createAnswer();
    await voicePeers[from].pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer, from: socket.id });
  });
  socket.on('webrtc-answer', async ({ from, answer }) => {
    if (voicePeers[from]) await voicePeers[from].pc.setRemoteDescription(new RTCSessionDescription(answer));
  });
  socket.on('webrtc-ice', ({ from, candidate }) => {
    if (voicePeers[from]) voicePeers[from].pc.addIceCandidate(new RTCIceCandidate(candidate));
  });
  function createVoicePeer(socketId, initiator) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = e => {
      if (e.candidate) socket.emit('webrtc-ice', { to: socketId, candidate: e.candidate, from: socket.id });
    };
    pc.ontrack = e => {
      let audio = voicePeers[socketId]?.audio;
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.controls = false;
        document.body.appendChild(audio);
        voicePeers[socketId].audio = audio;
      }
      audio.srcObject = e.streams[0];
    };
    voicePeers[socketId] = { pc };
    if (initiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', { to: socketId, offer, from: socket.id });
      });
    }
  }
  function renderVoiceUsers(users) {
    // Badge et liste sous chaque vocal
    document.querySelectorAll('.voice-channel').forEach(div => {
      const channelId = div.dataset.id;
      const usersDiv = div.querySelector('.voice-users-col');
      const badge = div.querySelector('.vocal-badge');
      if (!usersDiv || !badge) return;
      const usersInChannel = users.filter(u => String(u.channelId) === String(channelId));
      usersDiv.innerHTML = '';
      if (usersInChannel.length === 0) {
        usersDiv.innerHTML = '<span style="color:#888;font-size:0.98em;">No user</span>';
        badge.style.display = 'none';
      } else {
        badge.textContent = usersInChannel.length;
        badge.style.display = '';
        usersInChannel.forEach(u => {
          const row = document.createElement('div');
          row.className = 'voice-user-row';
          const micSVG = u.muted
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/></svg>`;
          row.innerHTML = `<span class=\"avatar\">${getAvatarLetter(u.username)}</span><span>${u.username}</span><span class=\"ping\">${u.ping ? u.ping + ' ms' : ''}</span><span class=\"${u.muted ? 'mic-off' : 'mic-on'}\">${micSVG}</span>`;
          usersDiv.appendChild(row);
        });
      }
    });
    // UI panneau flottant
    if (currentVoiceChannel) {
      const panel = document.getElementById('voice-panel');
      panel.querySelector('.voice-username').textContent = username;
      panel.querySelector('.avatar').textContent = getAvatarLetter(username);
      const micSVG = isMuted
        ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/></svg>`;
      panel.querySelector('.mute-btn').innerHTML = micSVG;
      const myUser = users.find(u => u.username === username && String(u.channelId) === String(currentVoiceChannel));
      panel.querySelector('.voice-ping').textContent = myUser && myUser.ping ? myUser.ping + ' ms' : '';
    }
  }

  // === Gestion des popups (modals) ===
  function openModal(modal) {
    if (modal) modal.style.display = 'flex';
  }
  function closeModalAll() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }
  document.querySelectorAll('.close-modal').forEach(btn => btn.onclick = closeModalAll);
  document.querySelectorAll('.modal').forEach(m => m.onclick = e => { if (e.target === m) closeModalAll(); });

  // === Création serveur ===
  if (modalCreateServerForm) modalCreateServerForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!modalServerName.value) return;
    await fetch('/api/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: modalServerName.value })
    });
    closeModalAll();
    loadServers();
  };
  // === Join serveur ===
  if (modalJoinServerForm) modalJoinServerForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!modalInviteCode.value) return;
    await fetch('/api/servers/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ invite_code: modalInviteCode.value })
    });
    closeModalAll();
    loadServers();
  };
  // === Création vocal ===
  if (modalCreateVoiceForm) modalCreateVoiceForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!modalVoiceName.value) return;
    const isPrivate = document.getElementById('modal-voice-private')?.checked;
    await fetch('/api/voice-channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: modalVoiceName.value, server_id: currentServer, private: !!isPrivate })
    });
    closeModalAll();
    loadVoiceChannels();
  };

  // === Création channel textuel ===
  if (modalCreateTextForm) modalCreateTextForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!modalTextName.value) return;
    const isPrivate = document.getElementById('modal-text-private')?.checked;
    await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: modalTextName.value, server_id: currentServer, private: !!isPrivate })
    });
    modalTextName.value = '';
    closeModalAll();
    loadChannels();
  };

  function getUserIdFromToken(token) {
    try {
      return JSON.parse(atob(token.split('.')[1])).id;
    } catch {
      return null;
    }
  }

  if (openCreateServerBtn) openCreateServerBtn.addEventListener('click', () => openModal(modalCreateServer));
  if (openJoinServerBtn) openJoinServerBtn.addEventListener('click', () => openModal(modalJoinServer));
  if (openCreateVoiceBtn) openCreateVoiceBtn.addEventListener('click', () => openModal(modalCreateVoice));
  if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => {
    try { fillAudioDevices(); } catch(e) {}
    openModal(document.getElementById('modal-settings'));
  });

  // New functions
  function addChannelNotif(channelId) {
    channelNotifs.add(channelId);
    const li = document.querySelector(`#channel-list li[data-id='${channelId}']`);
    if (li && !li.querySelector('.channel-notif')) {
      const dot = document.createElement('span');
      dot.className = 'channel-notif';
      li.appendChild(dot);
    }
  }

  function addServerNotif(serverId) {
    serverNotifs.add(serverId);
    const li = document.querySelector(`#server-list li[data-id='${serverId}']`);
    if (li && !li.querySelector('.server-notif')) {
      const dot = document.createElement('span');
      dot.className = 'server-notif';
      li.appendChild(dot);
    }
  }

  function addPMNotif(userId) {
    pmNotifs.add(userId);
    const li = document.querySelector(`#user-list li[data-id='${userId}']`);
    if (li && !li.querySelector('.channel-notif')) {
      const dot = document.createElement('span');
      dot.className = 'channel-notif';
      li.appendChild(dot);
    }
  }

  function clearChannelNotif(channelId) {
    channelNotifs.delete(channelId);
    const li = document.querySelector(`#channel-list li[data-id='${channelId}']`);
    if (li) {
      const dot = li.querySelector('.channel-notif');
      if (dot) dot.remove();
    }
  }

  function clearServerNotif(serverId) {
    serverNotifs.delete(serverId);
    const li = document.querySelector(`#server-list li[data-id='${serverId}']`);
    if (li) {
      const dot = li.querySelector('.server-notif');
      if (dot) dot.remove();
    }
  }

  function clearPMNotif(userId) {
    pmNotifs.delete(userId);
    const li = document.querySelector(`#user-list li[data-id='${userId}']`);
    if (li) {
      const dot = li.querySelector('.channel-notif');
      if (dot) dot.remove();
    }
  }

  if (openCreateTextBtn) openCreateTextBtn.addEventListener('click', () => openModal(modalCreateText));

  // --- Enregistrement réel des paramètres utilisateur ---
  if (userSettingsForm) {
    userSettingsForm.onsubmit = async (e) => {
      e.preventDefault();
      let changed = false;
      // Pseudo
      const newPseudo = userSettingsPseudo.value.trim();
      if (newPseudo && newPseudo !== username) {
        const res = await fetch('/api/user/pseudo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ username: newPseudo })
        });
        const data = await res.json();
        if (data.success) {
          username = newPseudo;
          userInfo.textContent = username;
          updateUserAvatarDisplay(null, username);
          changed = true;
        }
      }
      // Email
      const emailInput = document.getElementById('user-settings-email');
      if (emailInput && emailInput.value) {
        const res = await fetch('/api/user/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ email: emailInput.value.trim() })
        });
        const data = await res.json();
        if (data.success) changed = true;
      }
      // Avatar
      // (SUPPRIMÉ : gestion userAvatarUpload)
      // ... existing code ...
      // Audio
      if (audioOutputSelect && audioInputSelect) {
        localStorage.setItem('audio_output', audioOutputSelect.value);
        localStorage.setItem('audio_input', audioInputSelect.value);
        changed = true;
      }
      // Langue
      if (langSelect) {
        localStorage.setItem('lang', langSelect.value);
        applyI18n(langSelect.value);
        changed = true;
      }
      // Notifications
      if (notifToggle) {
        localStorage.setItem('notifications', notifToggle.checked ? '1' : '0');
        changed = true;
      }
      if (changed) {
        userSettingsForm.querySelector('button[type="submit"]').textContent = 'Saved!';
        setTimeout(() => {
          userSettingsForm.querySelector('button[type="submit"]').textContent = 'Save';
        }, 1200);
      }
    };
  }

  // --- Zone de saisie MP toujours visible et messages largeur max ---
  if (pmSection && pmMessages && pmForm) {
    pmSection.style.display = '';
    pmSection.style.flexDirection = 'column';
    pmSection.style.height = '100%';
    pmMessages.style.flex = '1';
    pmMessages.style.overflowY = 'auto';
    pmMessages.style.width = '100%';
    pmForm.style.position = 'sticky';
    pmForm.style.bottom = '0';
    pmForm.style.width = '100%';
  }

  // === Gestion de la traduction (anglais/français) ===
  const i18n = {
    fr: {
      'login_title': 'Connexion',
      'login_email': 'Adresse e-mail',
      'login_password': 'Mot de passe',
      'login_btn': 'Se connecter',
      'login_no_account': 'Pas de compte ? <a href="#" id="show-register">Inscription</a>',
      'register_title': 'Inscription',
      'register_email': 'Adresse e-mail',
      'register_username': "Nom d'utilisateur",
      'register_password': 'Mot de passe',
      'register_btn': "S'inscrire",
      'register_already': 'Déjà inscrit ? Connexion',
      'settings_account': 'Mon compte',
      'settings_profile': 'Profil',
      'settings_email': 'Adresse e-mail',
      'settings_username': "Nom d'utilisateur",
      'settings_save': 'Enregistrer',
      'settings_logout': 'Déconnexion',
      'settings_lang': 'Langue',
      'settings_fr': 'Français',
      'settings_en': 'Anglais',
    },
    en: {
      'login_title': 'Login',
      'login_email': 'Email address',
      'login_password': 'Password',
      'login_btn': 'Sign in',
      'login_no_account': 'No account? <a href="#" id="show-register">Register</a>',
      'register_title': 'Register',
      'register_email': 'Email address',
      'register_username': 'Username',
      'register_password': 'Password',
      'register_btn': 'Sign up',
      'register_already': 'Already registered? Login',
      'settings_account': 'My account',
      'settings_profile': 'Profile',
      'settings_email': 'Email address',
      'settings_username': 'Username',
      'settings_save': 'Save',
      'settings_logout': 'Logout',
      'settings_lang': 'Language',
      'settings_fr': 'French',
      'settings_en': 'English',
    }
  };

  function applyI18n(lang) {
    // Textes
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (i18n[lang] && i18n[lang][key]) {
        el.textContent = i18n[lang][key];
      }
    });
    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (i18n[lang] && i18n[lang][key]) {
        el.placeholder = i18n[lang][key];
      }
    });
  }

  // Applique la traduction au chargement et au changement de langue
  if (langSelect) {
    langSelect.onchange = () => {
      applyI18n(langSelect.value);
      localStorage.setItem('lang', langSelect.value);
    };
    // Applique la langue sauvegardée
    const savedLang = localStorage.getItem('lang');
    if (savedLang) {
      langSelect.value = savedLang;
      applyI18n(savedLang);
    } else {
      applyI18n(langSelect.value);
    }
  } else {
    applyI18n('fr');
  }

  // 4. Ecoute les events temps réel
  socket.on('server-updated', () => { loadServers(); loadServerUsers(); });
  socket.on('channel-updated', ({ serverId }) => { if (serverId == currentServer) loadChannels(); });
  socket.on('voice-channel-updated', ({ serverId }) => { if (serverId == currentServer) loadVoiceChannels(); });
  socket.on('user-joined-server', ({ serverId }) => { if (serverId == currentServer) loadServerUsers(); });
  socket.on('user-left-server', ({ serverId }) => { if (serverId == currentServer) loadServerUsers(); });
  socket.on('users-updated', () => { loadUsers(); });

  // 5. Notifications desktop
  function showDesktopNotif(title, body, fromId) {
    if (window.Notification && Notification.permission === 'granted' && fromId !== getUserIdFromToken(token)) {
      new Notification(title, { body });
    }
  }

  // 4. Upload d'image (channels et MP)
  // Sélectionne le bouton image SVG du HTML et le relie à un input file caché
  const imageBtn = form.querySelector('.image-btn');
  let imageInput = form.querySelector('input[type="file"][accept^="image/"]');
  if (!imageInput) {
    imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/*';
    imageInput.style.display = 'none';
    form.appendChild(imageInput);
  }
  imageBtn.onclick = () => imageInput.click();
  imageInput.onchange = async () => {
    if (!imageInput.files[0]) return;
    const formData = new FormData();
    formData.append('image', imageInput.files[0]);
    formData.append('channel_id', currentChannel);
    await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    imageInput.value = '';
  };

  // 5. Liens cliquables dans les messages
  function linkify(text) {
    const urlRegex = /(https?:\/\/[\w\-\.\/?#&=;%+~:@!]+)|(www\.[\w\-\.\/?#&=;%+~:@!]+)/gi;
    return text.replace(urlRegex, url => {
      let href = url;
      if (!href.startsWith('http')) href = 'http://' + href;
      return `<a href="${href}" target="_blank" rel="noopener" class="msg-link">${url}</a>`;
    });
  }

  // --- Amélioration bouton média ---
  // Sélectionne le bouton imageBtn et améliore son style
  imageBtn.style.display = 'flex';
  imageBtn.style.alignItems = 'center';
  imageBtn.style.justifyContent = 'center';
  imageBtn.style.height = '40px';
  imageBtn.style.width = '40px';
  imageBtn.style.fontSize = '1.4em';
  imageBtn.style.boxShadow = '0 2px 8px #5865f244';
  imageBtn.style.border = 'none';
  imageBtn.style.margin = '0 8px';
  imageBtn.style.borderRadius = '50%';
  imageBtn.style.transition = 'background 0.2s, box-shadow 0.2s, transform 0.13s';
  imageBtn.onmouseover = () => { imageBtn.style.background = '#404eed'; };

  // --- Affichage des membres du serveur ---
  async function loadServerUsers() {
    const userList = document.getElementById('server-user-list');
    if (!currentServer || !userList) {
      if (userList) userList.innerHTML = '';
      return;
    }
    const res = await fetch(`/api/server-users/${currentServer}`, { headers: { 'Authorization': 'Bearer ' + token } });
    const users = await res.json();
    currentServerUsers = users;
    // Correction : on utilise la fonction centralisée pour afficher les membres avec les boutons amis
    renderServerUsers(users);
  }

  // Ajout du bouton Quitter le serveur dans l'aside channels
  function renderLeaveServerBtn() {
    const leaveBtnId = 'leave-server-btn';
    let leaveBtn = document.getElementById(leaveBtnId);
    if (!isOwner && !leaveBtn) {
      leaveBtn = document.createElement('button');
      leaveBtn.id = leaveBtnId;
      leaveBtn.textContent = 'Leave server';
      leaveBtn.style = 'margin: 18px auto 8px auto; display: block; background: #f23f43; color: #fff; border: none; border-radius: 8px; padding: 10px 24px; font-weight: bold; font-size: 1.08em; cursor: pointer; box-shadow: 0 2px 8px #f23f4344; transition: background 0.2s;';
      leaveBtn.onmouseover = () => leaveBtn.style.background = '#b91d22';
      leaveBtn.onmouseout = () => leaveBtn.style.background = '#f23f43';
      leaveBtn.onclick = async () => {
        if (confirm('Quitter ce serveur ?')) {
          await fetch(`/api/servers/leave/${currentServer}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          socket.emit('user-left-server', { serverId: currentServer });
          loadServers();
          channelsAside.style.display = 'none';
          chatSection.style.display = 'none';
        }
      };
      channelsAside.appendChild(leaveBtn);
    } else if (isOwner && leaveBtn) {
      leaveBtn.remove();
    }
  }

  // Affiche l'avatar ou la lettre
  function updateUserAvatarDisplay(avatarUrl, username) {
    if (avatarUrl) {
      userAvatarImg.src = avatarUrl;
      userAvatarImg.style.display = '';
      userAvatarLetter.style.display = 'none';
    } else {
      userAvatarImg.style.display = 'none';
      userAvatarLetter.textContent = username ? username[0].toUpperCase() : 'U';
      userAvatarLetter.style.display = '';
    }
  }
  // Ouvre le file input au clic sur l'avatar
  if (userAvatarLabel && userAvatarUpload) {
    userAvatarLabel.onclick = () => userAvatarUpload.click();
  }
  // Upload avatar
  if (userAvatarUpload) {
    userAvatarUpload.onchange = async () => {
      if (!userAvatarUpload.files[0]) return;
      const formData = new FormData();
      formData.append('avatar', userAvatarUpload.files[0]);
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      });
      const data = await res.json();
      if (data.avatar_url) {
        updateUserAvatarDisplay(data.avatar_url, username);
      }
    };
  }
  // Changement pseudo
  if (userSettingsPseudo) {
    userSettingsPseudo.onchange = async () => {
      const newPseudo = userSettingsPseudo.value.trim();
      if (!newPseudo || newPseudo === username) return;
      const res = await fetch('/api/user/pseudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: newPseudo })
      });
      const data = await res.json();
      if (data.success) {
        username = newPseudo;
        userInfo.textContent = username;
        updateUserAvatarDisplay(null, username);
      }
    };
  }

  // Remplir les devices audio
  async function fillAudioDevices() {
    if (!navigator.mediaDevices || !audioInputSelect || !audioOutputSelect) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    audioInputSelect.innerHTML = '';
    audioOutputSelect.innerHTML = '';
    devices.filter(d => d.kind === 'audioinput').forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || 'Microphone';
      audioInputSelect.appendChild(opt);
    });
    devices.filter(d => d.kind === 'audiooutput').forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || 'Haut-parleur';
      audioOutputSelect.appendChild(opt);
    });
  }

  // === Gestion des amis (backend) ===
  let friends = [];

  async function fetchFriends() {
    const res = await fetch('/api/friends', { headers: { 'Authorization': 'Bearer ' + token } });
    friends = await res.json();
    renderFriendsListMP();
  }

  function isFriend(userId) {
    return friends.some(f => f.id === userId);
  }

  async function addFriend(id, username) {
    if (!isFriend(id)) {
      await fetch('/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ friend_id: id })
      });
      await fetchFriends();
      renderServerUsers(currentServerUsers || []);
    }
  }

  async function removeFriend(id) {
    await fetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ friend_id: id })
    });
    await fetchFriends();
    renderServerUsers(currentServerUsers || []);
  }

  function renderServerUsers(users) {
    const list = document.getElementById('server-user-list');
    list.innerHTML = '';
    users.forEach(user => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="avatar">${getAvatarLetter(user.username)}</span> ${user.username}`;
      if (!isFriend(user.id) && user.id !== getUserIdFromToken(token)) {
        const addBtn = document.createElement('button');
        addBtn.className = 'add-friend-btn';
        addBtn.textContent = 'Add friend';
        addBtn.onclick = () => addFriend(user.id, user.username);
        li.appendChild(addBtn);
      } else if (isFriend(user.id)) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'add-friend-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => removeFriend(user.id);
        li.appendChild(removeBtn);
      }
      list.appendChild(li);
    });
  }

  // --- Liste des amis (MP) ---
  function renderFriendsListMP() {
    if (!friendsListMP) return;
    friendsListMP.innerHTML = '';
    if (!friends || friends.length === 0) {
      friendsListMP.innerHTML = '<li style="color:#888;text-align:center;">No friend</li>';
      return;
    }
    friends.forEach(user => {
      const li = document.createElement('li');
      li.className = 'friend-item';
      li.innerHTML = `${renderAvatar(user)} ${user.username}`;
      // Bouton retirer l'ami
      const removeBtn = document.createElement('button');
      removeBtn.className = 'add-friend-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => removeFriend(user.id);
      li.appendChild(removeBtn);
      // Ajout : rendre l'élément cliquable pour ouvrir le MP
      li.style.cursor = 'pointer';
      li.addEventListener('click', (e) => {
        if (e.target === removeBtn) return;
        selectPMUserMP(user.id, user.username);
      });
      friendsListMP.appendChild(li);
    });
  }

  // --- Liste des membres d'un serveur ---
  function renderServerUsers(users) {
    if (!serverUserList) return;
    serverUserList.innerHTML = '';
    users.forEach(u => {
      const row = document.createElement('div');
      row.className = 'server-user-row';
      row.innerHTML = `${renderAvatar(u)} <span>${u.username}</span>`;
      serverUserList.appendChild(row);
    });
  }

  // --- Panel vocal et liste vocale ---
  function renderVoicePanel(user) {
    const panel = document.getElementById('voice-panel');
    if (!panel) return;
    const avatarContainer = panel.querySelector('.avatar');
    if (avatarContainer) {
      avatarContainer.outerHTML = renderAvatar(user);
    }
  }

  // === NOUVELLE NAVIGATION MP/AMIS ===
  const openMPBtn = document.getElementById('open-mp');
  const mpPage = document.getElementById('mp-page');
  const friendsListMP = document.getElementById('friends-list-mp');
  const userListMP = document.getElementById('user-list-mp');
  const pmSectionMP = document.getElementById('pm-section-mp');
  const pmMessagesMP = document.getElementById('pm-messages-mp');
  const pmFormMP = document.getElementById('pm-form-mp');
  const pmInputMP = document.getElementById('pm-input-mp');

  // --- Gestion des messages privés dans la page MP ---
  let currentMPUser = null;
  async function selectPMUserMP(userId, username) {
    currentMPUser = userId;
    if (pmSectionMP) pmSectionMP.style.display = '';
    if (pmMessagesMP) pmMessagesMP.innerHTML = '';
    if (pmFormMP) pmFormMP.style.display = '';
    if (pmInputMP) pmInputMP.disabled = false;
    try {
      const res = await fetch('/api/pm/' + userId, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) throw new Error('Not friends');
      const msgs = await res.json();
      msgs.forEach(msg => addPMMessageMP(msg, username));
      if (pmMessagesMP) pmMessagesMP.scrollTop = pmMessagesMP.scrollHeight;
    } catch (e) {
      if (pmMessagesMP) pmMessagesMP.innerHTML = '<div style="color:#f04747;text-align:center;">You must be friends to chat.</div>';
      if (pmFormMP) pmFormMP.style.display = 'none';
      if (pmInputMP) pmInputMP.disabled = true;
    }
  }
  // Envoi message texte
  if (pmFormMP) {
    pmFormMP.onsubmit = async (e) => {
      e.preventDefault();
      if (!pmInputMP.value || !currentMPUser) return;
      try {
        const res = await fetch('/api/pm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ to_id: currentMPUser, content: pmInputMP.value })
        });
        if (res.ok) {
          pmInputMP.value = '';
        } else {
          const data = await res.json();
          console.error('Erreur envoi MP:', data.error);
          showInAppNotif('Error sending message: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        console.error('Erreur réseau envoi MP:', err);
        showInAppNotif('Network error sending message', 'error');
      }
    };
    // Bouton image (identique channels)
    pmFormMP.querySelectorAll('.image-btn, input[type="file"][accept^="image/"]').forEach(e => e.remove());
    const pmImageBtnMP = document.createElement('button');
    pmImageBtnMP.type = 'button';
    pmImageBtnMP.className = 'image-btn';
    pmImageBtnMP.title = 'Envoyer une image';
    pmImageBtnMP.style.order = '0';
    pmImageBtnMP.style.marginRight = '6px';
    pmImageBtnMP.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="8.5" cy="10" r="2.2"/><path d="M3.5 17l4.5-5a2 2 0 0 1 3 0l3 3.5a2 2 0 0 0 3 0l3-3.5"/></svg>`;
    pmFormMP.insertBefore(pmImageBtnMP, pmFormMP.firstChild);
    const pmImageInputMP = document.createElement('input');
    pmImageInputMP.type = 'file';
    pmImageInputMP.accept = 'image/*';
    pmImageInputMP.style.display = 'none';
    pmFormMP.appendChild(pmImageInputMP);
    pmImageBtnMP.onclick = () => pmImageInputMP.click();
    pmImageInputMP.onchange = async () => {
      if (!pmImageInputMP.files[0] || !currentMPUser) return;
      const formData = new FormData();
      formData.append('image', pmImageInputMP.files[0]);
      formData.append('to_id', currentMPUser);
      await fetch('/api/upload-pm', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      });
      pmImageInputMP.value = '';
    };
    // Corrige le style du formulaire pour aligner les éléments
    pmFormMP.style.display = 'flex';
    pmFormMP.style.alignItems = 'center';
    pmFormMP.style.gap = '8px';
    pmFormMP.style.marginTop = '12px';
    pmFormMP.style.background = 'none';
    pmFormMP.style.border = 'none';
    pmFormMP.style.padding = '0';
  }
  // Réception d'un MP (socket)
  socket.on('private message', (msg) => {
    // Notification seulement si le message vient d'un autre utilisateur
    if (msg.from_id !== getUserIdFromToken(token)) {
      let notifText = msg.content && msg.content.trim() ? msg.content : (msg.image_url ? '[Image]' : '[Message]');
      showInAppNotif(`New private message from ${msg.username || 'someone'}: ${notifText}`, 'info');
      showDesktopNotif(msg.username, notifText, msg.from_id);
    }
    if (msg.from_id == currentMPUser || msg.to_id == currentMPUser) {
      addPMMessageMP(msg, msg.username);
      if (pmMessagesMP) pmMessagesMP.scrollTop = pmMessagesMP.scrollHeight;
    }
  });
  // Fermeture discussion si ami supprimé
  socket.on('friend_removed', (data) => {
    if (currentMPUser && (data.friend_id == currentMPUser || data.friend_id == getUserIdFromToken(token))) {
      currentMPUser = null;
      if (pmMessagesMP) pmMessagesMP.innerHTML = '<div style="color:#f04747;text-align:center;">You are no longer friends.</div>';
      if (pmFormMP) pmFormMP.style.display = 'none';
      if (pmInputMP) pmInputMP.disabled = true;
    }
  });
  // Ajoute la fonction addPMMessageMP (affichage message MP)
  function addPMMessageMP(msg, username) {
    if (!pmMessagesMP) return;
    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    let content = escapeHTML(msg.content).replace(mentionRegex, '<span class="mention">@$1</span>');
    content = linkify(content);
    let imageHtml = '';
    if (msg.image_url) imageHtml = `<br><img src="${msg.image_url}" alt="image" onerror="this.style.display='none';" />`;
    let videoHtml = '';
    if (msg.video_url) videoHtml = `<br><video src="${msg.video_url}" controls style="max-width:220px;max-height:180px;border-radius:8px;margin-top:6px;background:#18191c;" onerror="this.style.display='none';"></video>`;
    const avatarLetter = (msg.from_id == getUserIdFromToken(token) ? username : username)[0]?.toUpperCase() || '?';
    const div = document.createElement('div');
    div.className = 'message pm-message';
    div.innerHTML = `
      <span class="avatar">${avatarLetter}</span>
      <div class="pm-content">
        <span><span class="username">${msg.from_id == getUserIdFromToken(token) ? 'Me' : username}</span> <span class="date">${formatDate(msg.created_at)}</span></span>
        <div class="text">${content}${imageHtml}${videoHtml}</div>
      </div>
    `;
    pmMessagesMP.appendChild(div);
    pmMessagesMP.scrollTop = pmMessagesMP.scrollHeight;
  }
  // Nettoyage : supprime toute ancienne logique MP redondante ou bugguée (laisser uniquement ce bloc pour la gestion MP).

  if (openMPBtn && mpPage) {
    openMPBtn.addEventListener('click', async () => {
      if (channelsAside) channelsAside.style.display = 'none';
      if (chatSection) chatSection.style.display = 'none';
      if (voicePanel) voicePanel.style.display = 'none';
      mpPage.style.display = '';
      await fetchFriends();
      renderFriendsListMP();
    });
  }

  socket.on('private message error', (data) => {
    // Affiche une notification d'erreur dans la zone de MP principale
    if (pmMessagesMP) {
      const div = document.createElement('div');
      div.style.color = '#f04747';
      div.style.textAlign = 'center';
      div.style.margin = '12px 0';
      div.textContent = data.error || "Erreur : impossible d'envoyer le message.";
      pmMessagesMP.appendChild(div);
      pmMessagesMP.scrollTop = pmMessagesMP.scrollHeight;
    }
    // Bloc MP classique (hors page MP/Amis)
    if (pmMessages) {
      const div = document.createElement('div');
      div.style.color = '#f04747';
      div.style.textAlign = 'center';
      div.style.margin = '12px 0';
      div.textContent = data.error || "Erreur : impossible d'envoyer le message.";
      pmMessages.appendChild(div);
      pmMessages.scrollTop = pmMessages.scrollHeight;
    }
  });

  // Pour MP (zone privée)
  const pmImageBtn = pmForm.querySelector('.image-btn');
  let pmImageInput = pmForm.querySelector('input[type="file"][accept^="image/"]');
  if (!pmImageInput) {
    pmImageInput = document.createElement('input');
    pmImageInput.type = 'file';
    pmImageInput.accept = 'image/*';
    pmImageInput.style.display = 'none';
    pmForm.appendChild(pmImageInput);
  }
  pmImageBtn.onclick = () => pmImageInput.click();
  pmImageInput.onchange = async () => {
    if (!pmImageInput.files[0] || !currentPMUser) return;
    const formData = new FormData();
    formData.append('image', pmImageInput.files[0]);
    formData.append('to_id', currentPMUser);
    await fetch('/api/upload-pm', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    pmImageInput.value = '';
  };

  // === Paramètres utilisateur Discord/Style ===
  function setupSettingsPanel() {
    // Navigation sidebar
    document.querySelectorAll('.settings-sidebar-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.settings-sidebar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelectorAll('.settings-section').forEach(sec => sec.classList.remove('active'));
        if (tab) {
          document.getElementById('settings-' + tab).classList.add('active');
        }
        if (btn.classList.contains('logout-btn')) {
          // Déconnexion
          localStorage.clear();
          location.reload();
        }
      };
    });
    // Edition des champs
    document.querySelectorAll('.edit-field-btn').forEach(btn => {
      btn.onclick = () => {
        const field = btn.dataset.field;
        const input = document.getElementById('user-settings-' + field);
        if (!input) return;
        input.disabled = false;
        input.focus();
        input.select && input.select();
        btn.style.display = 'none';
        // Sauvegarde au blur ou entrée
        const save = () => {
          input.disabled = true;
          btn.style.display = '';
          // Appelle la logique de sauvegarde existante (submit form)
          if (userSettingsForm) userSettingsForm.dispatchEvent(new Event('submit'));
          input.removeEventListener('blur', save);
          input.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', onKey);
      };
    });
    // Reveal email/mot de passe
    document.querySelectorAll('.reveal-btn').forEach(btn => {
      btn.onclick = () => {
        const field = btn.dataset.field;
        const input = document.getElementById('user-settings-' + field);
        if (!input) return;
        if (input.type === 'password' || input.type === 'email') {
          input.type = 'text';
          btn.textContent = '🙈';
        } else {
          input.type = field === 'email' ? 'email' : 'password';
          btn.textContent = '👁️';
        }
      };
    });
    // Modifier avatar
    // (SUPPRIMÉ : gestion editAvatarBtn et userAvatarUpload)
    // ... existing code ...
  }
  // Lance le setup au chargement
  setupSettingsPanel();

  // === Fermeture et ouverture du modal paramètres (croix + bouton) ===
  const modalSettings = document.getElementById('modal-settings');
  const closeSettingsBtn = document.querySelector('.close-settings-btn');
  if (closeSettingsBtn && modalSettings) {
    closeSettingsBtn.onclick = () => { modalSettings.style.display = 'none'; };
    closeSettingsBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { modalSettings.style.display = 'none'; } };
  }
  if (openSettingsBtn && modalSettings) {
    openSettingsBtn.onclick = () => {
      modalSettings.style.display = 'flex';
      setTimeout(() => { // focus croix pour accessibilité
        closeSettingsBtn && closeSettingsBtn.focus();
      }, 50);
    };
  }
  document.addEventListener('keydown', (e) => {
    if (modalSettings && modalSettings.style.display !== 'none' && (e.key === 'Escape' || e.key === 'Esc')) {
      modalSettings.style.display = 'none';
      openSettingsBtn && openSettingsBtn.focus();
    }
  });

  // Notifications in-app
  function showInAppNotif(message, type = 'info') {
    let notif = document.createElement('div');
    notif.className = 'inapp-notif ' + type;
    notif.textContent = message;
    notif.style.position = 'fixed';
    notif.style.bottom = '32px';
    notif.style.right = '32px';
    notif.style.background = type === 'error' ? '#f23f43' : (type === 'success' ? '#43f26c' : '#36393f');
    notif.style.color = '#fff';
    notif.style.padding = '16px 28px';
    notif.style.borderRadius = '10px';
    notif.style.fontSize = '1.08em';
    notif.style.boxShadow = '0 4px 24px #000a';
    notif.style.zIndex = 9999;
    notif.style.opacity = '0.98';
    notif.style.transition = 'opacity 0.3s';
    document.body.appendChild(notif);
    setTimeout(() => { notif.style.opacity = '0'; setTimeout(() => notif.remove(), 400); }, 3500);
  }
  // Gestion des demandes d'amis reçues
  async function loadFriendRequests() {
    try {
      const res = await fetch('/api/friends/requests', { headers: { 'Authorization': 'Bearer ' + token } });
      const text = await res.text();
      try {
        const requests = JSON.parse(text);
        const requestsList = document.getElementById('friend-requests-list');
        if (!requestsList) return;
        requestsList.innerHTML = '';
        if (requests.length === 0) {
          requestsList.innerHTML = '<li style="color:#888;text-align:center;">No friend requests</li>';
          return;
        }
        requests.forEach(user => {
          const li = document.createElement('li');
          li.textContent = user.username;
          const acceptBtn = document.createElement('button');
          acceptBtn.textContent = 'Accept';
          acceptBtn.className = 'add-friend-btn';
          acceptBtn.onclick = async () => {
            await fetch('/api/friends/accept', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({ friend_id: user.id })
            });
            showInAppNotif('Friend request accepted!', 'success');
            await fetchFriends();
            loadFriendRequests();
          };
          li.appendChild(acceptBtn);
          requestsList.appendChild(li);
        });
      } catch (e) {
        console.error('DEBUG /api/friends/requests response:', text);
        throw e;
      }
    } catch (e) {
      const requestsList = document.getElementById('friend-requests-list');
      if (requestsList) requestsList.innerHTML = '<li style="color:#f04747;text-align:center;">Error loading friend requests</li>';
    }
  }
  // Badge notification sur l'icône MP/Amis
  function setMPBadge(show) {
    const mpBtn = document.getElementById('open-mp');
    if (!mpBtn) return;
    let badge = mpBtn.querySelector('.notif-badge');
    if (show) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notif-badge';
        badge.style.position = 'absolute';
        badge.style.top = '6px';
        badge.style.right = '6px';
        badge.style.background = '#f23f43';
        badge.style.color = '#fff';
        badge.style.borderRadius = '50%';
        badge.style.width = '16px';
        badge.style.height = '16px';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.justifyContent = 'center';
        badge.style.fontSize = '0.85em';
        badge.textContent = '!';
        mpBtn.style.position = 'relative';
        mpBtn.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }
  // Sockets pour notifications
  socket.on('friend_request', ({ from_id, username }) => {
    showInAppNotif(`Friend request from ${username}`);
    setMPBadge(true);
    loadFriendRequests();
  });
  socket.on('friend_accepted', ({ from_id, username }) => {
    showInAppNotif(`${username} accepted your friend request!`, 'success');
    setMPBadge(true);
    fetchFriends();
  });
  // Quand l'utilisateur ouvre la page MP, retire le badge
  if (openMPBtn && mpPage) {
    openMPBtn.addEventListener('click', () => {
      setMPBadge(false);
    });
  }

  // === Ajout bouton image pour MP/Amis ===
  if (pmFormMP) {
    // Supprime tout bouton image ou input file existant
    pmFormMP.querySelectorAll('.image-btn, input[type="file"][accept^="image/"]').forEach(e => e.remove());
    // Ajoute le bouton image en premier (même HTML que channels)
    const pmImageBtnMP = document.createElement('button');
    pmImageBtnMP.type = 'button';
    pmImageBtnMP.className = 'image-btn';
    pmImageBtnMP.title = 'Envoyer une image';
    pmImageBtnMP.style.order = '0';
    pmImageBtnMP.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="8.5" cy="10" r="2.2"/><path d="M3.5 17l4.5-5a2 2 0 0 1 3 0l3 3.5a2 2 0 0 0 3 0l3-3.5"/></svg>`;
    pmFormMP.insertBefore(pmImageBtnMP, pmFormMP.firstChild);
    // Ajoute l'input file caché
    const pmImageInputMP = document.createElement('input');
    pmImageInputMP.type = 'file';
    pmImageInputMP.accept = 'image/*';
    pmImageInputMP.style.display = 'none';
    pmFormMP.appendChild(pmImageInputMP);
    pmImageBtnMP.onclick = () => pmImageInputMP.click();
    pmImageInputMP.onchange = async () => {
      if (!pmImageInputMP.files[0] || !currentMPUser) return;
      const formData = new FormData();
      formData.append('image', pmImageInputMP.files[0]);
      formData.append('to_id', currentMPUser);
      await fetch('/api/upload-pm', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      });
      pmImageInputMP.value = '';
    };
  }

  // Toujours enregistrer l'utilisateur sur le socket à chaque reconnexion
  socket.on('connect', () => {
    registerSocketUser();
  });

  // Si un token est déjà présent au chargement (auto-login), enregistrer l'utilisateur sur le socket après un court délai
  if (token) {
    setTimeout(registerSocketUser, 100);
  }

  // Fonction utilitaire pour afficher l'avatar (image ou lettre)
  function renderAvatar(user) {
    if (user.avatar_url) {
      return `<img class="avatar" src="${user.avatar_url}" alt="avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;">`;
    } else {
      return `<span class="avatar">${user.username ? user.username[0].toUpperCase() : '?'}</span>`;
    }
  }

  // Remplace dans toutes les listes et panels :
  // - Liste amis
  // - Liste membres
  // - Panel vocal
  // - Liste vocale
  // - Messages (si possible)
  // Exemples :
  // ...
  // Dans renderFriendsListMP :
  // li.innerHTML = `${renderAvatar(user)} ${user.username}`;
  // ...
  // Dans renderServerUsers :
  // row.innerHTML = `${renderAvatar(u)}<span>${u.username}</span><span class="ping">${u.ping ? u.ping + ' ms' : ''}</span><span class="${u.muted ? 'mic-off' : 'mic-on'}">${micSVG}</span>`;
  // ...
  // Dans panel vocal :
  // panel.querySelector('.avatar').outerHTML = renderAvatar({username, avatar_url: userAvatarUrl});
  // ...
  // (Répète ce schéma pour chaque affichage d'utilisateur)

  // Déclaration globale pour la liste des membres du serveur
  let serverUserList = null;
  document.addEventListener('DOMContentLoaded', () => {
    serverUserList = document.getElementById('server-user-list');
  });
});