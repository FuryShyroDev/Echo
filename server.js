const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET = 'votre_cle_secrete';
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

app.use(express.static('public'));

// Initialisation DB
const db = new sqlite3.Database('./echo.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    email TEXT,
    avatar_url TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    owner_id INTEGER,
    invite_code TEXT UNIQUE,
    FOREIGN KEY(owner_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_servers (
    user_id INTEGER,
    server_id INTEGER,
    PRIMARY KEY(user_id, server_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(server_id) REFERENCES servers(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    server_id INTEGER,
    UNIQUE(name, server_id),
    FOREIGN KEY(server_id) REFERENCES servers(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    channel_id INTEGER,
    username TEXT,
    content TEXT,
    image_url TEXT,
    file_url TEXT,
    created_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(channel_id) REFERENCES channels(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS private_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER,
    to_id INTEGER,
    username TEXT,
    content TEXT,
    image_url TEXT,
    file_url TEXT,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS voice_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    server_id INTEGER,
    UNIQUE(name, server_id),
    FOREIGN KEY(server_id) REFERENCES servers(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT DEFAULT 'accepted',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id)
  )`);
  // Default channel
  db.run(`INSERT OR IGNORE INTO channels (id, name) VALUES (1, 'general')`);
  db.run('ALTER TABLE users ADD COLUMN email TEXT', () => {});
});

app.use(express.json());

// Crée le dossier uploads si besoin
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Authentification
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Champs requis.' });
  // Vérifie si l'email existe déjà
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (user) return res.status(400).json({ error: 'Mail adress already used.' });
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hash], function(err) {
      if (err) return res.status(400).json({ error: 'Email or username already used.' });
      const token = jwt.sign({ id: this.lastID, username }, SECRET);
      res.json({ token, username, email });
      io.emit('users-updated');
    });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis.' });
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET);
    res.json({ token, username: user.username, email: user.email });
  });
});

// Middleware d'authentification
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant.' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide.' });
  }
}

// Création d'un serveur
app.post('/api/servers', auth, (req, res) => {
  const { name } = req.body;
  const invite_code = Math.random().toString(36).substring(2, 8);
  db.run('INSERT INTO servers (name, owner_id, invite_code) VALUES (?, ?, ?)', [name, req.user.id, invite_code], function(err) {
    if (err) return res.status(400).json({ error: 'Erreur création serveur.' });
    db.run('INSERT INTO user_servers (user_id, server_id) VALUES (?, ?)', [req.user.id, this.lastID]);
    res.json({ id: this.lastID, name, invite_code });
  });
});

// Join un serveur via code d'invitation
app.post('/api/servers/join', auth, (req, res) => {
  const { invite_code } = req.body;
  db.get('SELECT * FROM servers WHERE invite_code = ?', [invite_code], (err, server) => {
    if (!server) return res.status(404).json({ error: 'Code invalide.' });
    db.run('INSERT OR IGNORE INTO user_servers (user_id, server_id) VALUES (?, ?)', [req.user.id, server.id], (err) => {
      res.json({ id: server.id, name: server.name });
      io.emit('user-joined-server', { serverId: server.id });
      io.emit('users-updated');
    });
  });
});

// Liste des serveurs de l'utilisateur
app.get('/api/servers', auth, (req, res) => {
  db.all('SELECT servers.* FROM servers JOIN user_servers ON servers.id = user_servers.server_id WHERE user_servers.user_id = ?', [req.user.id], (err, rows) => {
    res.json(rows);
  });
});

// Liste des channels d'un serveur
app.get('/api/channels/:serverId', auth, (req, res) => {
  db.all('SELECT * FROM channels WHERE server_id = ?', [req.params.serverId], (err, rows) => {
    res.json(rows);
  });
});

// Ajouter un channel (seulement owner)
app.post('/api/channels', auth, (req, res) => {
  const { name, server_id } = req.body;
  db.get('SELECT * FROM servers WHERE id = ?', [server_id], (err, server) => {
    if (!server || server.owner_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé.' });
    db.run('INSERT INTO channels (name, server_id) VALUES (?, ?)', [name, server_id], function(err) {
      if (err) return res.status(400).json({ error: 'Nom déjà pris.' });
      res.json({ id: this.lastID, name });
      io.emit('channel-updated', { serverId: server_id });
    });
  });
});

// Supprimer un channel (seulement owner)
app.delete('/api/channels/:channelId', auth, (req, res) => {
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.channelId], (err, channel) => {
    if (!channel) return res.status(404).json({ error: 'Channel introuvable.' });
    db.get('SELECT * FROM servers WHERE id = ?', [channel.server_id], (err, server) => {
      if (!server || server.owner_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé.' });
      db.run('DELETE FROM channels WHERE id = ?', [req.params.channelId], (err) => {
        res.json({ success: true });
        io.emit('channel-updated', { serverId: channel.server_id });
      });
    });
  });
});

// Messages d'un channel
app.get('/api/messages/:channelId', auth, (req, res) => {
  db.all('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC', [req.params.channelId], (err, rows) => {
    res.json(rows);
  });
});

// Messages privés
app.get('/api/users', auth, (req, res) => {
  db.all('SELECT id, username, avatar_url FROM users WHERE id != ?', [req.user.id], (err, rows) => {
    res.json(rows);
  });
});
app.get('/api/pm/:userId', auth, (req, res) => {
  const user_id = req.user.id;
  const other_id = req.params.userId;
  db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [user_id, other_id], (err, row1) => {
    db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [other_id, user_id], (err2, row2) => {
      if (!row1 || !row2 || row1.status !== 'accepted' || row2.status !== 'accepted') {
        return res.status(403).json({ error: 'You must be friends to view private messages.' });
      }
      db.all(`SELECT * FROM private_messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at ASC`, [user_id, other_id, other_id, user_id], (err, rows) => {
        if (err) return res.status(400).json({ error: 'Erreur.' });
        res.json(rows);
      });
    });
  });
});
app.post('/api/pm', auth, (req, res) => {
  const { to_id, content, image_url, file_url } = req.body;
  const user_id = req.user.id;
  db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [user_id, to_id], (err, row1) => {
    db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [to_id, user_id], (err2, row2) => {
      if (!row1 || !row2 || row1.status !== 'accepted' || row2.status !== 'accepted') {
        return res.status(403).json({ error: 'You must be friends to send private messages.' });
      }
      const now = new Date().toISOString();
      db.run('INSERT INTO private_messages (from_id, to_id, username, content, image_url, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [user_id, to_id, req.user.username, content || '', image_url || null, file_url || null, now], function(err) {
        if (err) return res.status(400).json({ error: 'Erreur.' });
        const msg = {
          from_id: user_id,
          to_id,
          username: req.user.username,
          content: content || '',
          image_url: image_url || null,
          file_url: file_url || null,
          created_at: now
        };
        // Envoi temps réel au destinataire ET à l'expéditeur
        if (userSockets[to_id]) io.to(userSockets[to_id]).emit('private message', msg);
        if (userSockets[user_id]) io.to(userSockets[user_id]).emit('private message', msg);
        res.json({ success: true });
      });
    });
  });
});

// Gestion WebRTC vocaux
const voiceUsers = {}; // { channelId: { socketId: { username, userId, muted } } }

const userSockets = {};

io.on('connection', (socket) => {
  let currentChannel = null;
  let user = null;
  let currentServer = null;

  socket.on('join', ({ channelId, token, serverId }) => {
    try {
      user = jwt.verify(token, SECRET);
      currentChannel = channelId;
      currentServer = serverId;
      socket.join('channel_' + channelId);
      socket.emit('joined', { channelId });
    } catch {
      socket.emit('error', 'Authentification requise.');
    }
  });

  socket.on('chat message', ({ content, token, channel_id }) => {
    if (!user || !channel_id) return;
    db.run('INSERT INTO messages (user_id, channel_id, username, content, created_at) VALUES (?, ?, ?, ?, ?)', [user.id, channel_id, user.username, content, new Date().toISOString()], function(err) {
      if (!err) {
        io.to('channel_' + channel_id).emit('chat message', {
          username: user.username,
          content,
          created_at: new Date().toISOString(),
          channel_id: channel_id
        });
      }
    });
  });

  socket.on('private message', ({ to_id, content, token, image_url, video_url }) => {
    if (!user) return;
    // Vérification de l'amitié réciproque acceptée
    db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [user.id, to_id], (err, row1) => {
      db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [to_id, user.id], (err2, row2) => {
        if (!row1 || !row2 || row1.status !== 'accepted' || row2.status !== 'accepted') {
          if (userSockets[user.id]) io.to(userSockets[user.id]).emit('private message error', { error: 'Vous devez être amis pour discuter.' });
          return;
        }
        const now = new Date().toISOString();
        db.run('INSERT INTO private_messages (from_id, to_id, username, content, image_url, video_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [user.id, to_id, user.username, content || '', image_url || null, video_url || null, now], function(err) {
          if (!err) {
            const msg = {
              from_id: user.id,
              to_id,
              username: user.username,
              content: content || '',
              image_url: image_url || null,
              video_url: video_url || null,
              created_at: now
            };
            // N'émet QUE vers le destinataire (jamais à l'expéditeur)
            if (userSockets[to_id]) io.to(userSockets[to_id]).emit('private message', msg);
          }
        });
      });
    });
  });

  // --- WebRTC Vocale ---
  socket.on('join-voice', ({ channelId, username, userId }) => {
    if (!voiceUsers[channelId]) voiceUsers[channelId] = {};
    voiceUsers[channelId][socket.id] = { username, userId, muted: false };
    socket.join('voice_' + channelId);
    io.to('voice_' + channelId).emit('voice-users', Object.values(voiceUsers[channelId]).map(u => ({...u, channelId})));
    socket.to('voice_' + channelId).emit('new-voice-peer', { socketId: socket.id, username, userId });
  });

  socket.on('leave-voice', ({ channelId }) => {
    if (voiceUsers[channelId]) {
      delete voiceUsers[channelId][socket.id];
      io.to('voice_' + channelId).emit('voice-users', Object.values(voiceUsers[channelId]).map(u => ({...u, channelId})));
    }
    socket.leave('voice_' + channelId);
  });

  socket.on('webrtc-offer', ({ to, offer, from }) => {
    io.to(to).emit('webrtc-offer', { from, offer });
  });
  socket.on('webrtc-answer', ({ to, answer, from }) => {
    io.to(to).emit('webrtc-answer', { from, answer });
  });
  socket.on('webrtc-ice', ({ to, candidate, from }) => {
    io.to(to).emit('webrtc-ice', { from, candidate });
  });
  socket.on('voice-mute', ({ channelId, muted }) => {
    if (voiceUsers[channelId] && voiceUsers[channelId][socket.id]) {
      voiceUsers[channelId][socket.id].muted = muted;
      io.to('voice_' + channelId).emit('voice-users', Object.values(voiceUsers[channelId]).map(u => ({...u, channelId})));
    }
  });
  socket.on('disconnect', () => {
    for (const channelId in voiceUsers) {
      if (voiceUsers[channelId][socket.id]) {
        delete voiceUsers[channelId][socket.id];
        io.to('voice_' + channelId).emit('voice-users', Object.values(voiceUsers[channelId]).map(u => ({...u, channelId})));
      }
    }
  });

  // À l'authentification, stocke le mapping userId <-> socketId et recharge l'utilisateur
  socket.on('register-user', (userId) => {
    userSockets[userId] = socket.id;
    // Recharge l'utilisateur depuis la base pour ce socket
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (row) {
        user = row;
      }
    });
  });
});

// Liste des salons vocaux d'un serveur
app.get('/api/voice-channels/:serverId', auth, (req, res) => {
  db.all('SELECT * FROM voice_channels WHERE server_id = ?', [req.params.serverId], (err, rows) => {
    res.json(rows);
  });
});

// Création d'un salon vocal (owner seulement)
app.post('/api/voice-channels', auth, (req, res) => {
  const { name, server_id } = req.body;
  db.get('SELECT * FROM servers WHERE id = ?', [server_id], (err, server) => {
    if (!server || server.owner_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé.' });
    db.run('INSERT INTO voice_channels (name, server_id) VALUES (?, ?)', [name, server_id], function(err) {
      if (err) return res.status(400).json({ error: 'Nom déjà pris.' });
      res.json({ id: this.lastID, name });
      io.emit('voice-channel-updated', { serverId: server_id });
    });
  });
});

// Supprimer un salon vocal (seulement owner)
app.delete('/api/voice-channels/:voiceChannelId', auth, (req, res) => {
  db.get('SELECT * FROM voice_channels WHERE id = ?', [req.params.voiceChannelId], (err, vocal) => {
    if (!vocal) return res.status(404).json({ error: 'Vocal introuvable.' });
    db.get('SELECT * FROM servers WHERE id = ?', [vocal.server_id], (err, server) => {
      if (!server || server.owner_id !== req.user.id) return res.status(403).json({ error: 'Non autorisé.' });
      db.run('DELETE FROM voice_channels WHERE id = ?', [req.params.voiceChannelId], (err) => {
        res.json({ success: true });
        io.emit('voice-channel-updated', { serverId: vocal.server_id });
      });
    });
  });
});

// Correction robuste : crée les tables AVANT de démarrer le serveur
async function resetTables() {
  await db.run('DROP TABLE IF EXISTS messages');
  await db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER,
    user_id INTEGER,
    username TEXT,
    content TEXT,
    image_url TEXT,
    file_url TEXT,
    created_at TEXT
  )`);
  await db.run('DROP TABLE IF EXISTS messages_pm');
  await db.run(`CREATE TABLE IF NOT EXISTS messages_pm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER,
    to_id INTEGER,
    username TEXT,
    content TEXT,
    image_url TEXT,
    file_url TEXT,
    created_at TEXT
  )`);
}

resetTables().then(() => {
  const PORT = process.env.PORT || 3000;
  http.listen(PORT, () => {
    console.log('Serveur démarré sur le port', PORT);
  });
});

// Ajoute les colonnes nécessaires à private_messages
async function ensurePrivateMessagesTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS private_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER,
    to_id INTEGER,
    username TEXT,
    content TEXT,
    image_url TEXT,
    file_url TEXT,
    created_at TEXT
  )`);
}
ensurePrivateMessagesTable();

// Upload d'image/fichier en MP (stocke dans private_messages)
app.post('/api/upload-pm', auth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  const fileUrl = '/uploads/' + req.file.filename;
  const isImage = req.file.mimetype.startsWith('image/');
  const to_id = req.body.to_id;
  // Vérifie la réciprocité d'amitié
  db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [req.user.id, to_id], (err, row1) => {
    db.get('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', [to_id, req.user.id], (err2, row2) => {
      if (!row1 || !row2 || row1.status !== 'accepted' || row2.status !== 'accepted') {
        return res.status(403).json({ error: 'You must be friends to send private messages.' });
      }
      const msg = {
        username: req.user.username,
        from_id: req.user.id,
        to_id,
        content: '',
        image_url: isImage ? fileUrl : null,
        file_url: !isImage ? fileUrl : null,
        created_at: new Date().toISOString()
      };
      db.run(
        'INSERT INTO private_messages (from_id, to_id, username, content, image_url, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [msg.from_id, msg.to_id, msg.username, msg.content, msg.image_url, msg.file_url, msg.created_at],
        function(err) {
          if (err) return res.status(400).json({ error: 'Erreur.' });
          // N'émet QUE vers le destinataire ET à l'expéditeur
          if (userSockets[msg.to_id]) {
            io.to(userSockets[msg.to_id]).emit('private message', msg);
          }
          if (userSockets[msg.from_id]) {
            io.to(userSockets[msg.from_id]).emit('private message', msg);
          }
          res.json({ image_url: msg.image_url, file_url: msg.file_url });
        }
      );
    });
  });
});

// Upload d'image/fichier dans un channel textuel
app.post('/api/upload', auth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  const channel_id = req.body.channel_id;
  if (!channel_id) return res.status(400).json({ error: 'Channel manquant' });
  const fileUrl = '/uploads/' + req.file.filename;
  const isImage = req.file.mimetype.startsWith('image/');
  const msg = {
    user_id: req.user.id,
    username: req.user.username,
    channel_id,
    content: '',
    image_url: isImage ? fileUrl : null,
    file_url: !isImage ? fileUrl : null,
    created_at: new Date().toISOString()
  };
  await db.run(
    'INSERT INTO messages (user_id, channel_id, username, content, image_url, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [msg.user_id, msg.channel_id, msg.username, msg.content, msg.image_url, msg.file_url, msg.created_at]
  );
  io.to('channel_' + channel_id).emit('chat message', msg);
  res.json({ image_url: msg.image_url, file_url: msg.file_url });
});

// Liste des membres d'un serveur
app.get('/api/server-users/:serverId', auth, (req, res) => {
  db.all(`SELECT users.id, users.username, users.avatar_url FROM users
          JOIN user_servers ON users.id = user_servers.user_id
          WHERE user_servers.server_id = ?`, [req.params.serverId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur serveur.' });
    res.json(rows);
  });
});

// Quitter un serveur (sauf owner)
app.delete('/api/servers/leave/:serverId', auth, (req, res) => {
  db.get('SELECT * FROM servers WHERE id = ?', [req.params.serverId], (err, server) => {
    if (!server) return res.status(404).json({ error: 'Serveur introuvable.' });
    if (server.owner_id === req.user.id) return res.status(403).json({ error: 'Le propriétaire ne peut pas quitter.' });
    db.run('DELETE FROM user_servers WHERE user_id = ? AND server_id = ?', [req.user.id, req.params.serverId], (err) => {
      if (err) return res.status(500).json({ error: 'Erreur serveur.' });
      res.json({ success: true });
      io.emit('user-left-server', { serverId: req.params.serverId });
      io.emit('users-updated');
    });
  });
});

// === API Amis ===
// Ajouter un ami (demande ou acceptation croisée)
app.post('/api/friends/add', auth, (req, res) => {
  const { friend_id } = req.body;
  const user_id = req.user.id;
  if (user_id === friend_id) return res.status(400).json({ error: "You can't add yourself." });
  // Vérifie si une demande 'pending' existe dans l'autre sens
  db.get('SELECT * FROM friends WHERE user_id = ? AND friend_id = ?', [friend_id, user_id], (err, row) => {
    if (row && row.status === 'pending') {
      // Accepte directement l'amitié dans les deux sens
      db.run('UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ?', [friend_id, user_id], function (err2) {
        db.run('INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)', [user_id, friend_id, 'accepted'], function (err3) {
          // Supprime les doublons 'pending' éventuels
          db.run('DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = "pending"', [user_id, friend_id], function () {
            if (userSockets[friend_id]) io.to(userSockets[friend_id]).emit('friend_accepted', { from_id: user_id, username: req.user.username });
            res.json({ success: true, autoAccepted: true });
          });
        });
      });
    } else if (row && row.status === 'accepted') {
      return res.status(400).json({ error: 'Already friends.' });
    } else {
      // Vérifie si une demande existe déjà dans ce sens
      db.get('SELECT * FROM friends WHERE user_id = ? AND friend_id = ?', [user_id, friend_id], (err, row2) => {
        if (row2) return res.status(400).json({ error: 'Request already sent or already friends.' });
        db.run(
          'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
          [user_id, friend_id, 'pending'],
          function (err) {
            if (err) return res.status(500).json({ error: 'Server error.' });
            if (userSockets[friend_id]) io.to(userSockets[friend_id]).emit('friend_request', { from_id: user_id, username: req.user.username });
            res.json({ success: true });
          }
        );
      });
    }
  });
});
// Lister les demandes reçues
app.get('/api/friends/requests', auth, (req, res) => {
  const user_id = req.user.id;
  db.all(
    `SELECT users.id, users.username FROM users
     JOIN friends ON friends.user_id = users.id
     WHERE friends.friend_id = ? AND friends.status = 'pending'`,
    [user_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error.' });
      res.json(rows);
    }
  );
});
// Accepter une demande d'ami (réciprocité et nettoyage)
app.post('/api/friends/accept', auth, (req, res) => {
  const { friend_id } = req.body;
  const user_id = req.user.id;
  db.run(
    'UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ? AND status = "pending"',
    [friend_id, user_id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Server error.' });
      // Ajoute la réciprocité
      db.run(
        'INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
        [user_id, friend_id, 'accepted'],
        function (err2) {
          // Supprime les doublons 'pending' éventuels
          db.run('DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = "pending"', [user_id, friend_id], function () {
            if (userSockets[friend_id]) io.to(userSockets[friend_id]).emit('friend_accepted', { from_id: user_id, username: req.user.username });
            res.json({ success: true });
          });
        }
      );
    }
  );
});

// Lister les amis acceptés
app.get('/api/friends', auth, (req, res) => {
  const user_id = req.user.id;
  db.all(
    `SELECT users.id, users.username, users.avatar_url
     FROM users
     JOIN friends ON friends.friend_id = users.id
     WHERE friends.user_id = ? AND friends.status = 'accepted'`,
    [user_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error.' });
      res.json(rows);
    }
  );
});

// Migration automatique : ajoute la colonne avatar_url si manquante
const migrateUsersTable = async () => {
  db.get("PRAGMA table_info(users)", (err, info) => {
    db.all("PRAGMA table_info(users)", (err, columns) => {
      if (!columns.some(c => c.name === 'avatar_url')) {
        db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT');
      }
      if (!columns.some(c => c.name === 'email')) {
        db.run('ALTER TABLE users ADD COLUMN email TEXT');
      }
    });
  });
};
migrateUsersTable();

// Upload avatar
app.post('/api/user/avatar', auth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  const avatarUrl = '/uploads/' + req.file.filename;
  db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur serveur.' });
    res.json({ avatar_url: avatarUrl });
    io.emit('users-updated');
  });
});

// Changement pseudo
app.post('/api/user/pseudo', auth, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Pseudo requis.' });
  db.run('UPDATE users SET username = ? WHERE id = ?', [username, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur serveur.' });
    res.json({ success: true });
    io.emit('users-updated');
  });
});

// Changement email
app.post('/api/user/email', auth, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis.' });
  db.run('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'Erreur serveur.' });
    res.json({ success: true });
  });
});

// Changement d'un paramètre utilisateur générique (clé/valeur)
app.post('/api/user/param', auth, (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Clé requise.' });
  // Pour la démo, on stocke dans une table user_params (clé/valeur)
  db.run('CREATE TABLE IF NOT EXISTS user_params (user_id INTEGER, key TEXT, value TEXT)', [], () => {
    db.run('INSERT OR REPLACE INTO user_params (user_id, key, value) VALUES (?, ?, ?)', [req.user.id, key, String(value)], function(err) {
      if (err) return res.status(500).json({ error: 'Erreur serveur.' });
      res.json({ success: true });
    });
  });
});

// === Envoi d'e-mail de confirmation via Gmail ===
// Il faut générer un mot de passe d'application dans Google (https://myaccount.google.com/apppasswords)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // Adresse Gmail
    pass: process.env.GMAIL_PASS  // Mot de passe d'application
  }
});
app.post('/api/send-confirmation', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis.' });
  const mailOptions = {
    from: 'noreply@echo.app',
    to: email,
    subject: 'Confirmation de votre inscription',
    text: 'Bienvenue sur Echo ! Merci de confirmer votre adresse e-mail.'
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erreur envoi mail.' });
    }
    res.json({ success: true });
  });
});

// Supprimer un ami
app.post('/api/friends/remove', auth, (req, res) => {
  const { friend_id } = req.body;
  const user_id = req.user.id;
  db.run(
    'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    [user_id, friend_id, friend_id, user_id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Server error.' });
      if (userSockets[user_id]) io.to(userSockets[user_id]).emit('friend_removed', { friend_id });
      if (userSockets[friend_id]) io.to(userSockets[friend_id]).emit('friend_removed', { friend_id: user_id });
      res.json({ success: true });
    }
  );
});

// Ajoute les colonnes nécessaires à messages (channels)
async function ensureMessagesTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    channel_id INTEGER,
    username TEXT,
    content TEXT,
    image_url TEXT,
    file_url TEXT,
    created_at TEXT
  )`);
}
ensureMessagesTable();
