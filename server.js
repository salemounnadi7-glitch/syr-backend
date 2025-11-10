const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Configuration CORS étendue
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger détaillé
app.use((req, res, next) => {
  console.log('=== NOUVELLE REQUÊTE ===');
  console.log('Méthode:', req.method);
  console.log('URL:', req.url);
  console.log('Original URL:', req.originalUrl);
  console.log('Path:', req.path);
  console.log('Body:', req.body);
  console.log('======================');
  next();
});

// Routes de base
app.get('/', (req, res) => {
  res.json({ 
    status: 'success',
    message: '🚀 SYR Backend is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const PORT = process.env.PORT || 10000;

// Socket.io
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Dossier uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// BASE DE DONNÉES - NOUVELLE CONNEXION
const db = new sqlite3.Database(':memory:'); // Base en mémoire pour forcer la réinitialisation

// Initialisation DB COMPLÈTE
db.serialize(() => {
  // Tables
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    service_id TEXT
  )`);
  
  db.run(`CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT,
    from_service TEXT,
    to_service TEXT,
    message_type TEXT,
    content TEXT,
    file_name TEXT,
    file_url TEXT,
    file_type TEXT,
    reply_to INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_by TEXT DEFAULT '[]'
  )`);
  
  // TOUS LES UTILISATEURS - version corrigée
  const stmt = db.prepare("INSERT INTO users (username, password, service_id) VALUES (?, ?, ?)");
  
  stmt.run("nourreddine", "nour01", "directeur");
  stmt.run("faysel", "fay2526", "kwin");
  stmt.run("amine", "amine16", "ingénieur");
  stmt.run("naima", "naima003", "secrétariat");
  stmt.run("belkaceme", "belka002", "comptable");
  stmt.run("salem", "salas", "gestionnaire");
  stmt.run("abdenour", "nouri23", "personnel");
  stmt.run("anwar", "anwar17", "commercial");
  stmt.run("ramzi", "ramzi98", "magasin");
  stmt.run("riyad", "rida54", "démarcheur");
  stmt.run("hamou", "ham0203", "chef_atelier");
  stmt.run("chantier", "chantier0505", "chef_chantier");
  
  stmt.finalize();
  
  console.log('🎉 BASE DE DONNÉES RÉINITIALISÉE AVEC 12 UTILISATEURS');
});

const connectedUsers = new Map();

// 🔐 ROUTE LOGIN AMÉLIORÉE avec validation
app.post('/api/login', (req, res) => {
  console.log('🔐 Tentative de connexion:', req.body);
  
  const { username, password, service } = req.body;

  // VALIDATION - Champs obligatoires
  if (!username || !password || !service) {
    console.log('❌ Champs manquants');
    return res.status(400).json({ 
      success: false,
      error: 'Tous les champs sont obligatoires' 
    });
  }

  // VALIDATION - Champs vides
  if (username.trim() === '' || password.trim() === '' || service.trim() === '') {
    console.log('❌ Champs vides');
    return res.status(400).json({ 
      success: false,
      error: 'Les champs ne peuvent pas être vides' 
    });
  }

  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ? AND service_id = ?',
    [username.trim(), password.trim(), service.trim()],
    (err, user) => {
      if (err) {
        console.error('❌ Erreur DB:', err);
        return res.status(500).json({ 
          success: false,
          error: 'Erreur serveur' 
        });
      }
      
      if (!user) {
        console.log('❌ Identifiants incorrects pour:', username);
        return res.status(401).json({ 
          success: false,
          error: 'Nom d\'utilisateur, mot de passe ou service incorrect' 
        });
      }

      console.log('✅ Connexion réussie:', user.username);
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          service: user.service_id
        }
      });
    }
  );
});

// Routes messages
app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM messages ORDER BY created_at DESC', (err, messages) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    res.json(messages);
  });
});

app.get('/api/messages/public', (req, res) => {
  db.all(`SELECT * FROM messages WHERE message_type = 'public' OR to_service = 'tous' ORDER BY created_at DESC`, (err, messages) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    res.json(messages);
  });
});

app.post('/api/messages', (req, res) => {
  console.log('💬 Nouveau message:', req.body);
  
  try {
    const { fromUser, fromService, toService, messageType, content, replyTo } = req.body;

    if (!fromUser || !fromService || !toService) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    db.run(
      `INSERT INTO messages (from_user, from_service, to_service, message_type, content, reply_to) VALUES (?, ?, ?, ?, ?, ?)`,
      [fromUser, fromService, toService, messageType || 'public', content, replyTo || null],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur sauvegarde' });
        }

        db.get("SELECT * FROM messages WHERE id = ?", [this.lastID], (err, message) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur récupération' });
          }

          if (messageType === 'public' || toService === 'tous') {
            io.emit('new_message', message);
          } else {
            io.emit('new_private_message', message);
          }

          res.json({ success: true, message: message });
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Erreur interne' });
  }
});

// Socket.io
io.on('connection', (socket) => {
  console.log('👤 Utilisateur connecté:', socket.id);

  socket.on('user_connected', (userData) => {
    connectedUsers.set(socket.id, userData);
    io.emit('users_online', Array.from(connectedUsers.values()));
  });

  socket.on('disconnect', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      connectedUsers.delete(socket.id);
      io.emit('users_online', Array.from(connectedUsers.values()));
    }
  });
});

// Démarrage
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Serveur démarré sur le port ${PORT}`);
  console.log(`👥 12 utilisateurs chargés`);
  console.log(`🚀 Prêt à recevoir des connexions!`);
});