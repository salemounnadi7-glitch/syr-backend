// Base de données
const db = new sqlite3.Database('messages.db', (err) => {
  if (err) {
    console.error('❌ Erreur DB:', err);
  } else {
    console.log('✅ Connecté à SQLite');
  }
});

// Réinitialisation complète
db.serialize(() => {
  // Supprimer les anciennes tables
  db.run('DROP TABLE IF EXISTS users');
  db.run('DROP TABLE IF EXISTS messages');
  
  // Créer les nouvelles tables
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
  
  // Insérer TOUS les utilisateurs
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
  
  console.log('✅ Base de données réinitialisée avec tous les utilisateurs');
});