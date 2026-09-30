'use strict';
if (require('fs').existsSync('.env')) for (const l of require('fs').readFileSync('.env', 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; }
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { db, T, ENUM, ROLES, LV, PERMS, CRIT, norm, hashPw, checkPw } = require('./db');
const PROD = process.env.NODE_ENV === 'production', PORT = +process.env.PORT || 3000, ALL = [...PERMS, ...CRIT];
class E extends Error { constructor(c, m) { super(m); this.c = c; } }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const str = (v, n = 5000) => String(v ?? '').trim().slice(0, n);

// ---- auth / RBAC (all checks happen here, never in the browser) ----
function sessionToken(req) { const m = /(?:^|; )sid=([a-f0-9]{64})/.exec(req.headers.cookie || ''); return m && m[1]; }
function getUser(req) {
  const t = sessionToken(req); if (!t) return null;
  const u = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(sha(t), Date.now());
  return u && u.status === 'active' ? u : null;
}
// Hierarchy: a role inherits every permission granted to the roles below it.
function has(u, p) {
  if (!u) return false; if (u.role === 'primary_admin') return true; if (CRIT.includes(p)) return false;
  const rs = ROLES.slice(0, LV[u.role]);
  return !!db.prepare(`SELECT 1 FROM role_permissions WHERE perm=? AND role IN (${rs.map(() => '?').join()})`).get(p, ...rs);
}
const pub = u => ({ id: u.id, name: u.name, username: u.username, role: u.role, university: u.university, major: u.major, year: u.year, phone: u.phone, bio: u.bio, perms: ALL.filter(p => has(u, p)) });
const hits = new Map();
function limit(req, max = 10) { const k = (process.env.TRUST_PROXY && req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, n = Date.now(), h = hits.get(k); if (!h || h[1] < n) return void hits.set(k, [1, n + 9e5]); if (++h[0] > max) throw new E(429, 'محاولات كثيرة، حاول لاحقًا'); }
function log(u, text, old, nw) { db.prepare('INSERT INTO activity_logs(actor_id,text,old_value,new_value) VALUES(?,?,?,?)').run(u.id, `${u.name} قام بـ${text}`, old == null ? null : JSON.stringify(old), nw == null ? null : JSON.stringify(nw)); }
const notify = (uid, text, link) => db.prepare('INSERT INTO notifications(user_id,text,link) VALUES(?,?,?)').run(uid, text, link);
function start(res, u, remember) {
  const t = crypto.randomBytes(32).toString('hex'), age = remember ? 30 * 864e5 : 864e5;
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(t), u.id, Date.now() + age);
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Strict; Path=/${PROD ? '; Secure' : ''}${remember ? '; Max-Age=' + age / 1000 : ''}`);
  return { user: pub(u) };
}
function clean(t, d, partial) {
  const o = {};
  for (const f of T[t].f) { if (partial && d[f] === undefined) continue; o[f] = str(d[f], f === 'title' ? 200 : 5000); if (ENUM[f] && o[f] && !ENUM[f].includes(o[f])) throw new E(400, 'قيمة غير صالحة'); }
  if (!partial && !o.title) throw new E(400, 'العنوان مطلوب');
  return o;
}
const nrm = (t, r) => norm(T[t].s.map(f => r[f]).join(' '));
const row = (t, id) => db.prepare(`SELECT x.*,u.name AS owner_name FROM ${t} x LEFT JOIN users u ON u.id=x.owner_id WHERE x.id=?`).get(id);

async function route(req, res, m, s, q) {
  const u = getUser(req), [a, b, c] = s;
  const need = p => { if (!u) throw new E(401, 'يرجى تسجيل الدخول'); if (p && !has(u, p)) throw new E(403, 'ليست لديك صلاحية لهذا الإجراء'); };
  const d = m === 'GET' ? {} : await body(req);

  if (a === 'auth' && m === 'POST') {
    limit(req);
    if (b === 'register') {
      const name = str(d.name, 60), un = str(d.username, 20), em = str(d.email, 120).toLowerCase(), pw = String(d.password || '');
      if (!name || !/^\w{3,20}$/.test(un) || !/^\S+@\S+\.\S+$/.test(em) || pw.length < 8) throw new E(400, 'تحقق من البيانات: كلمة المرور 8 أحرف على الأقل واسم المستخدم بالإنكليزية');
      if (db.prepare('SELECT 1 FROM users WHERE email=? OR username=?').get(em, un)) throw new E(409, 'البريد أو اسم المستخدم مستخدم مسبقًا');
      const id = db.prepare('INSERT INTO users(username,email,hash,name,university,major,year) VALUES(?,?,?,?,?,?,?)').run(un, em, hashPw(pw), name, str(d.university, 100), str(d.major, 100), str(d.year, 30)).lastInsertRowid;
      return start(res, db.prepare('SELECT * FROM users WHERE id=?').get(id), d.remember);
    }
    if (b === 'login') {
      const r = db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(str(d.id).toLowerCase(), str(d.id));
      if (!r || !checkPw(String(d.password || ''), r.hash)) throw new E(401, 'بيانات الدخول غير صحيحة');
      if (r.status !== 'active') throw new E(403, 'هذا الحساب موقوف');
      if (d.admin && LV[r.role] < 3) throw new E(403, 'هذا الحساب لا يملك صلاحيات إدارية');
      return start(res, r, d.remember);
    }
    if (b === 'logout') { const t = sessionToken(req); if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(sha(t)); res.setHeader('Set-Cookie', 'sid=; Max-Age=0; Path=/'); return { ok: 1 }; }
  }
  if (a === 'me') {
    if (m === 'GET') return { user: u ? pub(u) : null };
    need(); const f = ['name', 'university', 'major', 'year', 'phone', 'bio'], v = Object.fromEntries(f.map(k => [k, str(d[k] ?? u[k], k === 'bio' ? 500 : 100)]));
    if (!v.name) throw new E(400, 'الاسم مطلوب');
    db.prepare(`UPDATE users SET ${f.map(k => k + '=?').join()} WHERE id=?`).run(...f.map(k => v[k]), u.id);
    return { user: pub(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)) };
  }
  if (a === 'reps') { // only representative+ roles are listed; phone is exposed only for them
    const like = `%${norm(q.q || '').replace(/[%_\\]/g, '')}%`;
    return { items: db.prepare("SELECT id,name,university,major,year,phone,bio FROM users WHERE LV_OK AND status='active'".replace('LV_OK', "role IN ('representative','assistant','co_admin')") + " AND (lower(name||' '||ifnull(major,'')||' '||ifnull(year,'')) LIKE ?) LIMIT 50").all(like) };
  }
  if (a === 'search') {
    const like = `%${norm(q.q).replace(/[%_\\]/g, '')}%`, out = [];
    for (const t of Object.keys(T)) out.push(...db.prepare(`SELECT id,title,'${t}' AS type FROM ${t} WHERE moderation='approved' AND norm LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 5`).all(like));
    return { items: out };
  }
  if (a === 'notifications') { need(); if (m === 'POST') db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(u.id); return { items: db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30').all(u.id), unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0').get(u.id).n }; }
  if (a === 'reports' && m === 'POST') {
    need(); if (!T[d.tbl] && d.tbl !== 'answers') throw new E(400, 'نوع غير صالح');
    const reason = str(d.reason, 30); if (!['سبام', 'محتوى مزيف', 'معلومات خاطئة', 'محتوى غير لائق', 'احتيال', 'أخرى'].includes(reason)) throw new E(400, 'سبب غير صالح');
    db.prepare('INSERT INTO reports(tbl,target_id,reason,note,reporter_id) VALUES(?,?,?,?,?)').run(d.tbl, +d.id, reason, str(d.note, 500), u.id); return { ok: 1 };
  }
  if (a === 'questions' && c === 'answers' && m === 'POST') {
    need(); const qu = row('questions', +b); if (!qu) throw new E(404, 'غير موجود'); const body = str(d.body); if (!body) throw new E(400, 'الرد فارغ');
    db.prepare('INSERT INTO answers(question_id,body,owner_id) VALUES(?,?,?)').run(qu.id, body, u.id);
    if (qu.owner_id !== u.id) notify(qu.owner_id, `${u.name} رد على سؤالك`, `#/questions/${qu.id}`); return { ok: 1 };
  }
  if (a === 'admin') return admin(u, need, m, b, c, d, q);
  // ---- generic CRUD with ownership + moderation ----
  const t = a === 'books' ? 'items' : a, cfg = T[t]; if (!cfg) throw new E(404, 'غير موجود');
  if (m === 'GET' && !b) {
    const pg = Math.max(1, +q.page || 1), w = [], p = [];
    if (q.mine && u) { w.push('x.owner_id=?'); p.push(u.id); } else w.push("x.moderation='approved'");
    if (q.q) { w.push("x.norm LIKE ? ESCAPE '\\'"); p.push(`%${norm(q.q).replace(/[%_\\]/g, '')}%`); }
    for (const f of ['kind', 'status', 'category', 'major', 'year', 'priority']) if (q[f] && cfg.f.includes(f)) { w.push(`x.${f}=?`); p.push(q[f]); }
    const W = w.join(' AND '), n = db.prepare(`SELECT COUNT(*) n FROM ${t} x WHERE ${W}`).get(...p).n;
    return { total: n, page: pg, pages: Math.ceil(n / 12), items: db.prepare(`SELECT x.*,u.name AS owner_name FROM ${t} x LEFT JOIN users u ON u.id=x.owner_id WHERE ${W} ORDER BY x.id DESC LIMIT 12 OFFSET ?`).all(...p, (pg - 1) * 12) };
  }
  if (m === 'GET') { const r = row(t, +b); if (!r || (r.moderation !== 'approved' && !(u && (u.id === r.owner_id || has(u, cfg.perm))))) throw new E(404, 'غير موجود'); if (t === 'questions') r.answers = db.prepare("SELECT a.*,u.name AS owner_name FROM answers a JOIN users u ON u.id=a.owner_id WHERE question_id=? AND moderation='approved' ORDER BY a.id").all(r.id); return r; }
  if (m === 'POST') {
    need(cfg.open ? null : cfg.perm); const v = clean(t, d); v.norm = nrm(t, v); v.owner_id = u.id; const ks = Object.keys(v);
    const id = db.prepare(`INSERT INTO ${t}(${ks}) VALUES(${ks.map(() => '?')})`).run(...ks.map(k => v[k])).lastInsertRowid;
    if (!cfg.open) log(u, `إضافة عنصر (${t}): ${v.title}`, null, v); return { id };
  }
  need(); const r = row(t, +b); if (!r) throw new E(404, 'غير موجود');
  const own = r.owner_id === u.id; if (!own && !has(u, cfg.perm)) throw new E(403, 'لا يمكنك تعديل محتوى غيرك');
  if (m === 'PUT') { const v = clean(t, d, true); Object.assign(v, { norm: nrm(t, { ...r, ...v }) }); const ks = Object.keys(v); db.prepare(`UPDATE ${t} SET ${ks.map(k => k + '=?')} WHERE id=?`).run(...ks.map(k => v[k]), r.id); if (!own) log(u, `تعديل (${t}): ${r.title}`, r, v); return { ok: 1 }; }
  if (m === 'DELETE') { db.prepare(`DELETE FROM ${t} WHERE id=?`).run(r.id); if (!own) { log(u, `حذف (${t}): ${r.title}`, r, null); notify(r.owner_id, `تمت إزالة "${r.title}" من قبل الإدارة`, '#/'); } return { ok: 1 }; }
  throw new E(404, 'غير موجود');
}

function admin(u, need, m, b, c, d, q) {
  need();
  if (b === 'stats') { need('view_dashboard'); const n = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; return { users: n('users'), books: n('items'), questions: n('questions'), news: n('news'), announcements: n('announcements'), reports: db.prepare("SELECT COUNT(*) n FROM reports WHERE status='open'").get().n, reps: db.prepare("SELECT COUNT(*) n FROM users WHERE role='representative'").get().n }; }
  if (b === 'users' && !c && m === 'GET') { need('manage_users'); const like = `%${str(q.q, 50)}%`; return { items: db.prepare('SELECT id,name,username,email,role,status,university,major FROM users WHERE name LIKE ? OR username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 50').all(like, like, like) }; }
  if (b === 'users' && m === 'PATCH') {
    const t = db.prepare('SELECT * FROM users WHERE id=?').get(+c); if (!t) throw new E(404, 'المستخدم غير موجود');
    // Primary Admin is untouchable; nobody edits themselves or anyone at/above their own level.
    if (t.role === 'primary_admin' || t.id === u.id || (u.role !== 'primary_admin' && LV[t.role] >= LV[u.role])) throw new E(403, 'لا يمكنك تعديل هذا الحساب');
    if (d.role !== undefined) {
      need('manage_roles'); if (!ROLES.includes(d.role) || d.role === 'primary_admin' || LV[d.role] >= LV[u.role]) throw new E(403, 'دور غير مسموح');
      db.prepare('UPDATE users SET role=? WHERE id=?').run(d.role, t.id); log(u, `تغيير دور ${t.name}`, t.role, d.role); notify(t.id, 'تم تغيير دورك في الموقع', '#/');
    }
    if (d.status !== undefined) {
      need('manage_users'); if (!['active', 'suspended'].includes(d.status)) throw new E(400, 'حالة غير صالحة');
      db.prepare('UPDATE users SET status=? WHERE id=?').run(d.status, t.id); if (d.status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id=?').run(t.id);
      log(u, `${d.status === 'active' ? 'استعادة' : 'إيقاف'} حساب ${t.name}`, t.status, d.status);
    }
    return { ok: 1 };
  }
  if (b === 'permissions') {
    need('manage_permissions'); const roles = ['representative', 'assistant', 'co_admin'];
    if (m === 'GET') return { roles, perms: PERMS, granted: db.prepare('SELECT * FROM role_permissions').all() };
    if (!roles.includes(d.role) || !PERMS.includes(d.perm)) throw new E(400, 'طلب غير صالح');
    db.prepare(d.on ? 'INSERT OR IGNORE INTO role_permissions VALUES(?,?)' : 'DELETE FROM role_permissions WHERE role=? AND perm=?').run(d.role, d.perm);
    log(u, `${d.on ? 'منح' : 'سحب'} صلاحية ${d.perm} ${d.on ? 'إلى' : 'من'} ${d.role}`); return { ok: 1 };
  }
  if (b === 'logs') { need('view_logs'); return { items: db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100').all() }; }
  if (b === 'reports') {
    need('manage_reports');
    if (m === 'GET') return { items: db.prepare("SELECT r.*,u.name AS reporter FROM reports r JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.id DESC LIMIT 50").all() };
    const r = db.prepare('SELECT * FROM reports WHERE id=?').get(+c); if (!r) throw new E(404, 'غير موجود');
    if (d.remove) { db.prepare(`UPDATE ${r.tbl} SET moderation='removed' WHERE id=?`).run(r.target_id); }
    db.prepare('UPDATE reports SET status=? WHERE id=?').run(d.remove ? 'resolved' : 'dismissed', r.id); log(u, `${d.remove ? 'إزالة محتوى بسبب بلاغ' : 'تجاهل بلاغ'} (${r.tbl} #${r.target_id})`); return { ok: 1 };
  }
  throw new E(404, 'غير موجود');
}
async function body(req) { let b = ''; for await (const c of req) { b += c; if (b.length > 1e6) throw new E(413, 'الطلب كبير جدًا'); } return b ? JSON.parse(b) : {}; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    if (p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'kelna') throw new E(403, 'طلب غير مسموح'); // CSRF guard (+SameSite=Strict cookie)
      const out = await route(req, res, req.method, p.slice(5).split('/').filter(Boolean), Object.fromEntries(url.searchParams));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(out));
    }
    const f = path.join(__dirname, 'public', p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' }); fs.createReadStream(f).pipe(res);
  } catch (e) {
    const c = e.c || (e instanceof SyntaxError ? 400 : 500); if (!e.c && !(e instanceof SyntaxError)) console.error(e);
    res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: e.c ? e.message : c === 400 ? 'بيانات غير صالحة' : 'حدث خطأ، يرجى المحاولة مرة أخرى.' }));
  }
}).listen(PORT, () => console.log(`كلنا لبعض → http://localhost:${PORT}`));
