import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const JWT_SECRET = 'votre_secret_jwt_syr_2024';
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Servir les fichiers statiques
app.use('/uploads', express.static(uploadsDir));

// Base de données SQLite
const db = new sqlite3.Database(':memory:');

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

// Middleware pour gérer les fichiers
app.use((req, res, next) => {
  if (req.method === 'POST' && req.headers['content-type']?.includes('multipart/form-data')) {
    // Pour les formulaires avec fichiers, on utilise un middleware personnalisé
    let body = '';
    const chunks = [];
    
    req.on('data', chunk => {
      chunks.push(chunk);
      body += chunk.toString();
    });
    
    req.on('end', () => {
      // Parse simple du form-data (pour la démo)
      const boundary = req.headers['content-type'].split('boundary=')[1];
      const parts = body.split('--' + boundary);
      
      const fields = {};
      let fileData = null;
      
      parts.forEach(part => {
        if (part.includes('Content-Disposition')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          const filenameMatch = part.match(/filename="([^"]+)"/);
          
          if (nameMatch) {
            const name = nameMatch[1];
            const value = part.split('\r\n\r\n')[1]?.split('\r\n')[0];
            
            if (filenameMatch) {
              // C'est un fichier
              const filename = filenameMatch[1];
              const fileContent = part.split('\r\n\r\n')[1]?.split('\r\n--')[0];
              
              if (fileContent) {
                fileData = {
                  filename: filename,
                  content: fileContent,
                  fieldName: name
                };
              }
            } else if (value) {
              // C'est un champ normal
              fields[name] = value;
            }
          }
        }
      });
      
      req.body = fields;
      req.file = fileData;
      next();
    });
  } else {
    next();
  }
});

// Routes API
app.post('/api/login', (req, res) => {
  const { username, password, service } = req.body;

  db.get(
    'SELECT u.* FROM users u WHERE u.username = ? AND u.password = ?',
    [username, password],
    (err, user) => {
      if (err) {
        console.error('Erreur DB:', err);
        return res.status(500).json({ error: 'Erreur base de données' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Utilisateur non trouvé ou mot de passe incorrect' });
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

app.get('/api/services', (req, res) => {
  db.all('SELECT * FROM services ORDER BY name', (err, services) => {
    if (err) {
      console.error('Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    res.json(services);
  });
});

app.get('/api/messages/public', (req, res) => {
  db.all(`
    SELECT m.* 
    FROM messages m 
    WHERE m.message_type = 'public' 
    ORDER BY m.created_at DESC
  `, (err, messages) => {
    if (err) {
      console.error('Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    res.json(messages);
  });
});

// Route pour envoyer des messages AVEC FICHIERS
app.post('/api/messages', (req, res) => {
  const { fromUser, fromService, toService, messageType, content, replyTo } = req.body;
  
  console.log('📨 Nouveau message reçu:', { fromUser, fromService, toService, messageType, content });

  let file_name = null;
  let file_url = null;
  let file_type = null;

  // Gestion des fichiers (version simplifiée pour la démo)
  if (req.file) {
    const file = req.file;
    file_name = file.filename;
    file_type = file.filename.split('.').pop();
    
    // Pour la démo, on crée une URL factice
    file_url = `/uploads/${Date.now()}_${file.filename}`;
    
    console.log('📎 Fichier joint:', file_name);
  }

  db.run(
    `INSERT INTO messages (from_user, from_service, to_service, message_type, content, file_name, file_url, file_type, reply_to) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fromUser, fromService, toService, messageType, content, file_name, file_url, file_type, replyTo || null],
    function(err) {
      if (err) {
        console.error('❌ Erreur enregistrement message:', err);
        return res.status(500).json({ error: 'Erreur enregistrement message' });
      }

      console.log('✅ Message enregistré avec ID:', this.lastID);

      // Récupérer le message complet
      db.get("SELECT * FROM messages WHERE id = ?", [this.lastID], (err, message) => {
        if (err) {
          console.error('❌ Erreur récupération message:', err);
          return res.status(500).json({ error: 'Erreur récupération message' });
        }

        // Diffuser le message via Socket.io
        if (messageType === 'public') {
          io.emit('new_message', message);
          console.log('📢 Message diffusé publiquement');
        } else {
          io.emit('new_private_message', message);
          console.log('📨 Message privé diffusé');
        }

        res.json(message);
      });
    }
  );
});

// Route pour les messages privés
app.get('/api/messages/private/:userService/:targetService', (req, res) => {
  const { userService, targetService } = req.params;
  
  db.all(`
    SELECT m.* 
    FROM messages m 
    WHERE ((m.from_service = ? AND m.to_service = ?) 
       OR (m.from_service = ? AND m.to_service = ?))
    AND m.message_type = 'private'
    ORDER BY m.created_at
  `, [userService, targetService, targetService, userService], (err, messages) => {
    if (err) {
      console.error('Erreur DB:', err);
      return res.status(500).json({ error: 'Erreur base de données' });
    }
    res.json(messages);
  });
});

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log('👤 Utilisateur connecté:', socket.id);

  socket.on('user_connected', (userData) => {
    connectedUsers.set(socket.id, userData);
    console.log('✅ Utilisateur en ligne:', userData.username);
    
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

  // Écouter les messages en direct
  socket.on('send_message', (messageData) => {
    console.log('💬 Message reçu via socket:', messageData);
    
    // Diffuser le message à tous les clients
    io.emit('new_message', {
      ...messageData,
      id: Date.now(),
      ts: new Date().toISOString()
    });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Serveur backend sur http://localhost:${PORT}`);
  console.log(`📁 Dossier uploads: ${uploadsDir}`);
  console.log(`🔧 Prêt pour les fichiers et messages`);
});