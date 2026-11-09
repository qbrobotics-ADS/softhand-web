import { SoftHandBle } from './ble.js?v=4';
import { closurePosition } from './protocol.js?v=4';
import { english } from './translations.js?v=5';

const $ = id => document.getElementById(id);
const MAX_POSITION = 19000;
const quickPositions = [25, 50, 75];
const TELEMETRY_DELAY = 250;
const DIAGNOSTIC_LIMIT = 1000;
const motorActive = () => motor !== null && motor > 0;
let connected = false, busy = false, motor = null, epoch = 0;
let liveSession = null, liveTimer, samplePending = false, lastDevice = null;
const diagnostics = [];
const supported = window.isSecureContext && !!navigator.bluetooth?.requestDevice;
function readPreference(key) {
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}
function savePreference(key, value) {
  try { window.localStorage.setItem(key, value); }
  catch { /* Preferences still work for the current page. */ }
}
let language = readPreference('softhand-language') === 'en' ? 'en' : 'it';
let theme = readPreference('softhand-theme') === 'dark' ? 'dark' : 'light';
const localized = new Map();

function translate(source, values = {}) {
  const template = language === 'en' && Object.hasOwn(english, source) ? english[source] : source;
  return template.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(values, key) ? values[key] : token);
}
function localize(element, format) {
  localized.set(element, format);
  element.textContent = format();
}
function message(id, source, values) {
  localize($(id), () => translate(source, values));
}
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = language === 'en' ? 'SoftHand+ · BLE control' : 'SoftHand+ · Controllo BLE';
  const toggle = $('language');
  toggle.textContent = language === 'en' ? 'IT' : 'EN';
  toggle.lang = language === 'en' ? 'it' : 'en';
  toggle.setAttribute('aria-label', language === 'en' ? 'Passa all’italiano' : 'Switch to English');
  $('log').setAttribute('aria-label', language === 'en' ? 'Communication log' : 'Registro comunicazione');
  for (const [element, format] of localized) element.textContent = format();
  applyTheme();
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  $('theme').textContent = language === 'en'
    ? (dark ? 'Light mode' : 'Dark mode')
    : (dark ? 'Tema chiaro' : 'Tema scuro');
}

function recordDiagnostic(entry) {
  diagnostics.push({ timestamp: new Date().toISOString(), ...entry });
  if (diagnostics.length > DIAGNOSTIC_LIMIT) diagnostics.shift();
  $('downloadLog').disabled = false;
  $('downloadMeasurements').disabled = !diagnostics.some(event => event.kind === 'telemetry');
}

const log = (kind, source, values) => {
  recordDiagnostic({ kind, message: translate(source, values) });
  const list = $('log');
  const placeholder = list.querySelector('.empty');
  if (placeholder) {
    localized.delete(placeholder.querySelector('[data-en]'));
    placeholder.remove();
  }
  const row = document.createElement('li');
  const time = document.createElement('time');
  const timestamp = new Date();
  localize(time, () => timestamp.toLocaleTimeString(language === 'en' ? 'en-GB' : 'it-IT'));
  const text = document.createElement('span');
  localize(text, () => `${translate(kind)} · ${translate(source, values)}`);
  row.append(time, text);
  list.append(row);
  while (list.children.length > 100) removeLogRow(list.firstChild);
  list.scrollTop = list.scrollHeight;
};
function removeLogRow(row) {
  for (const child of row.children) localized.delete(child);
  row.remove();
}
function status(source, error = false, values) {
  message('status', source, values);
  $('status').classList.toggle('error', error);
}
const ble = new SoftHandBle({ log, disconnected: error => {
  ++epoch; connected = false; busy = false; motor = null;
  stopTelemetry();
  message('deviceName', 'La tua SoftHand+');
  message('deviceDetail', 'Connessione chiusa. Per continuare, riconnetti.');
  $('deviceId').textContent = '—';
  message('lastReference', 'Riferimento e stato fisico non verificati dopo la disconnessione.');
  message('measuredPosition', 'Nessuna lettura encoder.');
  message('measuredCurrent', 'Nessuna lettura corrente.');
  $('consent').checked = false;
  status(error.message, true); log('BLE', error.message); render();
} });

function render() {
  const consent = $('consent').checked;
  const ready = connected && !busy;
  const movable = ready && consent && motorActive();
  $('connect').disabled = !supported || connected || busy;
  $('disconnect').disabled = !connected || busy;
  $('enable').disabled = !ready || !consent || motor !== 0;
  $('disable').disabled = !connected;
  $('open').disabled = !movable;
  // Choosing a percentage is harmless; only sending requires a verified position limit.
  $('closure').disabled = !movable;
  for (const id of ['send', 'close']) $(id).disabled = !movable;
  for (const percent of quickPositions) $(`preset${percent}`).disabled = busy;
  $('readPosition').disabled = !ready && liveSession === null;
  message('readPosition', liveSession ? 'Ferma lettura' : 'Avvia lettura posizione e corrente');
  $('readPosition').setAttribute('aria-pressed', String(liveSession !== null));
  $('getInfo').disabled = !ready;
  $('consent').disabled = busy;
  message('motorState', motor === null ? 'Sconosciuto' : motorActive() ? 'Abilitati' : 'Disabilitati');
  message('connectionBadge', connected ? 'Connessa' : busy ? 'Connessione…' : 'Offline');
  $('connectionBadge').classList.toggle('connected', connected);
  $('percentage').replaceChildren(document.createTextNode($('closure').value), Object.assign(document.createElement('span'), { textContent: '%' }));
  let blocker = '';
  if (!connected) blocker = 'Connetti la mano per abilitare il cursore.';
  else if (busy) blocker = 'Operazione in corso. Attendi il completamento.';
  else if (!consent) blocker = 'Conferma che la mano è libera e configurata per il controllo in posizione.';
  else if (!motorActive()) blocker = 'Abilita i motori per usare il cursore.';
  message('targetDetail', blocker || 'Riferimento: {position} unità. Premi “Invia posizione” per muovere la mano.', {
    position: closurePosition(Number($('closure').value), MAX_POSITION)
  });
}

async function action(message, task) {
  const token = ++epoch;
  busy = true; status(message); render();
  const isCurrent = () => token === epoch;
  try { await task(isCurrent); }
  catch (error) { if (isCurrent()) { status(error.message, true); log('ERRORE', error.message); } }
  finally { if (isCurrent()) { busy = false; render(); } }
}

$('connect').addEventListener('click', () => {
  action('Ricerca e verifica del dispositivo…', async isCurrent => {
    const result = await ble.connect(navigator.bluetooth);
    if (!isCurrent()) return;
    connected = true; motor = result.motorState;
    lastDevice = { id: result.id, name: result.name };
    localized.delete($('deviceName'));
    $('deviceName').textContent = result.name;
    message('deviceDetail', 'PING e lettura dello stato motori completati.');
    $('deviceId').textContent = `${result.id} (0x${result.id.toString(16).padStart(2, '0').toUpperCase()})`;
    status('Connessione verificata. Controlla la configurazione prima di muovere la mano.');
    log('BLE', 'Connessa a {name}, ID {id}.', { name: result.name, id: result.id });
  });
});
$('disconnect').addEventListener('click', () => ble.close());
$('enable').addEventListener('click', () => action('Impostazione apertura e abilitazione motori…', async isCurrent => {
  const state = await ble.enable(isCurrent);
  if (!isCurrent() || state === null) return;
  motor = state;
  message('lastReference', 'Ultimo riferimento inviato: {position} unità.', { position: 0 });
  status('Motori abilitati: stato confermato dalla mano. Riferimento di apertura inviato.');
}));
$('disable').addEventListener('click', () => action('Disabilitazione motori…', async isCurrent => {
  const state = await ble.disable();
  if (!isCurrent()) return;
  motor = state; status('Motori disabilitati: stato confermato dalla mano.');
}));
function move(percent) {
  if (!connected || busy || !motorActive() || !$('consent').checked) return;
  const position = percent === 0 ? 0 : closurePosition(percent, MAX_POSITION);
  action('Invio riferimento di posizione…', async isCurrent => {
    await ble.setPosition(position);
    if (!isCurrent()) return;
    $('closure').value = percent;
    message('lastReference', 'Ultimo riferimento inviato: {position} unità.', { position });
    status('Riferimento {position} inviato.', false, { position });
  });
}
$('open').addEventListener('click', () => move(0));
$('close').addEventListener('click', () => move(100));
$('send').addEventListener('click', () => move(Number($('closure').value)));
for (const percent of quickPositions) {
  $(`preset${percent}`).addEventListener('click', () => {
    if (busy) return;
    $('closure').value = percent;
    render();
  });
}
function stopTelemetry() {
  liveSession = null;
  window.clearTimeout(liveTimer);
}

async function pollTelemetry() {
  const session = liveSession;
  if (!session || samplePending) return;
  if (!busy && !document.hidden) {
    samplePending = true;
    try {
      const sample = await ble.getTelemetry();
      if (liveSession === session) {
        message('measuredPosition', 'Ultima lettura encoder (unità): {positions}.', { positions: sample.positions.join(', ') });
        message('measuredCurrent', 'Ultima lettura corrente (mA): {currents}.', { currents: sample.currents.join(', ') });
        recordDiagnostic({ kind: 'telemetry', ...sample });
      }
    } catch (error) {
      if (liveSession === session) {
        stopTelemetry();
        status(error.message, true);
        log('ERRORE', error.message);
        render();
      }
    } finally {
      samplePending = false;
    }
  }
  if (liveSession) liveTimer = window.setTimeout(pollTelemetry, TELEMETRY_DELAY);
}

$('readPosition').addEventListener('click', () => {
  if (liveSession) {
    stopTelemetry();
    status('Lettura continua fermata.');
  } else {
    if (!connected || busy) return;
    liveSession = {};
    status('Lettura continua attiva.');
    void pollTelemetry();
  }
  render();
});
$('getInfo').addEventListener('click', () => {
  if (!connected || busy) return;
  action('Lettura informazioni dispositivo…', async isCurrent => {
    const info = await ble.getInfo(isCurrent);
    if (!isCurrent() || info === null) return;
    log('INFO', info);
    status('Informazioni dispositivo aggiunte al log.');
  });
});
for (const id of ['consent', 'closure']) $(id).addEventListener('input', render);
$('clearLog').addEventListener('click', () => {
  const list = $('log');
  const placeholder = list.querySelector('.empty');
  if (placeholder) localized.delete(placeholder.querySelector('[data-en]'));
  while (list.firstChild) removeLogRow(list.firstChild);
  diagnostics.length = 0;
  $('downloadLog').disabled = true;
  $('downloadMeasurements').disabled = true;
});

function downloadFile(content, type, name, exportedAt) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `softhand-${exportedAt.replace(/[:.]/g, '-')}-${name}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('downloadLog').addEventListener('click', () => {
  if (!diagnostics.length) return;
  const exportedAt = new Date().toISOString();
  const device = lastDevice ? `${lastDevice.name} (ID ${lastDevice.id})` : '—';
  const lines = [
    'SoftHand+ · Log',
    `${translate('Esportato il')}: ${exportedAt}`,
    `${translate('Ultimo dispositivo')}: ${device}`,
    '',
    ...diagnostics.map(entry => {
      const detail = entry.kind === 'telemetry'
        ? translate('Encoder (unità): {positions} | Corrente (mA): {currents}', {
          positions: entry.positions.join(', '), currents: entry.currents.join(', ')
        })
        : entry.message;
      return `[${entry.timestamp}] ${entry.kind.toUpperCase()} · ${detail}`;
    })
  ];
  downloadFile(lines.join('\r\n') + '\r\n', 'text/plain;charset=utf-8', 'log.txt', exportedAt);
});

$('downloadMeasurements').addEventListener('click', () => {
  const samples = diagnostics.filter(entry => entry.kind === 'telemetry');
  if (!samples.length) return;
  const start = Date.parse(samples[0].timestamp);
  const encoderCount = Math.max(...samples.map(sample => sample.positions.length));
  const encoderColumns = Array.from({ length: encoderCount }, (_, index) => `encoder_${index + 1}`);
  const rows = [
    ['timestamp_utc', 'elapsed_ms', 'current_1_mA', 'current_2_mA', ...encoderColumns],
    ...samples.map(sample => [
      sample.timestamp, Date.parse(sample.timestamp) - start, ...sample.currents,
      ...encoderColumns.map((_, index) => sample.positions[index] ?? '')
    ])
  ];
  const csv = rows.map(row => row.join(',')).join('\r\n') + '\r\n';
  downloadFile(csv, 'text/csv;charset=utf-8', 'measurements.csv', new Date().toISOString());
});
$('language').addEventListener('click', () => {
  language = language === 'it' ? 'en' : 'it';
  savePreference('softhand-language', language);
  applyLanguage();
});
$('theme').addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  savePreference('softhand-theme', theme);
  applyTheme();
});
window.addEventListener('pagehide', () => {
  stopTelemetry();
  ble.close();
});

for (const element of document.querySelectorAll('[data-en]')) {
  const italian = element.textContent;
  localize(element, () => language === 'en' ? element.dataset.en : italian);
}
message('deviceName', 'La tua SoftHand+');
message('deviceDetail', 'Accendi la mano e avvicinala al dispositivo.');
message('lastReference', 'Nessun riferimento inviato.');
message('measuredPosition', 'Nessuna lettura encoder.');
message('measuredCurrent', 'Nessuna lettura corrente.');
status('Pronto per la connessione.');
applyLanguage();

if (supported) {
  message('compatibility', 'API Bluetooth disponibile. Collega una sola app alla mano e mantieni questa pagina in primo piano.');
} else {
  $('compatibility').classList.add('unsupported');
  message('compatibility', !window.isSecureContext
    ? 'Apri la pagina tramite HTTPS o localhost: il Bluetooth non è disponibile su HTTP remoto.'
    : 'Questo browser non espone Web Bluetooth. Su iPhone prova Bluefy; su Android usa Chrome. Safari non supporta direttamente il collegamento.');
}
render();
