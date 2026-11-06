// Road to Prime: загрузчик виджета для Scriptable. Вставь этот текст один раз.
// Сам виджет подтягивается с твоего сайта на GitHub Pages при каждом запуске,
// поэтому правки внешнего вида приходят без повторной вставки. Без интернета работает последняя загруженная копия.
const URL = 'https://woicetarget.github.io/road-to-prime/widget/road-to-prime-widget.js';
const fm = FileManager.local();
const cache = fm.joinPath(fm.documentsDirectory(), 'rtp_widget_code.js');
let code = null;
try {
  const fresh = await new Request(URL + '?t=' + Date.now()).loadString();
  if (fresh && fresh.includes('RTP-WIDGET')) { code = fresh; fm.writeString(cache, fresh); }
} catch (e) {}
if (!code && fm.fileExists(cache)) code = fm.readString(cache);
if (!code) {
  const w = new ListWidget();
  w.addText('Road to Prime: нет связи, виджет ещё не загружался');
  if (config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
} else {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(code)();
}
Script.complete();
