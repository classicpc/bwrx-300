/**
 * Hardware-in-the-loop link over USB serial using the browser Web Serial API
 * (Chrome / Edge desktop). The link carries newline-delimited JSON:
 *
 *   device → simulator : {"hb":12,"rod":55.0,"scram":0,"pumpA":1,"pumpB":1,"turbine":1,"valve":68,"temp":23.4}
 *   simulator → device : {"t":12.3,"pwr":42.1,"rod":58.0,"tc":274.0,"p":7.00,"lvl":70.0,"rpm":1800,"mwe":37.9,"scram":0,"alarm":0,"status":"NORMAL"}
 *
 * Every field is optional; values are validated and clamped by the control layer
 * before they reach the simulation. The prototype only drives LEDs, displays and
 * servos — it must never be connected to real plant equipment.
 */
import { z } from "zod";

export const HilInputSchema = z.object({
  hb: z.number().int().nonnegative().optional(),
  rod: z.number().finite().min(0).max(100).optional(),
  scram: z.union([z.literal(0), z.literal(1), z.boolean()]).optional(),
  pumpA: z.union([z.literal(0), z.literal(1), z.boolean()]).optional(),
  pumpB: z.union([z.literal(0), z.literal(1), z.boolean()]).optional(),
  turbine: z.union([z.literal(0), z.literal(1), z.boolean()]).optional(),
  valve: z.number().finite().min(0).max(100).optional(),
  temp: z.number().finite().min(-40).max(150).optional(),
}).strict();
export type HilInput = z.infer<typeof HilInputSchema>;

export interface HilStatus {
  supported: boolean;
  connected: boolean;
  connecting: boolean;
  baudRate: number;
  portLabel: string;
  lastRx: string;
  lastTx: string;
  lastRxAt: number | null;
  lastTxAt: number | null;
  rxCount: number;
  txCount: number;
  errorCount: number;
  lastError: string;
  physicalTemp: number | null;
}

export const HEARTBEAT_TIMEOUT_MS = 3000;
export const BAUD_RATES = [9600, 57600, 115200] as const;

// Minimal Web Serial typings (not part of the default DOM lib).
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike { requestPort(): Promise<SerialPortLike> }

function getSerial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as unknown as { serial?: SerialLike }).serial ?? null;
}

export const initialHilStatus = (): HilStatus => ({
  supported: false, connected: false, connecting: false, baudRate: 115200, portLabel: "—",
  lastRx: "", lastTx: "", lastRxAt: null, lastTxAt: null, rxCount: 0, txCount: 0, errorCount: 0, lastError: "", physicalTemp: null,
});

export class HilSerialLink {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private status: HilStatus = { ...initialHilStatus(), supported: !!getSerial() };
  private encoder = new TextEncoder();

  constructor(private onStatus: (s: HilStatus) => void, private onInput: (input: HilInput) => void, private onLog: (message: string) => void) {
    this.onStatus(this.status);
  }

  private update(patch: Partial<HilStatus>) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.status);
  }

  private error(message: string) {
    this.update({ errorCount: this.status.errorCount + 1, lastError: message });
  }

  async connect(baudRate: number) {
    const serial = getSerial();
    if (!serial) { this.error("Web Serial is not available in this browser. Use desktop Chrome or Edge, opened in its own tab."); return; }
    if (this.status.connected || this.status.connecting) return;
    this.update({ connecting: true, baudRate });
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate });
      this.port = port;
      const info = port.getInfo?.() ?? {};
      const label = info.usbVendorId ? `USB ${info.usbVendorId.toString(16).padStart(4, "0")}:${(info.usbProductId ?? 0).toString(16).padStart(4, "0")}` : "Serial port";
      this.writer = port.writable?.getWriter() ?? null;
      this.update({ connected: true, connecting: false, portLabel: label, lastError: "" });
      this.onLog(`HIL serial link opened (${label}, ${baudRate} baud)`);
      void this.readLoop();
    } catch (e) {
      this.update({ connecting: false });
      const message = e instanceof Error ? e.message : String(e);
      if (!/No port selected/i.test(message)) this.error(`Connect failed: ${message}`);
    }
  }

  private async readLoop() {
    if (!this.port?.readable) return;
    const decoder = new TextDecoder();
    let buffer = "";
    this.reader = this.port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index = buffer.indexOf("\n");
        while (index >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) this.handleLine(line);
          index = buffer.indexOf("\n");
        }
        if (buffer.length > 1024) { buffer = ""; this.error("Discarded oversized frame (>1 KB without newline)"); }
      }
    } catch (e) {
      this.error(`Read error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.reader?.releaseLock();
      this.reader = null;
      if (this.status.connected) await this.disconnect("Device disconnected");
    }
  }

  private handleLine(line: string) {
    this.update({ lastRx: line.slice(0, 160), lastRxAt: Date.now(), rxCount: this.status.rxCount + 1 });
    let json: unknown;
    try { json = JSON.parse(line); } catch { this.error("Malformed frame (not JSON)"); return; }
    const parsed = HilInputSchema.safeParse(json);
    if (!parsed.success) { this.error(`Invalid frame: ${parsed.error.issues[0]?.path.join(".") || "field"} ${parsed.error.issues[0]?.message ?? ""}`); return; }
    if (parsed.data.temp !== undefined) this.update({ physicalTemp: parsed.data.temp });
    this.onInput(parsed.data);
  }

  async send(frame: Record<string, unknown>) {
    if (!this.writer || !this.status.connected) return;
    const line = JSON.stringify(frame);
    try {
      await this.writer.write(this.encoder.encode(line + "\n"));
      this.update({ lastTx: line.slice(0, 160), lastTxAt: Date.now(), txCount: this.status.txCount + 1 });
    } catch (e) {
      this.error(`Write error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async disconnect(reason = "Operator closed the HIL link") {
    const wasConnected = this.status.connected;
    this.update({ connected: false, connecting: false });
    try { await this.reader?.cancel(); } catch { /* already closed */ }
    try { this.writer?.releaseLock(); } catch { /* already released */ }
    try { await this.port?.close(); } catch { /* port already closed */ }
    this.reader = null; this.writer = null; this.port = null;
    if (wasConnected) this.onLog(`HIL serial link closed — ${reason}. Continuing in software-only mode.`);
  }
}

export const truthy = (v: 0 | 1 | boolean | undefined) => v === true || v === 1;
