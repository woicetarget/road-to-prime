// RTP-WIDGET v3.1: основной код виджета Road to Prime. Его подтягивает загрузчик loader.js.
// Слева квадрат с курящим псом (кадр меняется при каждом обновлении), справа дела на сегодня в стиле приложения.
// Данные читаются из закрытого Gist road-to-prime.json, ничего не записывается.

const APP_URL = 'https://woicetarget.github.io/road-to-prime/';
const GIST_FILE = 'road-to-prime.json';
const FRAMES = 6;
const TOKEN_VERSION = '2'; // поменяй число, и виджет один раз попросит токен заново
const C = {bg1: '#0B1424', bg2: '#17294A', surface: '#12213A', line: '#2C4570', ivory: '#F7F2E0', mute: '#A8B8D6', accent: '#80AEE8'};
const CAT = {proj: '#FF9D6B', job: '#8DB4F5', home: '#F2CB57', body: '#6FD3A0', learn: '#B79BF2'};

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
  const short = t => ({title: t.title, big: !!t.big, rat: !!t.rat, main: !!t.main, cat: t.cat || 'proj', done: !!t.done, step: step(t)});
  const todayList = todays.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (b.main ? 1 : 0) - (a.main ? 1 : 0) || (a.created || 0) - (b.created || 0));
  return {total: todays.length, done, streak, tasks: todayList.slice(0, 5).map(short), next: open.slice(0, 3).map(short), at: now.getTime()};
}
// ---- конец логики ----

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), 'rtp_cache.json');
const dogPath = fm.joinPath(fm.documentsDirectory(), 'rtp_dog_frame.png');

function resetTokenIfOld() {
  const v = Keychain.contains('rtp_token_ver') ? Keychain.get('rtp_token_ver') : '';
  if (v !== TOKEN_VERSION) {
    ['rtp_token', 'rtp_gist'].forEach(k => { if (Keychain.contains(k)) Keychain.remove(k); });
    Keychain.set('rtp_token_ver', TOKEN_VERSION);
  }
}
async function tokenWorks(t) {
  try {
    const r = new Request('https://api.github.com/gists?per_page=1');
    r.headers = {Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json'};
    await r.loadJSON();
    return !!r.response && r.response.statusCode < 400;
  } catch (e) { return false; }
}
async function askToken() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const a = new Alert();
    a.title = 'Road to Prime';
    a.message = attempt ? 'Этот токен не подошёл. Вставь токен GitHub с правом gist целиком.' : 'Вставь токен GitHub с правом gist, тот же, что в приложении.';
    a.addSecureTextField('токен');
    a.addAction('Сохранить'); a.addCancelAction('Отмена');
    if ((await a.presentAlert()) === -1) return null;
    const t = a.textFieldValue(0).trim();
    if (t && await tokenWorks(t)) { Keychain.set('rtp_token', t); if (Keychain.contains('rtp_gist')) Keychain.remove('rtp_gist'); return t; }
  }
  return null;
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
  resetTokenIfOld();
  let token = Keychain.contains('rtp_token') ? Keychain.get('rtp_token') : null;
  if (!config.runsInWidget) {
    if (token) {
      const m = new Alert(); m.title = 'Road to Prime';
      m.addAction('Показать виджет'); m.addAction('Ввести токен заново'); m.addCancelAction('Отмена');
      const i = await m.presentAlert();
      if (i === -1) return {cancel: true};
      if (i === 1) { Keychain.remove('rtp_token'); if (Keychain.contains('rtp_gist')) Keychain.remove('rtp_gist'); token = await askToken(); }
    } else token = await askToken();
  }
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
// «Анимация»: виджеты iOS не умеют двигаться, поэтому при каждом обновлении берётся другой кадр (дым, уши, лёгкий наклон).
async function getDog() {
  const frame = Math.floor(Date.now() / 60000) % FRAMES;
  try { const img = await new Request(APP_URL + 'dog-f' + frame + '.png').loadImage(); fm.writeImage(dogPath, img); return img; }
  catch (e) { return fm.fileExists(dogPath) ? fm.readImage(dogPath) : null; }
}

const hhmm = ms => { const d = new Date(ms), p = n => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); };
function font(size, kind) {
  if (kind === 'cond') return new Font('AvenirNextCondensed-Bold', size);
  if (kind === 'bold') return Font.boldSystemFont(size);
  if (kind === 'semi') return Font.semiboldSystemFont(size);
  return Font.systemFont(size);
}
function label(stack, text, size, color, kind) {
  const t = stack.addText(text);
  t.font = font(size, kind); t.textColor = new Color(color || C.ivory);
  return t;
}
function bar(w, h, pct) {
  const dc = new DrawContext(); dc.size = new Size(w, h); dc.opaque = false; dc.respectScreenScale = true;
  let p = new Path(); p.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2); dc.addPath(p); dc.setFillColor(new Color(C.line)); dc.fillPath();
  if (pct > 0) { p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(h, w * pct), h), h / 2, h / 2); dc.addPath(p); dc.setFillColor(new Color(C.accent)); dc.fillPath(); }
  return dc.getImage();
}
function plate(parent) {
  const s = parent.addStack(); s.layoutVertically();
  s.setPadding(5, 8, 5, 8); s.cornerRadius = 10; s.backgroundColor = new Color(C.bg1, 0.74);
  return s;
}
const prefix = n => (n.main ? '★ ' : '') + (n.big ? 'Кабан: ' : n.rat ? 'Крыса: ' : '');

function build(s, dog, family) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const g = new LinearGradient(); g.colors = [new Color(C.bg1), new Color(C.bg2)]; g.locations = [0, 1];

  if (s.error) {
    w.backgroundGradient = g; w.setPadding(14, 14, 12, 14);
    label(w, 'ROAD TO PRIME', 10, C.accent, 'cond'); w.addSpacer(8);
    label(w, s.error, 11, C.ivory).lineLimit = 5;
    return w;
  }
  if (family === 'accessoryRectangular' || family === 'accessoryInline') {
    label(w, 'Road to Prime', 11, C.ivory, 'bold');
    label(w, 'Сегодня ' + s.done + ' из ' + s.total, 13, C.ivory, 'semi');
    const n = s.next[0]; label(w, n ? n.title : 'Дел нет', 11, C.ivory).lineLimit = 1;
    return w;
  }

  const big = family === 'medium' || family === 'large';
  if (!big) {
    // маленький: пёс на весь фон, сверху счётчик, снизу плашка с делом
    if (dog) w.backgroundImage = dog; else w.backgroundGradient = g;
    w.setPadding(8, 8, 8, 8);
    const row = w.addStack(); row.layoutHorizontally();
    const chip = row.addStack(); chip.layoutHorizontally(); chip.centerAlignContent();
    chip.setPadding(3, 8, 3, 8); chip.cornerRadius = 10; chip.backgroundColor = new Color(C.bg1, 0.74);
    label(chip, s.done + '/' + s.total, 16, C.ivory, 'cond');
    label(chip, ' ' + (s.stale ? 'офлайн ' : '') + hhmm(s.at), 8, C.mute);
    row.addSpacer();
    w.addSpacer();
    const p = plate(w), n = s.next[0];
    if (!n) { label(p, 'Дел на сегодня нет', 10, C.ivory, 'semi'); return w; }
    label(p, 'Дальше', 8, C.accent, 'cond');
    label(p, prefix(n) + n.title, 10, C.ivory, 'semi').lineLimit = 2;
    return w;
  }

  // средний и большой: слева квадрат с псом, справа дела на сегодня в стиле приложения
  const side = family === 'large' ? 150 : 138, rows = family === 'large' ? 5 : 3;
  w.backgroundGradient = g;
  w.setPadding(10, 10, 10, 12);
  const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent();
  if (dog) { const im = row.addImage(dog); im.imageSize = new Size(side, side); im.cornerRadius = 18; im.borderWidth = 2; im.borderColor = new Color('#2B0A12'); }
  row.addSpacer(10);
  const right = row.addStack(); right.layoutVertically();

  const head = right.addStack(); head.layoutHorizontally(); head.centerAlignContent();
  label(head, 'СЕГОДНЯ · ' + (s.stale ? 'ОФЛАЙН ' : '') + hhmm(s.at), 10, C.accent, 'cond');
  head.addSpacer();
  if (s.streak) label(head, 'серия ' + s.streak + ' ' + plural(s.streak, ['день', 'дня', 'дней']), 9, C.mute);
  const num = right.addStack(); num.layoutHorizontally(); num.bottomAlignContent();
  label(num, String(s.done), 28, C.ivory, 'cond');
  label(num, ' из ' + s.total + ' сделано', 10, C.mute);
  right.addSpacer(3);
  const b = right.addImage(bar(160, 6, s.total ? s.done / s.total : 0)); b.imageSize = new Size(160, 6);
  right.addSpacer(7);

  const list = s.tasks.length ? s.tasks : s.next;
  if (!s.tasks.length && s.next.length) label(right, 'Хвосты', 9, C.mute, 'semi');
  if (!list.length) label(right, 'Дел нет. Можно выдохнуть.', 10, C.mute).lineLimit = 2;
  list.slice(0, rows).forEach(n => {
    const r = right.addStack(); r.layoutHorizontally(); r.centerAlignContent();
    label(r, n.done ? '✓ ' : '● ', 9, n.done ? C.mute : (CAT[n.cat] || C.accent));
    const t = label(r, prefix(n) + n.title, 10.5, n.done ? C.mute : C.ivory, n.done ? null : 'semi');
    t.lineLimit = 1;
    right.addSpacer(3);
  });
  return w;
}

const summary = await getSummary();
if (!summary.cancel) {
  const dog = summary.error ? null : await getDog();
  const widget = build(summary, dog, config.widgetFamily || 'small');
  if (config.runsInWidget) Script.setWidget(widget);
  else { await widget.presentMedium(); }
}
Script.complete();
