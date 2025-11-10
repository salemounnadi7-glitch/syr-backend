import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Erreur DB:', err.message);
  else {
    console.log('✅ Connecté à SQLite');
    initDatabase();
  }
});

function initDatabase() {
  // Table utilisateurs
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    service_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Table messages
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT NOT NULL,
    from_service TEXT NOT NULL,
    to_service TEXT NOT NULL,
    message_type TEXT NOT NULL,
    content TEXT,
    file_name TEXT,
    file_url TEXT,
    reply_to INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_by TEXT DEFAULT '[]'
  )`);

  // Table services
  db.run(`CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    is_online BOOLEAN DEFAULT 0
  )`);

  // Services par défaut
  const services = [
    { id: "directeur", name: "Direction", icon: "fa-crown", color: "bg-red-500" },
    { id: "secrétariat", name: "Secrétariat", icon: "fa-clipboard-list", color: "bg-blue-500" },
    { id: "comptable", name: "Comptabilité", icon: "fa-calculator", color: "bg-green-500" },
    { id: "gestionnaire", name: "Gestion", icon: "fa-chart-line", color: "bg-purple-500" },
    { id: "personnel", name: "Personnel", icon: "fa-users", color: "bg-yellow-500" },
    { id: "commercial", name: "Commercial", icon: "fa-bullhorn", color: "bg-indigo-500" },
    { id: "magasin", name: "Magasin", icon: "fa-warehouse", color: "bg-pink-500" },
    { id: "démarcheur", name: "Démarcheur", icon: "fa-walking", color: "bg-teal-500" },
    { id: "chef_atelier", name: "Chef d'Atelier", icon: "fa-tools", color: "bg-orange-500" },
    { id: "chef_chantier", name: "Chef de Chantier", icon: "fa-hard-hat", color: "bg-cyan-500" }
  ];

  services.forEach(service => {
    db.run(`INSERT OR IGNORE INTO services (id, name, icon, color) VALUES (?, ?, ?, ?)`,
      [service.id, service.name, service.icon, service.color]);
  });

  // Utilisateurs demo
  const demoUsers = [
    { username: "admin", password: "admin123", service: "directeur" },
    { username: "john", password: "john123", service: "secrétariat" },
    { username: "marie", password: "marie123", service: "comptable" },
    { username: "pierre", password: "pierre123", service: "commercial" },
    { username: "sophie", password: "sophie123", service: "personnel" }
  ];

  demoUsers.forEach(user => {
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    db.run(`INSERT OR IGNORE INTO users (username, password, service_id) VALUES (?, ?, ?)`,
      [user.username, hashedPassword, user.service]);
  });

  console.log('✅ Base initialisée');
}

export default db;