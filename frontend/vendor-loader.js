// Ленивая загрузка тяжёлых vendor-библиотек.
// pdf.js / epub.js / chart.js не входят в критический путь первой загрузки.
const _vendorLoaded = {};

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (_vendorLoaded[src]) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => { _vendorLoaded[src] = true; resolve(); };
    script.onerror = () => reject(new Error('Не удалось загрузить ' + src));
    document.head.appendChild(script);
  });
}

function _loadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function ensurePdfLoaded() {
  if (typeof pdfjsLib === 'undefined') {
    await _loadScript('vendor/pdf.min.js');
  }
  _loadCss('vendor/pdf_viewer.min.css');
  if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
  }
}

async function ensureEpubLoaded() {
  if (typeof ePub === 'undefined') {
    await _loadScript('vendor/epub.min.js');
  }
}

async function ensureChartLoaded() {
  if (typeof Chart === 'undefined') {
    await _loadScript('vendor/chart.umd.min.js');
  }
}

// Сохраняем настройку для случая, когда pdf.js был загружен раньше этого файла.
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}
