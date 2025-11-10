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
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('======================');
  next();
});

// Routes de base IMMÉDIATEMENT
app.get('/', (req, res) => {
  console.log('✅ Route / appelée avec succès');
  res.json({ 
    status: 'success',
    message: '🚀 SYR Backend is running!',
    service: 'SYR Messagerie Backend',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /',
      'GET /health',
      'GET /api',
      'GET /api/messages',
      'GET /api/messages/public',
      'POST /api/login',
      'POST /api/messages'
    ]
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (req, res) => {
  console.log('✅ Route /api appelée avec succès');
  res.json({ 
    status: 'success',
    message: '📡 SYR API is operational!',
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 10000;

// Configuration Socket.io APRÈS les routes de base
const io = socketIo(server, {
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"] 
  }
});

// Dossier uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Base de données
const db = new sqlite3.Database('messages.db', (err) => {
  if (err) {
    console.error('Erreur DB:', err);
  } else {
    console.log('✅ Connecté à SQLite');
    // Supprimer les tables existantes pour repartir à zéro
    db.run('DROP TABLE IF EXISTS users');
    db.run('DROP TABLE IF EXISTS messages');
  }
});

// Initialisation DB
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
  
  const stmt = db.prepare("INSERT OR IGNORE INTO users (username, password, service_id) VALUES (?, ?, ?)");
  stmt.run("nourreddine", "nour01", "directeur");
 stmt.run("faysel", "fay2526", "kwin");
 stmt.run("amine", "amine16", "ingénieur");
  stmt.run("naima", "naima003", "secrétariat");
  stmt.run("belkaceme", "belka002", "comptable");
 stmt.run("salem", "salas", "gestionnaire");
 stmt.run("abdenour", "nouri23", "personnel");
  stmt.run("anwar", "anwar17", "commercial");
 stmt.run("ramzi", "ramzi98", "magasin");
 stmt.run("riyad", "rida54", "Démarcheur");
 stmt.run("hamou", "ham0203", "chef attelier");
 stmt.run("chantier", "chantier0505", "chef de chantier");
  stmt.finalize();
  
  console.log('✅ Base de données initialisée');
});

const connectedUsers = new Map();

// Routes API
app.post('/api/login', (req, res) => {
  console.log('🔐 Login attempt:', req.body);
  
  const { username, password, service } = req.body;

  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ? AND service_id = ?',
    [username, password, service],
    (err, user) => {
      if (err) {
        console.error('❌ DB Error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

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

app.get('/api/messages', (req, res) => {
  console.log('📨 Fetching all messages');
  
  db.all('SELECT * FROM messages ORDER BY created_at DESC', (err, messages) => {
    if (err) {
      console.error('❌ DB Error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    console.log(`✅ Returning ${messages.length} messages`);
    res.json(messages);
  });
});

app.get('/api/messages/public', (req, res) => {
  console.log('📢 Fetching public messages');
  
  db.all(`SELECT * FROM messages WHERE message_type = 'public' OR to_service = 'tous' ORDER BY created_at DESC`, (err, messages) => {
    if (err) {
      console.error('❌ DB Error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(messages);
  });
});

// CORRECTION : Route POST pour les messages - version simplifiée
app.post('/api/messages', (req, res) => {
  console.log('💬 New message POST reçu:', req.body);
  
  try {
    const { fromUser, fromService, toService, messageType, content, replyTo } = req.body;

    // Validation des données requises
    if (!fromUser || !fromService || !toService) {
      return res.status(400).json({ 
        error: 'Données manquantes: fromUser, fromService, toService sont requis' 
      });
    }

    console.log('📝 Insertion message dans DB:', { fromUser, fromService, toService, messageType, content });

    db.run(
      `INSERT INTO messages (from_user, from_service, to_service, message_type, content, reply_to) VALUES (?, ?, ?, ?, ?, ?)`,
      [fromUser, fromService, toService, messageType || 'public', content, replyTo || null],
      function(err) {
        if (err) {
          console.error('❌ Erreur insertion DB:', err);
          return res.status(500).json({ error: 'Erreur sauvegarde message: ' + err.message });
        }

        const messageId = this.lastID;
        console.log('✅ Message sauvegardé avec ID:', messageId);

        // Récupérer le message complet
        db.get("SELECT * FROM messages WHERE id = ?", [messageId], (err, message) => {
          if (err) {
            console.error('❌ Erreur récupération message:', err);
            return res.status(500).json({ error: 'Erreur récupération message' });
          }

          console.log('✅ Message récupéré:', message);

          // Diffuser le message via Socket.io
          const finalMessageType = messageType || 'public';
          if (finalMessageType === 'public' || toService === 'tous') {
            io.emit('new_message', message);
            console.log('📢 Message diffusé publiquement');
          } else {
            io.emit('new_private_message', message);
            console.log('📨 Message privé diffusé');
          }

          res.json({
            success: true,
            message: message
          });
        });
      }
    );
  } catch (error) {
    console.error('❌ Erreur générale:', error);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// Route de test pour debug
app.post('/api/messages/test', (req, res) => {
  console.log('🧪 Test endpoint appelé:', req.body);
  res.json({ 
    success: true,
    message: 'Endpoint test fonctionnel!',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

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

// Gestion des erreurs 404
app.use('*', (req, res) => {
  console.log('❌ Route non trouvée:', req.originalUrl);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /',
      'GET /health', 
      'GET /api',
      'GET /api/messages',
      'GET /api/messages/public',
      'POST /api/login',
      'POST /api/messages',
      'POST /api/messages/test'
    ]
  });
});

// Démarrage
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`📊 DB: messages.db`);
  console.log(`🚀 Prêt!`);
});