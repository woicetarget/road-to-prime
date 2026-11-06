// Road to Prime: виджет для приложения Scriptable (iPhone, бесплатное).
// Как поставить:
// 1. В Scriptable нажми «+», вставь весь этот текст, назови скрипт «Road to Prime».
// 2. Запусти его кнопкой ▶ один раз: он спросит токен GitHub (тот же, что в приложении, право gist).
// 3. На экране «Домой» долго нажми на пустое место, «+», Scriptable, выбери размер, затем в настройках виджета выбери этот скрипт.
// Данные читаются из твоего закрытого Gist road-to-prime.json, ничего не записывается.

const APP_URL = 'https://woicetarget.github.io/road-to-prime/';
const GIST_FILE = 'road-to-prime.json';
const C = {bg1: '#0B1424', bg2: '#17294A', ivory: '#F7F2E0', mute: '#A8B8D6', accent: '#80AEE8'};

// ---- логика (та же, что в приложении) ----
function ymd(d) { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function plural(n, f) { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return f[2]; if (b > 1 && b < 5) return f[1]; if (b === 1) return f[0]; return f[2]; }
function summarize(data, now) {
  const today = ymd(now), tasks = (data && data.tasks) || [];
  const todays = tasks.filter(t => t.date === today);
  const done = todays.filter(t => t.done).length;
  const score = t => (t.main ? 0 : 10) + (t.date === today ? 0 : 6) + Math.min(8, Math.floor((t.title || '').length / 12)) - ((t.steps || []).some(s => !s.d) ? 2 : 0);
  const open = tasks.filter(t => !t.done && t.date <= today).sort((a, b) => score(a) - score(b) || (a.created || 0) - (b.created || 0));
  const days = new Set(); tasks.forEach(t => { if (t.done) days.add(t.doneAt ? ymd(new Date(t.doneAt)) : t.date); });
  let cur = new Date(now); if (!days.has(ymd(cur))) cur.setDate(cur.getDate() - 1);
  let streak = 0; while (days.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  const step = t => { const s = (t.steps || []).find(x => !x.d); return s ? s.t : null; };
  return {total: todays.length, done, streak, next: open.slice(0, 3).map(t => ({title: t.title, big: !!t.big, rat: !!t.rat, step: step(t)})), at: now.getTime()};
}
// ---- конец логики ----

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'rtp_cache.json');
const dogPath = fm.joinPath(fm.documentsDirectory(), 'rtp_dog.png');

async function askToken() {
  const a = new Alert();
  a.title = 'Road to Prime';
  a.message = 'Вставь токен GitHub с правом gist, тот же, что в приложении.';
  a.addSecureTextField('токен');
  a.addAction('Сохранить'); a.addCancelAction('Отмена');
  if ((await a.presentAlert()) === -1) return null;
  const t = a.textFieldValue(0).trim();
  if (t) Keychain.set('rtp_token', t);
  return t || null;
}
async function api(path, token) {
  const r = new Request('https://api.github.com' + path);
  r.headers = {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json'};
  const json = await r.loadJSON();
  if (r.response && r.response.statusCode >= 400) throw new Error('GitHub ' + r.response.statusCode);
  return json;
}
async function loadData(token) {
  let id = Keychain.contains('rtp_gist') ? Keychain.get('rtp_gist') : null;
  if (!id) {
    for (let p = 1; p <= 3 && !id; p++) {
      const list = await api('/gists?per_page=100&page=' + p, token);
      const g = list.find(x => x.files && x.files[GIST_FILE]);
      if (g) id = g.id; else if (list.length < 100) break;
    }
    if (id) Keychain.set('rtp_gist', id);
  }
  if (!id) throw new Error('Gist не найден: сначала включи синхронизацию в приложении');
  const g = await api('/gists/' + id, token), f = g.files[GIST_FILE];
  const text = f.truncated ? await new Request(f.raw_url).loadString() : f.content;
  return JSON.parse(text);
}
async function getSummary() {
  let token = Keychain.contains('rtp_token') ? Keychain.get('rtp_token') : null;
  if (!token && !config.runsInWidget) token = await askToken();
  if (!token) return {error: 'Запусти скрипт в Scriptable и вставь токен'};
  try {
    const s = summarize(await loadData(token), new Date());
    fm.writeString(cachePath, JSON.stringify(s));
    return s;
  } catch (e) {
    if (fm.fileExists(cachePath)) { const s = JSON.parse(fm.readString(cachePath)); s.stale = true; return s; }
    return {error: String(e.message || e)};
  }
}
async function getDog() {
  try { const img = await new Request(APP_URL + 'dog.png').loadImage(); fm.writeImage(dogPath, img); return img; }
  catch (e) { return fm.fileExists(dogPath) ? fm.readImage(dogPath) : null; }
}

function label(stack, text, size, color, weight) {
  const t = stack.addText(text);
  t.font = weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semi' ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color || C.ivory);
  return t;
}
function build(s, dog, family) {
  const w = new ListWidget();
  const g = new LinearGradient(); g.colors = [new Color(C.bg1), new Color(C.bg2)]; g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  w.setPadding(14, 14, 12, 14);
  if (s.error) { label(w, 'ROAD TO PRIME', 10, C.accent, 'bold'); w.addSpacer(8); const t = label(w, s.error, 12, C.ivory); t.lineLimit = 5; return w; }

  if (family === 'accessoryRectangular' || family === 'accessoryInline') {
    label(w, 'Road to Prime', 11, C.ivory, 'bold');
    label(w, 'Сегодня ' + s.done + ' из ' + s.total, 13, C.ivory, 'semi');
    const n = s.next[0]; const t = label(w, n ? n.title : 'Дел нет', 11, C.ivory); t.lineLimit = 1;
    return w;
  }
  const medium = family === 'medium' || family === 'large';
  const top = w.addStack(); top.layoutHorizontally(); top.centerAlignContent();
  const left = top.addStack(); left.layoutVertically();
  label(left, 'ROAD TO PRIME' + (s.stale ? ' · офлайн' : ''), 9, C.accent, 'bold');
  left.addSpacer(2);
  const num = label(left, s.done + '/' + s.total, medium ? 34 : 30, C.ivory, 'bold');
  num.minimumScaleFactor = 0.6;
  label(left, s.streak ? 'сегодня · серия ' + s.streak + ' ' + plural(s.streak, ['день', 'дня', 'дней']) : 'сегодня', 11, C.mute);
  top.addSpacer();
  if (dog) { const im = top.addImage(dog); im.imageSize = new Size(medium ? 64 : 52, medium ? 80 : 65); im.cornerRadius = 10; }
  w.addSpacer(8);
  const lines = medium ? s.next.slice(0, 3) : s.next.slice(0, 1);
  if (!lines.length) { label(w, 'Дел на сегодня нет. Можно выдохнуть.', 12, C.mute).lineLimit = 2; return w; }
  label(w, 'Дальше', 10, C.accent, 'semi');
  lines.forEach((n, i) => {
    const t = label(w, (n.big ? 'Кабан: ' : n.rat ? 'Крыса: ' : '') + n.title, medium ? 13 : 12, C.ivory, i === 0 ? 'semi' : null);
    t.lineLimit = i === 0 && !medium ? 3 : 1;
    if (i === 0 && n.step && !medium) { const st = label(w, 'Первый стейк: ' + n.step, 10, C.mute); st.lineLimit = 2; }
  });
  return w;
}

const summary = await getSummary();
const dog = summary.error ? null : await getDog();
const family = config.widgetFamily || 'small';
const widget = build(summary, dog, family);
if (config.runsInWidget) Script.setWidget(widget);
else { await widget.presentMedium(); }
Script.complete();
