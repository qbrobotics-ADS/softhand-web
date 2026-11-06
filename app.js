import { SoftHandBle } from './ble.js';
import { closurePosition } from './protocol.js';

const $ = id => document.getElementById(id);
const MAX_POSITION = 19000;
const motorActive = () => motor !== null && motor > 0;
let connected = false, busy = false, motor = null, epoch = 0;
const supported = window.isSecureContext && !!navigator.bluetooth?.requestDevice;
const log = (kind, message) => {
  const list = $('log');
  list.querySelector('.empty')?.remove();
  const row = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('it-IT');
  const text = document.createElement('span');
  text.textContent = `${kind} · ${message}`;
  row.append(time, text);
  list.append(row);
  while (list.children.length > 100) list.firstChild.remove();
  list.scrollTop = list.scrollHeight;
};
function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
const ble = new SoftHandBle({ log, disconnected: error => {
  ++epoch; connected = false; busy = false; motor = null;
  $('deviceName').textContent = 'La tua SoftHand+';
  $('deviceDetail').textContent = 'Connessione chiusa. Per continuare, riconnetti.';
  $('deviceId').textContent = '—';
  $('lastReference').textContent = 'Riferimento e stato fisico non verificati dopo la disconnessione.';
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
  $('consent').disabled = busy;
  $('motorState').textContent = motor === null ? 'Sconosciuto' : motorActive() ? 'Abilitati' : 'Disabilitati';
  $('connectionBadge').textContent = connected ? 'Connessa' : busy ? 'Connessione…' : 'Offline';
  $('connectionBadge').classList.toggle('connected', connected);
  $('percentage').replaceChildren(document.createTextNode($('closure').value), Object.assign(document.createElement('span'), { textContent: '%' }));
  let blocker = '';
  if (!connected) blocker = 'Connetti la mano per abilitare il cursore.';
  else if (busy) blocker = 'Operazione in corso. Attendi il completamento.';
  else if (!consent) blocker = 'Conferma che la mano è libera e configurata per il controllo in posizione.';
  else if (!motorActive()) blocker = 'Abilita i motori per usare il cursore.';
  $('targetDetail').textContent = blocker || `Riferimento: ${closurePosition(Number($('closure').value), MAX_POSITION)} unità. Premi “Invia posizione” per muovere la mano.`;
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
    $('deviceName').textContent = result.name;
    $('deviceDetail').textContent = 'PING e lettura dello stato motori completati.';
    $('deviceId').textContent = `${result.id} (0x${result.id.toString(16).padStart(2, '0').toUpperCase()})`;
    status('Connessione verificata. Controlla la configurazione prima di muovere la mano.');
    log('BLE', `Connessa a ${result.name}, ID ${result.id}.`);
  });
});
$('disconnect').addEventListener('click', () => ble.close());
$('enable').addEventListener('click', () => action('Impostazione apertura e abilitazione motori…', async isCurrent => {
  const state = await ble.enable(isCurrent);
  if (!isCurrent() || state === null) return;
  motor = state;
  $('lastReference').textContent = 'Ultimo riferimento inviato: 0 (apertura). Posizione reale non misurata.';
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
    $('lastReference').textContent = `Ultimo riferimento inviato: ${position} unità. Posizione reale non misurata.`;
    status(`Riferimento ${position} inviato via GATT. Il raggiungimento della posizione non è verificato.`);
  });
}
$('open').addEventListener('click', () => move(0));
$('close').addEventListener('click', () => move(100));
$('send').addEventListener('click', () => move(Number($('closure').value)));
for (const id of ['consent', 'closure']) $(id).addEventListener('input', render);
$('clearLog').addEventListener('click', () => { $('log').replaceChildren(); });
window.addEventListener('pagehide', () => ble.close());

if (supported) {
  $('compatibility').textContent = 'API Bluetooth disponibile. Collega una sola app alla mano e mantieni questa pagina in primo piano.';
} else {
  $('compatibility').classList.add('unsupported');
  $('compatibility').textContent = !window.isSecureContext
    ? 'Apri la pagina tramite HTTPS o localhost: il Bluetooth non è disponibile su HTTP remoto.'
    : 'Questo browser non espone Web Bluetooth. Su iPhone prova Bluefy; su Android usa Chrome. Safari non supporta direttamente il collegamento.';
}
render();
