export const SERVICE = '65333333-a115-11e2-9e9a-0800200ca100';
export const CHARACTERISTIC = '65333333-a115-11e2-9e9a-0800200ca102';
export const CMD = Object.freeze({ PING: 0, ACTIVATE: 128, GET_ACTIVATE: 129, SET_INPUTS: 130, GET_MEASUREMENTS: 132 });

export function packet(id, command, data = []) {
  if (!Number.isInteger(id) || id < 0 || id > 255) throw new Error('ID non valido.');
  const payload = [command, ...data];
  if (payload.length > 127 || payload.some(b => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new Error('Dati del pacchetto non validi.');
  }
  return Uint8Array.from([58, 58, id, payload.length + 1, ...payload, payload.reduce((a, b) => a ^ b, 0)]);
}

export function positionBytes(position) {
  if (!Number.isInteger(position) || position < 0 || position > 32767) throw new Error('Posizione fuori intervallo.');
  return [position >> 8, position & 255];
}

export function closurePosition(percent, max) {
  if (!Number.isInteger(max) || max < 1 || max > 32767) throw new Error('Inserisci un limite verificato tra 1 e 32767.');
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Percentuale non valida.');
  return Math.floor(percent * max / 100);
}

export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();

// GATT notifications may split a frame or contain multiple complete frames.
export class FrameDecoder {
  constructor(onFrame) { this.onFrame = onFrame; this.buffer = []; }
  push(bytes) {
    this.buffer.push(...bytes);
    while (this.buffer.length >= 4) {
      if (this.buffer[0] !== 58 || this.buffer[1] !== 58) throw new Error('Intestazione risposta non valida.');
      const length = this.buffer[3];
      if (length < 2) throw new Error('Lunghezza risposta non valida.');
      if (this.buffer.length < length + 4) break;
      const frame = this.buffer.splice(0, length + 4);
      if (frame.slice(4).reduce((a, b) => a ^ b, 0) !== 0) throw new Error('Checksum risposta non valido.');
      this.onFrame({ id: frame[2], command: frame[4], data: Uint8Array.from(frame.slice(5, -1)), raw: Uint8Array.from(frame) });
    }
  }
}
