const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"] 
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Servir les fichiers statiques
app.use('/uploads', express.static(uploadsDir));

// Base de données SQLite (fichier persistant pour Render)
const db = new sqlite3.Database('messages.db');

// Initialisation de la base
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    service_id TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS messages (
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
  
  // Utilisateurs de test
  const stmt = db.prepare("INSERT OR IGNORE INTO users (username, password, service_id) VALUES (?, ?, ?)");
  stmt.run("admin", "admin123", "directeur");
  stmt.run("john", "john123", "secrétariat");
  stmt.run("marie", "marie123", "comptable");
  stmt.run("pierre", "pierre123", "commercial");
  stmt.finalize();
  
  console.log('✅ Base de données initialisée');
});

const connectedUsers = new Map();

// Routes API de base pour les tests
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 SYR Backend is running!',
    endpoints: {
      root: '/',
      api: '/api',
      messages: '/api/messages',
      public_messages: '/api/messages/public',
      login: '/api/login'
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  res.json({ 
    message: '📡 SYR API is working!',
    version: '1.0.0',
    status: 'active'
  });
});

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes API
app.post('/api/login', (req, res) => {
  const { username, password, service } = req.body;

  console.log('🔐 Tentative de connexion:', { username, service });

  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ? AND service_id = ?',
    [username, password, service],
    (err, user) => {
      if (err) {
        console.error('❌ Erreur DB:', err);
        return res.status(500).json({ error: 'Erreur base de données' });
      }
      
      if (!user) {
        console.log('❌ Identifiants incorrects pour:', username);
        return res.status(401).json({ error: 'Identifiants incorrects' });
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

// Récupérer tous les messages
app.get('/api/messages', (req, res) => {
  console.log('📨 Récupération de tous les messages');
  
  db.all(`
    SELECT * FROM messages 
    ORDER BY created_at DESC
    LIMIT 100
  `, (err, messages) => {
    if (err) {
      console.error('❌ Erreur DB messages:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    
    console.log(`✅ ${messages.length} messages récupérés`);
    res.json(messages);
  });
});

// Récupérer les messages publics
app.get('/api/messages/public', (req, res) => {
  console.log('📢 Récupération messages publics');
  
  db.all(`
    SELECT * FROM messages 
    WHERE message_type = 'public' 
    OR to_service = 'tous'
    ORDER BY created_at DESC
  `, (err, messages) => {
    if (err) {
      console.error('❌ Erreur DB messages publics:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    
    console.log(`✅ ${messages.length} messages publics récupérés`);
    res.json(messages);
  });
});

// Route pour envoyer des messages
app.post('/api/messages', (req, res) => {
  const { fromUser, fromService, toService, messageType, content, replyTo } = req.body;
  
  console.log('📨 Nouveau message reçu:', { 
    fromUser, 
    fromService, 
    toService, 
    messageType, 
    contentLength: content?.length 
  });

  db.run(
    `INSERT INTO messages (from_user, from_service, to_service, message_type, content, reply_to) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [fromUser, fromService, toService, messageType, content, replyTo || null],
    function(err) {
      if (err) {
        console.error('❌ Erreur enregistrement message:', err);
        return res.status(500).json({ error: 'Erreur enregistrement message' });
      }

      const messageId = this.lastID;
      console.log('✅ Message enregistré avec ID:', messageId);

      // Récupérer le message complet
      db.get("SELECT * FROM messages WHERE id = ?", [messageId], (err, message) => {
        if (err) {
          console.error('❌ Erreur récupération message:', err);
          return res.status(500).json({ error: 'Erreur récupération message' });
        }

        // Diffuser le message via Socket.io
        if (messageType === 'public' || toService === 'tous') {
          io.emit('new_message', message);
          console.log('📢 Message diffusé publiquement');
        } else {
          io.emit('new_private_message', message);
          console.log('📨 Message privé diffusé à:', toService);
        }

        res.json(message);
      });
    }
  );
});

// Route pour les messages privés entre deux services
app.get('/api/messages/private/:userService/:targetService', (req, res) => {
  const { userService, targetService } = req.params;
  
  console.log(`📨 Récupération messages privés entre ${userService} et ${targetService}`);
  
  db.all(`
    SELECT * FROM messages 
    WHERE ((from_service = ? AND to_service = ?) 
       OR (from_service = ? AND to_service = ?))
    AND message_type = 'private'
    ORDER BY created_at ASC
  `, [userService, targetService, targetService, userService], (err, messages) => {
    if (err) {
      console.error('❌ Erreur DB messages privés:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    
    console.log(`✅ ${messages.length} messages privés récupérés`);
    res.json(messages);
  });
});

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log('👤 Utilisateur connecté:', socket.id);

  socket.on('user_connected', (userData) => {
    connectedUsers.set(socket.id, userData);
    console.log('✅ Utilisateur en ligne:', userData.username, '- Service:', userData.service);
    
    // Diffuser la liste mise à jour
    io.emit('users_online', Array.from(connectedUsers.values()));
  });

  socket.on('disconnect', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      connectedUsers.delete(socket.id);
      console.log('👋 Utilisateur déconnecté:', userData.username);
      
      // Diffuser la liste mise à jour
      io.emit('users_online', Array.from(connectedUsers.values()));
    }
  });
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('❌ Exception non capturée:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Rejet non géré:', reason);
});

// Démarrage du serveur
server.listen(PORT, () => {
  console.log(`🚀 Serveur backend démarré sur le port ${PORT}`);
  console.log(`📊 Base de données: messages.db`);
  console.log(`📁 Dossier uploads: ${uploadsDir}`);
  console.log(`🔧 Prêt à recevoir des requêtes!`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});