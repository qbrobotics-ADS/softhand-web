import { SERVICE, CHARACTERISTIC, CMD, packet, positionBytes, FrameDecoder, hex } from './protocol.js';

export class SoftHandBle {
  constructor({ log = () => {}, disconnected = () => {}, timeout = 3000 } = {}) {
    this.log = log;
    this.onDisconnected = disconnected;
    this.timeout = timeout;
    this.tail = Promise.resolve();
    this.id = null;
    this.device = null;
    this.io = null;
    this.pending = null;
    this.session = 0;
    this.notification = event => {
      try {
        const v = event.target.value;
        this.decoder.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      } catch (error) { this.close(error); }
    };
    this.lost = () => this.close(new Error('Connessione Bluetooth persa. Stato fisico dei motori sconosciuto.'));
  }

  async connect(bluetooth) {
    if (this.device) throw new Error('Sessione già aperta.');
    const generation = ++this.session;
    // This call must stay before any await to preserve the user's click gesture.
    const device = await bluetooth.requestDevice({
      filters: [{ services: [SERVICE] }, { namePrefix: 'SHPLUS' }], optionalServices: [SERVICE]
    });
    if (generation !== this.session) throw new Error('Connessione annullata.');
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.lost);
    this.decoder = new FrameDecoder(frame => this.receive(frame));
    this.tail = Promise.resolve();
    try {
      const server = await this.deadline(device.gatt.connect());
      const service = await this.deadline(server.getPrimaryService(SERVICE));
      const io = await this.deadline(service.getCharacteristic(CHARACTERISTIC));
      if (generation !== this.session) throw new Error('Connessione annullata.');
      if (!io.properties.write || !io.properties.notify) throw new Error('La caratteristica deve supportare Write e Notify.');
      this.io = io;
      io.addEventListener('characteristicvaluechanged', this.notification);
      await this.deadline(io.startNotifications());
      const reply = await this.enqueue(() => this.exchange(CMD.PING, [], 0));
      if (reply.id === 0 || (reply.data.length !== 0 && reply.data.length !== 4)) throw new Error('Risposta PING incompatibile.');
      this.id = reply.id;
      const motorState = await this.getMotorState();
      return { id: this.id, name: device.name || 'SoftHand+', motorState };
    } catch (error) { this.close(error); throw error; }
  }

  deadline(promise) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout Bluetooth. Riconnetti prima di riprovare.')), this.timeout);
    })]).finally(() => clearTimeout(timer));
  }

  enqueue(task) {
    const generation = this.session;
    const result = this.tail.then(async () => {
      if (generation !== this.session || !this.io || !this.device?.gatt.connected) throw new Error('Bluetooth non connesso.');
      try { return await task(); }
      catch (error) { this.close(error); throw error; }
    });
    this.tail = result.catch(() => {});
    return result;
  }

  async write(command, data = [], id = this.id) {
    if (!this.io || !this.device?.gatt.connected) throw new Error('Bluetooth non connesso.');
    const bytes = packet(id, command, data);
    this.log('TX', hex(bytes));
    const io = this.io;
    // Older iOS BLE browsers expose only writeValue; the characteristic has Write (with response).
    const operation = typeof io.writeValueWithResponse === 'function'
      ? io.writeValueWithResponse(bytes) : io.writeValue(bytes);
    await this.deadline(operation);
  }

  async exchange(command, data = [], id = this.id) {
    let timer;
    let pending;
    const response = new Promise((resolve, reject) => {
      pending = { id, command, resolve, reject };
      this.pending = pending;
      timer = setTimeout(() => reject(new Error('Nessuna risposta dalla mano. Riconnetti.')), this.timeout);
    });
    // Attach both handlers before writing: a reply can arrive before the GATT acknowledgement.
    try { const [, reply] = await Promise.all([this.write(command, data, id), response]); return reply; }
    finally { clearTimeout(timer); if (this.pending === pending) this.pending = null; }
  }

  receive(frame) {
    this.log('RX', hex(frame.raw));
    const p = this.pending;
    if (!p || frame.command !== p.command || (p.id !== 0 && frame.id !== p.id)) return;
    p.resolve(frame);
  }

  async readMotorState() {
    const frame = await this.exchange(CMD.GET_ACTIVATE);
    if (frame.data.length !== 1 || frame.data[0] > 3) throw new Error('Stato motori non valido.');
    return frame.data[0];
  }

  getMotorState() { return this.enqueue(() => this.readMotorState()); }

  getPositions() {
    return this.enqueue(async () => {
      const { data } = await this.exchange(CMD.GET_MEASUREMENTS);
      if (!data.length || data.length % 2 !== 0) throw new Error('Risposta encoder non valida.');
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      return Array.from({ length: data.length / 2 }, (_, index) => view.getInt16(index * 2));
    });
  }

  enable(isCurrent = () => true) {
    return this.enqueue(async () => {
      // Set an explicit opening reference before enabling instead of reusing an unknown old target.
      if (!isCurrent()) return null;
      await this.write(CMD.SET_INPUTS, positionBytes(0));
      if (!isCurrent()) return null;
      await this.write(CMD.ACTIVATE, [3]);
      if (!isCurrent()) return null;
      const state = await this.readMotorState();
      if (state === 0) throw new Error('Abilitazione non confermata dalla mano.');
      return state;
    });
  }

  disable() {
    return this.enqueue(async () => {
      await this.write(CMD.ACTIVATE, [0]);
      const state = await this.readMotorState();
      if (state !== 0) throw new Error('Disabilitazione non confermata dalla mano.');
      return state;
    });
  }

  setPosition(position) {
    const bytes = positionBytes(position);
    return this.enqueue(() => this.write(CMD.SET_INPUTS, bytes));
  }

  close(error = new Error('Sessione chiusa. Stato fisico dei motori sconosciuto.')) {
    const wasOpen = !!this.device;
    ++this.session;
    this.pending?.reject(error);
    this.pending = null;
    this.io?.removeEventListener('characteristicvaluechanged', this.notification);
    this.device?.removeEventListener('gattserverdisconnected', this.lost);
    if (this.device?.gatt.connected) this.device.gatt.disconnect();
    this.io = null;
    this.device = null;
    this.id = null;
    if (wasOpen) this.onDisconnected(error);
  }
}
