'use strict';
if (location.protocol === 'file:') document.addEventListener('DOMContentLoaded', () => { document.querySelector('#app').innerHTML = '<div class="box"><h1>شغّل السيرفر أولًا</h1><p>الموقع يحتاج سيرفر ليعمل. افتح الطرفية داخل مجلد المشروع ونفّذ:</p><pre dir="ltr">npm start</pre><p>ثم افتح <b dir="ltr">http://localhost:3000</b> في المتصفح (أو شغّل start.bat على ويندوز).</p></div>'; });
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { user: 'طالب', representative: 'مندوب', assistant: 'مساعد', co_admin: 'مشرف مشارك', primary_admin: 'المدير العام' };
let me = null;
async function api(p, m = 'GET', b) {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kelna' }, body: b ? JSON.stringify(b) : undefined });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'حدث خطأ، يرجى المحاولة مرة أخرى.'); return d;
}
function toast(t) { const e = $('#toast'); e.textContent = t; e.style.display = 'block'; setTimeout(() => e.style.display = 'none', 2800); }
const can = p => me && me.perms.includes(p), isAdmin = () => me && me.role !== 'user' && me.role !== 'representative';
const SEC = {
  books: { h: 'الكتب والكورسات', open: 1, perm: 'manage_books', flt: [['kind', 'النوع', ['كتاب', 'كورس']], ['status', 'الحالة', ['مجاني', 'للبيع', 'للاستعارة']]],
    f: [['kind', 'النوع', 's', ['كتاب', 'كورس']], ['title', 'الاسم'], ['subject', 'المادة'], ['major', 'التخصص'], ['year', 'السنة الدراسية'], ['description', 'الوصف', 't'], ['phone', 'رقم الهاتف'], ['whatsapp', 'واتساب'], ['price', 'السعر'], ['status', 'الحالة', 's', ['مجاني', 'للبيع', 'للاستعارة']]] },
  questions: { h: 'أسئلة الطلاب', open: 1, perm: 'manage_questions', f: [['title', 'السؤال'], ['body', 'التفاصيل', 't'], ['category', 'التصنيف']] },
  news: { h: 'آخر الأخبار', perm: 'manage_news', f: [['title', 'العنوان'], ['content', 'المحتوى', 't'], ['category', 'التصنيف']] },
  announcements: { h: 'الإعلانات', perm: 'manage_announcements', f: [['title', 'العنوان'], ['content', 'المحتوى', 't'], ['category', 'التصنيف'], ['priority', 'الأولوية', 's', ['عادي', 'مهم', 'مهم جدًا']]] },
};
const PRI = { 'مهم جدًا': '🔴', 'مهم': '🟡', 'عادي': '🔵' };
const canAdd = s => me && (s.open || can(s.perm)), canEdit = (s, r) => me && (r.owner_id === me.id || can(s.perm));

function shell() {
  const L = [['', 'الرئيسية'], ['news', 'الأخبار'], ['reps', 'المندوبون'], ['books', 'الكتب والكورسات'], ['questions', 'أسئلة الطلاب'], ['announcements', 'الإعلانات']];
  if (isAdmin()) L.push(['admin', 'لوحة التحكم']);
  const cur = location.hash.split('/')[1] || '';
  $('#nav').innerHTML = L.map(([k, t]) => `<a href="#/${k}" class="${k === cur ? 'on' : ''}">${t}</a>`).join('');
  $('#user').innerHTML = me ? `<a href="#/notifications" aria-label="الإشعارات">🔔<span id="nc"></span></a> <a href="#/profile">${esc(me.name)}</a> <button class="btn s g" id="out">تسجيل الخروج</button>`
    : `<a class="btn s" href="#/login">تسجيل الدخول</a> <a class="btn s y" href="#/register">إنشاء حساب</a>`;
  if ($('#out')) $('#out').onclick = async () => { await api('/auth/logout', 'POST'); me = null; location.hash = '#/'; route(); };
  if (me) api('/notifications').then(d => { if (d.unread && $('#nc')) $('#nc').textContent = ' ' + d.unread; }).catch(() => { });
}
const meta = r => `<span class="mute small">${esc(r.owner_name || '')} · ${esc((r.created_at || '').slice(0, 10))}</span>`;
function card(k, r) {
  const s = SEC[k], txt = r.description || r.body || r.content || '', wa = String(r.whatsapp || r.phone || '').replace(/\D/g, '');
  const chips = [r.kind, r.status, r.price, r.subject, r.major, r.year, r.category, r.priority && (PRI[r.priority] + ' ' + r.priority)].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('');
  const link = k === 'questions' ? `<a href="#/questions/${r.id}">${esc(r.title)}</a>` : esc(r.title);
  return `<article class="card"><h3>${link}</h3><div>${chips}</div><p>${esc(txt.slice(0, 140))}</p>${meta(r)}<div>
    ${r.phone ? `<a class="btn s" href="tel:${esc(r.phone)}">اتصال</a> ` : ''}${wa ? `<a class="btn s y" target="_blank" rel="noopener" href="https://wa.me/${wa}">واتساب</a> ` : ''}
    ${canEdit(s, r) ? `<button class="btn s g" data-e="${k}:${r.id}">تعديل</button> <button class="btn s r" data-d="${k}:${r.id}">حذف</button>` : ''}
    ${me && r.owner_id !== me.id ? `<button class="btn s g" data-r="${k}:${r.id}">🚩 إبلاغ</button>` : ''}</div></article>`;
}
function form(k, r = {}) {
  const s = SEC[k], d = $('#dlg');
  d.innerHTML = `<form id="f"><h2>${r.id ? 'تعديل' : 'إضافة'}</h2>${s.f.map(([n, l, t, o]) => `<label for="f_${n}">${l}</label>` + (t === 's' ? `<select id="f_${n}" name="${n}">${o.map(v => `<option ${r[n] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>` : t === 't' ? `<textarea id="f_${n}" name="${n}" rows="4">${esc(r[n])}</textarea>` : `<input id="f_${n}" name="${n}" value="${esc(r[n])}">`)).join('')}
  <p class="err" id="fe"></p><button class="btn">حفظ</button> <button type="button" class="btn g" id="cx">إلغاء</button></form>`;
  d.showModal(); $('#cx').onclick = () => d.close();
  $('#f').onsubmit = async e => { e.preventDefault(); try { await api(`/${k}${r.id ? '/' + r.id : ''}`, r.id ? 'PUT' : 'POST', Object.fromEntries(new FormData(e.target))); d.close(); toast('تم الحفظ'); route(); } catch (x) { $('#fe').textContent = x.message; } };
}
function report(k, id) {
  const d = $('#dlg'), t = k === 'books' ? 'items' : k;
  d.innerHTML = `<form id="f"><h2>🚩 إبلاغ</h2><label for="rs">السبب</label><select id="rs">${['سبام', 'محتوى مزيف', 'معلومات خاطئة', 'محتوى غير لائق', 'احتيال', 'أخرى'].map(x => `<option>${x}</option>`).join('')}</select><label for="rn">ملاحظة</label><textarea id="rn" rows="3"></textarea><br><button class="btn">إرسال</button> <button type="button" class="btn g" id="cx">إلغاء</button></form>`;
  d.showModal(); $('#cx').onclick = () => d.close();
  $('#f').onsubmit = async e => { e.preventDefault(); try { await api('/reports', 'POST', { tbl: t, id, reason: $('#rs').value, note: $('#rn').value }); d.close(); toast('تم إرسال البلاغ'); } catch (x) { toast(x.message); } };
}
app.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.e) { const [k, id] = b.dataset.e.split(':'); form(k, await api(`/${k}/${id}`)); }
  if (b.dataset.d && confirm('هل أنت متأكد من الحذف؟')) { const [k, id] = b.dataset.d.split(':'); try { await api(`/${k}/${id}`, 'DELETE'); toast('تم الحذف'); route(); } catch (x) { toast(x.message); } }
  if (b.dataset.r) report(...b.dataset.r.split(':'));
});
async function list(k, q = {}) {
  const s = SEC[k], qs = new URLSearchParams(q).toString();
  app.innerHTML = `<h1>${s.h}</h1><div class="tools"><input id="sq" aria-label="بحث" placeholder="بحث..." value="${esc(q.q || '')}">${(s.flt || []).map(([n, l, o]) => `<select data-f="${n}" aria-label="${l}"><option value="">${l}: الكل</option>${o.map(v => `<option ${q[n] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`).join('')}${canAdd(s) ? '<button class="btn y" id="add">+ إضافة</button>' : ''}</div><div id="res"><p class="empty">جارٍ التحميل...</p></div>`;
  const go = () => { const n = { q: $('#sq').value }; document.querySelectorAll('[data-f]').forEach(x => { if (x.value) n[x.dataset.f] = x.value; }); list(k, n); };
  $('#sq').onkeydown = e => e.key === 'Enter' && go(); document.querySelectorAll('[data-f]').forEach(x => x.onchange = go); if ($('#add')) $('#add').onclick = () => form(k);
  try {
    const d = await api(`/${k}?${qs}`);
    $('#res').innerHTML = d.items.length ? `<div class="grid">${d.items.map(r => card(k, r)).join('')}</div>${d.pages > 1 ? `<p>${d.page > 1 ? `<a class="btn s g" href="#/${k}?${new URLSearchParams({ ...q, page: d.page - 1 })}">السابق</a> ` : ''}صفحة ${d.page} من ${d.pages}${d.page < d.pages ? ` <a class="btn s g" href="#/${k}?${new URLSearchParams({ ...q, page: d.page + 1 })}">التالي</a>` : ''}</p>` : ''}` : '<p class="empty">لا توجد نتائج حاليًا.</p>';
  } catch (x) { $('#res').innerHTML = `<p class="err">${esc(x.message)}</p>`; }
}
async function home() {
  app.innerHTML = `<section class="hero"><div class="logo">ك</div><h1>كلنا لبعض</h1><p>سنخدمكم بأشفار عيوننا</p></section>
  <nav class="short">${[['news', 'الأخبار', '📰'], ['reps', 'المندوبون', '🎓'], ['books', 'الكتب والكورسات', '📚'], ['questions', 'الأسئلة', '💬'], ['announcements', 'الإعلانات', '📢']].map(([k, t, i]) => `<a href="#/${k}"><span>${i}</span>${t}</a>`).join('')}</nav><div id="hx"></div>`;
  const parts = await Promise.all(['announcements', 'news', 'books', 'questions'].map(k => api(`/${k}`).then(d => [k, d.items.slice(0, 3)]).catch(() => [k, []])));
  $('#hx').innerHTML = parts.map(([k, it]) => `<div class="sh"><h2>${SEC[k].h}</h2><a href="#/${k}">عرض الكل ←</a></div>${it.length ? `<div class="grid">${it.map(r => card(k, r)).join('')}</div>` : '<p class="empty">لا يوجد محتوى حاليًا.</p>'}`).join('');
}
async function reps(q = '') {
  app.innerHTML = `<h1>مندوبو الجامعة</h1><div class="tools"><input id="sq" aria-label="بحث" placeholder="ابحث بالاسم أو التخصص أو السنة" value="${esc(q)}"></div><div id="res"></div>`;
  $('#sq').onkeydown = e => e.key === 'Enter' && reps(e.target.value);
  const d = await api('/reps?q=' + encodeURIComponent(q)), wa = p => String(p || '').replace(/\D/g, '');
  $('#res').innerHTML = d.items.length ? `<div class="grid">${d.items.map(r => `<article class="card"><h3>${esc(r.name)}</h3><span class="mute small">${esc(r.university)} · ${esc(r.major)} · ${esc(r.year)}</span><p>${esc(r.bio)}</p>${r.phone ? `<div><a class="btn s" href="tel:${esc(r.phone)}">اتصال</a> <a class="btn s y" target="_blank" rel="noopener" href="https://wa.me/${wa(r.phone)}">واتساب</a></div>` : ''}</article>`).join('')}</div>` : '<p class="empty">لم يتم العثور على نتائج.</p>';
}
async function question(id) {
  const r = await api('/questions/' + id);
  app.innerHTML = `<article class="card"><h1>${esc(r.title)}</h1><p>${esc(r.body)}</p>${meta(r)}</article><h2>الردود (${r.answers.length})</h2>${r.answers.map(a => `<div class="card"><p>${esc(a.body)}</p>${meta(a)}</div>`).join('') || '<p class="empty">لا توجد ردود بعد.</p>'}
  ${me ? `<form id="rf"><label for="rb">ردك</label><textarea id="rb" rows="3" required></textarea><br><button class="btn">إرسال الرد</button></form>` : '<p><a href="#/login">سجّل الدخول</a> لتتمكن من الرد.</p>'}`;
  if ($('#rf')) $('#rf').onsubmit = async e => { e.preventDefault(); try { await api(`/questions/${id}/answers`, 'POST', { body: $('#rb').value }); question(id); } catch (x) { toast(x.message); } };
}
function auth(mode) {
  const reg = mode === 'register', adm = mode === 'admin-login';
  app.innerHTML = `<form class="box" id="af"><h1>${reg ? 'إنشاء حساب' : adm ? 'دخول الإدارة' : 'تسجيل الدخول'}</h1>
  ${reg ? '<label for="n">الاسم</label><input id="n" required><label for="un">اسم المستخدم (بالإنكليزية)</label><input id="un" required><label for="em">البريد الإلكتروني</label><input id="em" type="email" required><label for="uv">الجامعة</label><input id="uv"><label for="mj">التخصص</label><input id="mj"><label for="yr">السنة الدراسية</label><input id="yr">' : '<label for="id">البريد أو اسم المستخدم</label><input id="id" required>'}
  <label for="pw">كلمة المرور</label><input id="pw" type="password" required minlength="8"><label><input type="checkbox" id="rm" style="width:auto"> تذكرني</label><p class="err" id="ae"></p><button class="btn">${reg ? 'إنشاء الحساب' : 'دخول'}</button>
  <p class="small">${reg ? '<a href="#/login">لدي حساب</a>' : '<a href="#/register">إنشاء حساب جديد</a> · <a href="#/admin-login">دخول الإدارة</a>'}</p></form>`;
  $('#af').onsubmit = async e => {
    e.preventDefault(); const v = i => $('#' + i)?.value;
    try { me = (await api('/auth/' + (reg ? 'register' : 'login'), 'POST', reg ? { name: v('n'), username: v('un'), email: v('em'), university: v('uv'), major: v('mj'), year: v('yr'), password: v('pw'), remember: $('#rm').checked } : { id: v('id'), password: v('pw'), remember: $('#rm').checked, admin: adm })).user; location.hash = adm ? '#/admin' : '#/'; route(); }
    catch (x) { $('#ae').textContent = x.message; }
  };
}
async function profile() {
  if (!me) return auth('login');
  const mine = await Promise.all(['books', 'questions'].map(k => api(`/${k}?mine=1`).then(d => [k, d.items])));
  app.innerHTML = `<h1>الملف الشخصي</h1><form class="box" style="max-width:100%" id="pf">${[['name', 'الاسم'], ['university', 'الجامعة'], ['major', 'التخصص'], ['year', 'السنة'], ['phone', 'الهاتف'], ['bio', 'نبذة']].map(([n, l]) => `<label for="p_${n}">${l}</label><input id="p_${n}" name="${n}" value="${esc(me[n])}">`).join('')}<p class="mute">الدور: ${ROLE[me.role]}</p><button class="btn">حفظ</button></form>
  ${mine.map(([k, it]) => `<h2>${k === 'books' ? 'كتبي وكورساتي' : 'أسئلتي'}</h2>${it.length ? `<div class="grid">${it.map(r => card(k, r)).join('')}</div>` : '<p class="empty">لا يوجد شيء بعد.</p>'}`).join('')}`;
  $('#pf').onsubmit = async e => { e.preventDefault(); try { me = (await api('/me', 'PATCH', Object.fromEntries(new FormData(e.target)))).user; toast('تم الحفظ'); shell(); } catch (x) { toast(x.message); } };
}
async function notifications() {
  if (!me) return auth('login'); const d = await api('/notifications', 'POST');
  app.innerHTML = `<h1>الإشعارات</h1>${d.items.map(n => `<a class="card" href="${esc(n.link || '#/')}">${esc(n.text)} <span class="mute small">${esc(n.created_at)}</span></a>`).join('') || '<p class="empty">لا توجد إشعارات.</p>'}`; shell();
}
async function searchPage(q) {
  const d = await api('/search?q=' + encodeURIComponent(q)), T = { items: 'books', questions: 'questions', news: 'news', announcements: 'announcements' };
  app.innerHTML = `<h1>نتائج البحث: ${esc(q)}</h1>${d.items.map(r => `<a class="card" href="#/${T[r.type]}?q=${encodeURIComponent(r.title)}">${esc(r.title)} <span class="chip">${SEC[T[r.type]].h}</span></a>`).join('') || '<p class="empty">لم يتم العثور على نتائج.</p>'}`;
}
async function adminPage(tab = 'stats') {
  if (!isAdmin()) return auth('admin-login');
  const tabs = [['stats', 'لوحة التحكم', 'view_dashboard'], ['users', 'المستخدمون', 'manage_users'], ['permissions', 'الأدوار والصلاحيات', 'manage_permissions'], ['reports', 'البلاغات', 'manage_reports'], ['logs', 'سجل النشاطات', 'view_logs']].filter(t => can(t[2]));
  app.innerHTML = `<h1>الإدارة</h1><div class="tabs">${tabs.map(([k, l]) => `<a class="btn s ${k === tab ? '' : 'g'}" href="#/admin/${k}">${l}</a>`).join('')}</div><div id="ad" class="scroll"></div>`;
  const box = $('#ad'); try {
    if (tab === 'stats') { const s = await api('/admin/stats'), L = { users: 'المستخدمون', reps: 'المندوبون', books: 'الكتب والكورسات', questions: 'الأسئلة', news: 'الأخبار', announcements: 'الإعلانات', reports: 'بلاغات مفتوحة' }; box.innerHTML = `<div class="grid">${Object.entries(L).map(([k, l]) => `<div class="card stat"><b>${s[k]}</b>${l}</div>`).join('')}</div>`; }
    if (tab === 'users') {
      const draw = async q => { const d = await api('/admin/users?q=' + encodeURIComponent(q || '')); $('#ut').innerHTML = d.items.map(u => `<tr><td>${esc(u.name)}<br><small class="mute">${esc(u.email)}</small></td><td>${can('manage_roles') && u.role !== 'primary_admin' ? `<select data-u="${u.id}" data-k="role" aria-label="الدور">${Object.keys(ROLE).filter(r => r !== 'primary_admin').map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select>` : ROLE[u.role]}</td><td>${u.role === 'primary_admin' ? '—' : `<button class="btn s ${u.status === 'active' ? 'r' : 'g'}" data-u="${u.id}" data-k="status" data-v="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'إيقاف' : 'استعادة'}</button>`}</td></tr>`).join(''); };
      box.innerHTML = `<input id="uq" placeholder="ابحث عن مستخدم" aria-label="بحث"><table><tbody id="ut"></tbody></table>`; $('#uq').onkeyup = e => draw(e.target.value); await draw();
      box.onchange = box.onclick = async e => { const t = e.target.closest('[data-u]'); if (!t || (e.type === 'click' && t.tagName === 'SELECT')) return; if (t.tagName === 'BUTTON' && !confirm('هل أنت متأكد؟')) return; try { await api('/admin/users/' + t.dataset.u, 'PATCH', { [t.dataset.k]: t.dataset.v || t.value }); toast('تم'); draw($('#uq').value); } catch (x) { toast(x.message); draw($('#uq').value); } };
    }
    if (tab === 'permissions') {
      const d = await api('/admin/permissions'), g = new Set(d.granted.map(x => x.role + ':' + x.perm));
      box.innerHTML = `<p class="mute">كل دور أعلى يرث صلاحيات الأدوار الأدنى تلقائيًا. الصلاحيات الحساسة محصورة بالمدير العام.</p><table><tr><th>الصلاحية</th>${d.roles.map(r => `<th>${ROLE[r]}</th>`).join('')}</tr>${d.perms.map(p => `<tr><td>${p}</td>${d.roles.map(r => `<td><input type="checkbox" style="width:auto" data-r="${r}" data-p="${p}" ${g.has(r + ':' + p) ? 'checked' : ''} aria-label="${p}"></td>`).join('')}</tr>`).join('')}</table>`;
      box.onchange = async e => { try { await api('/admin/permissions', 'PUT', { role: e.target.dataset.r, perm: e.target.dataset.p, on: e.target.checked }); toast('تم الحفظ'); } catch (x) { toast(x.message); } };
    }
    if (tab === 'reports') {
      const d = await api('/admin/reports'); box.innerHTML = d.items.map(r => `<div class="card"><b>${esc(r.reason)}</b> — ${esc(r.tbl)} #${r.target_id} <span class="mute small">من ${esc(r.reporter)}</span><p>${esc(r.note)}</p><div><button class="btn s r" data-x="${r.id}" data-rm="1">إزالة المحتوى</button> <button class="btn s g" data-x="${r.id}">تجاهل</button></div></div>`).join('') || '<p class="empty">لا توجد بلاغات.</p>';
      box.onclick = async e => { const t = e.target.closest('[data-x]'); if (t && confirm('هل أنت متأكد؟')) { await api('/admin/reports/' + t.dataset.x, 'PATCH', { remove: !!t.dataset.rm }); adminPage('reports'); } };
    }
    if (tab === 'logs') { const d = await api('/admin/logs'); box.innerHTML = `<table>${d.items.map(l => `<tr><td>${esc(l.text)}</td><td class="mute small">${esc(l.created_at)}</td></tr>`).join('') || '<tr><td class="empty">لا يوجد نشاط.</td></tr>'}</table>`; }
  } catch (x) { box.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
}
async function route() {
  const [, k = '', id] = location.hash.split('?')[0].split('/'), q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  shell(); $('#nav').classList.remove('open'); window.scrollTo(0, 0);
  try {
    if (!k) await home(); else if (k === 'reps') await reps(); else if (k === 'questions' && id) await question(id); else if (SEC[k]) await list(k, q);
    else if (k === 'login' || k === 'register' || k === 'admin-login') auth(k); else if (k === 'profile') await profile(); else if (k === 'notifications') await notifications();
    else if (k === 'search') await searchPage(q.q || ''); else if (k === 'admin') await adminPage(id); else app.innerHTML = '<p class="empty">الصفحة غير موجودة.</p>';
  } catch (x) { app.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
  document.title = 'كلنا لبعض | ' + (SEC[k]?.h || 'منصة الطلاب');
}
$('#burger').onclick = () => $('#nav').classList.toggle('open');
$('#gs').onsubmit = e => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent($('#gq').value); };
window.addEventListener('hashchange', route);
api('/me').then(d => me = d.user).catch(() => { }).finally(route);
