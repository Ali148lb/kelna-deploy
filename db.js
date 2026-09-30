'use strict';
const { DatabaseSync } = require('node:sqlite'), crypto = require('crypto');
const ROLES = ['user', 'representative', 'assistant', 'co_admin', 'primary_admin'];
const LV = Object.fromEntries(ROLES.map((r, i) => [r, i + 1]));
const PERMS = ['view_dashboard', 'manage_users', 'manage_books', 'manage_questions', 'manage_announcements', 'manage_news', 'manage_reports'];
// Critical permissions: only the Primary Admin ever holds them; they can't be granted.
const CRIT = ['manage_roles', 'manage_permissions', 'manage_system_settings', 'view_logs'];
const T = {
  items: { f: ['kind', 'title', 'subject', 'major', 'year', 'description', 'phone', 'whatsapp', 'price', 'status'], perm: 'manage_books', open: 1, s: ['title', 'subject', 'major', 'description'] },
  questions: { f: ['title', 'body', 'category'], perm: 'manage_questions', open: 1, s: ['title', 'body'] },
  announcements: { f: ['title', 'content', 'category', 'priority'], perm: 'manage_announcements', s: ['title', 'content'] },
  news: { f: ['title', 'content', 'category'], perm: 'manage_news', s: ['title', 'content'] },
};
const ENUM = { kind: ['كتاب', 'كورس'], status: ['مجاني', 'للبيع', 'للاستعارة'], priority: ['عادي', 'مهم', 'مهم جدًا'] };
const norm = s => String(s || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
const hashPw = p => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(p, s, 64).toString('hex'); };
const checkPw = (p, h) => { try { const [s, k] = h.split(':'); return crypto.timingSafeEqual(crypto.scryptSync(p, Buffer.from(s, 'hex'), 64), Buffer.from(k, 'hex')); } catch { return false; } };

const db = new DatabaseSync(process.env.DB_PATH || 'data.db');
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', university TEXT, major TEXT, year TEXT, phone TEXT, bio TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS role_permissions(role TEXT, perm TEXT, PRIMARY KEY(role, perm));
CREATE TABLE IF NOT EXISTS answers(id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE, body TEXT NOT NULL, owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, moderation TEXT DEFAULT 'approved', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, tbl TEXT, target_id INTEGER, reason TEXT, note TEXT, reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE, status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, text TEXT, link TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS activity_logs(id INTEGER PRIMARY KEY, actor_id INTEGER, text TEXT, old_value TEXT, new_value TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
for (const [t, c] of Object.entries(T)) db.exec(`CREATE TABLE IF NOT EXISTS ${t}(id INTEGER PRIMARY KEY, ${c.f.map(x => x + ' TEXT').join(',')}, norm TEXT, moderation TEXT DEFAULT 'approved',
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS ix_${t}_owner ON ${t}(owner_id); CREATE INDEX IF NOT EXISTS ix_${t}_date ON ${t}(created_at);`);
db.exec('CREATE INDEX IF NOT EXISTS ix_ans_q ON answers(question_id); CREATE INDEX IF NOT EXISTS ix_notif_u ON notifications(user_id)');

if (!db.prepare('SELECT 1 FROM role_permissions').get()) {
  const d = { assistant: ['view_dashboard', 'manage_questions', 'manage_reports', 'manage_books'], co_admin: ['manage_users', 'manage_announcements', 'manage_news'] };
  for (const [r, ps] of Object.entries(d)) for (const p of ps) db.prepare('INSERT INTO role_permissions VALUES(?,?)').run(r, p);
}
// Primary Admin is configured ONLY through environment variables.
if (!db.prepare("SELECT 1 FROM users WHERE role='primary_admin'").get()) {
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_PASSWORD is required in production');
    pw = crypto.randomBytes(9).toString('base64url'); console.log('DEV primary admin password (generated):', pw);
  }
  db.prepare("INSERT INTO users(username,email,hash,name,role) VALUES('admin',?,?,'المدير العام','primary_admin')").run((process.env.ADMIN_EMAIL || 'admin@localhost').toLowerCase(), hashPw(pw));
}
module.exports = { db, T, ENUM, ROLES, LV, PERMS, CRIT, norm, hashPw, checkPw };
