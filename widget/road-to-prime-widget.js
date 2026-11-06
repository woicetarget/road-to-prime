// RTP-WIDGET v2: основной код виджета Road to Prime. Его подтягивает загрузчик loader.js.
// Крупный пёс на фоне, задачи мелким шрифтом. Данные читаются из закрытого Gist road-to-prime.json, ничего не записывается.

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
const dogPath = fm.joinPath(fm.documentsDirectory(), 'rtp_dog_close.png');

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
  try { const img = await new Request(APP_URL + 'dog-close.png').loadImage(); fm.writeImage(dogPath, img); return img; }
  catch (e) { return fm.fileExists(dogPath) ? fm.readImage(dogPath) : null; }
}

function label(stack, text, size, color, weight) {
  const t = stack.addText(text);
  t.font = weight === 'bold' ? Font.boldSystemFont(size) : weight === 'semi' ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color || C.ivory);
  return t;
}
function plate(parent) {
  const s = parent.addStack(); s.layoutVertically();
  s.setPadding(5, 8, 5, 8); s.cornerRadius = 10; s.backgroundColor = new Color(C.bg1, 0.74);
  return s;
}
function taskText(n) { return (n.big ? 'Кабан: ' : n.rat ? 'Крыса: ' : '') + n.title; }

function build(s, dog, family) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const g = new LinearGradient(); g.colors = [new Color(C.bg1), new Color(C.bg2)]; g.locations = [0, 1];

  if (s.error) {
    w.backgroundGradient = g; w.setPadding(14, 14, 12, 14);
    label(w, 'ROAD TO PRIME', 10, C.accent, 'bold'); w.addSpacer(8);
    label(w, s.error, 11, C.ivory).lineLimit = 5;
    return w;
  }
  if (family === 'accessoryRectangular' || family === 'accessoryInline') {
    label(w, 'Road to Prime', 11, C.ivory, 'bold');
    label(w, 'Сегодня ' + s.done + ' из ' + s.total, 13, C.ivory, 'semi');
    const n = s.next[0]; label(w, n ? n.title : 'Дел нет', 11, C.ivory).lineLimit = 1;
    return w;
  }

  const medium = family === 'medium' || family === 'large';
  if (!medium) {
    // маленький: пёс на весь фон, сверху счётчик, снизу плашка с делом
    if (dog) w.backgroundImage = dog; else w.backgroundGradient = g;
    w.setPadding(8, 8, 8, 8);
    const row = w.addStack(); row.layoutHorizontally();
    const chip = row.addStack(); chip.layoutHorizontally(); chip.centerAlignContent();
    chip.setPadding(3, 8, 3, 8); chip.cornerRadius = 10; chip.backgroundColor = new Color(C.bg1, 0.74);
    label(chip, s.done + '/' + s.total, 16, C.ivory, 'bold');
    if (s.stale) label(chip, ' офлайн', 8, C.mute);
    row.addSpacer();
    w.addSpacer();
    const p = plate(w);
    const n = s.next[0];
    if (!n) { label(p, 'Дел на сегодня нет', 10, C.ivory, 'semi'); return w; }
    label(p, 'Дальше', 8, C.accent, 'bold');
    label(p, taskText(n), 10, C.ivory, 'semi').lineLimit = 2;
    return w;
  }

  // средний и большой: слева текст, справа крупный пёс
  w.backgroundGradient = g;
  w.setPadding(10, 12, 10, 10);
  const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent();
  const left = row.addStack(); left.layoutVertically();
  label(left, 'ROAD TO PRIME' + (s.stale ? ' · офлайн' : ''), 8, C.accent, 'bold');
  left.addSpacer(2);
  const head = left.addStack(); head.layoutHorizontally(); head.bottomAlignContent();
  label(head, s.done + '/' + s.total, 24, C.ivory, 'bold');
  head.addSpacer(6);
  label(head, 'сегодня' + (s.streak ? ' · серия ' + s.streak + ' ' + plural(s.streak, ['день', 'дня', 'дней']) : ''), 9, C.mute);
  left.addSpacer(7);
  if (!s.next.length) label(left, 'Дел на сегодня нет. Можно выдохнуть.', 10, C.mute).lineLimit = 2;
  s.next.forEach((n, i) => {
    const t = label(left, '• ' + taskText(n), i === 0 ? 10.5 : 10, i === 0 ? C.ivory : C.mute, i === 0 ? 'semi' : null);
    t.lineLimit = i === 0 ? 2 : 1;
    left.addSpacer(3);
  });
  row.addSpacer();
  if (dog) { const im = row.addImage(dog); im.imageSize = new Size(136, 136); im.cornerRadius = 16; }
  return w;
}

const summary = await getSummary();
const dog = summary.error ? null : await getDog();
const widget = build(summary, dog, config.widgetFamily || 'small');
if (config.runsInWidget) Script.setWidget(widget);
else { await widget.presentMedium(); }
Script.complete();
