export type Status = 'idle' | 'compiling' | 'running' | 'error';

export type ServerFrame =
  | { type: 'tam'; text: string }
  | { type: 'diagnostics'; text: string }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string };

export interface Handlers {
  onFrame(frame: ServerFrame): void;
  onStatus(status: Status): void;
}

export interface Transport {
  run(source: string): void;
  sendInput(data: string): void;
  stop(): void;
}

// ---------------------------------------------------------------------------
// Mock transport: lets the UI be developed and deployed before the backend
// exists. It does not compile anything; it fabricates plausible output.
// ---------------------------------------------------------------------------

const CANNED_TAM = [
  'LOADL 0',
  'LOADL 0',
  'GETINT',
  'STORE [SB + 0]',
  'LOAD [SB + 0]',
  'PUTINT',
  'HALT',
].join('\n');

function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

function fact(n: number): number {
  return n <= 0 ? 1 : n * fact(n - 1);
}

function mockOutput(source: string, inputs: number[]): string {
  const values: string[] = [];

  if (/sqcb\s*\(/.test(source)) {
    values.push('9', '27');
  } else if (/func1\s*\(/.test(source)) {
    values.push('1', '2', '3');
  } else if (/fib\s*\(/.test(source)) {
    const n = inputs[0] ?? 10;
    for (let i = 0; i < n; i++) values.push(String(fib(i)));
  } else if (/fact\s*\(/.test(source)) {
    const n = inputs[0] ?? 5;
    for (let i = 0; i < n; i++) values.push(String(fact(i)));
  } else if (/x\s*>\s*y/.test(source)) {
    values.push(String(Math.max(inputs[0] ?? 0, inputs[1] ?? 0)));
  } else if (/x\s*\+\s*y/.test(source)) {
    values.push(String((inputs[0] ?? 0) + (inputs[1] ?? 0)));
  } else {
    values.push(...inputs.map(String));
  }

  return values.map((value) => `output > ${value}\r\n`).join('');
}

export class MockTransport implements Transport {
  private line = '';
  private inputs: number[] = [];
  private needed = 0;
  private source = '';
  private done = false;
  private timers: number[] = [];

  constructor(private readonly handlers: Handlers) {}

  run(source: string): void {
    this.stopTimers();
    this.source = source;
    this.line = '';
    this.inputs = [];
    this.done = false;
    this.needed = (source.match(/getint\s*\(/g) ?? []).length;

    this.handlers.onStatus('compiling');
    this.after(350, () => {
      this.handlers.onFrame({ type: 'tam', text: CANNED_TAM });
      this.handlers.onStatus('running');
      if (this.needed === 0) {
        this.finish();
      } else {
        this.prompt();
      }
    });
  }

  sendInput(data: string): void {
    if (this.done) return;

    for (const ch of data) {
      if (ch === '\r') {
        this.handlers.onFrame({ type: 'stdout', text: '\r\n' });
        const value = Number.parseInt(this.line.trim(), 10);
        this.line = '';
        if (!Number.isNaN(value)) this.inputs.push(value);

        if (this.inputs.length >= this.needed) {
          this.finish();
          return;
        }
        this.prompt();
      } else if (ch === '\u007f') {
        if (this.line.length > 0) {
          this.line = this.line.slice(0, -1);
          this.handlers.onFrame({ type: 'stdout', text: '\b \b' });
        }
      } else if (ch >= ' ') {
        this.line += ch;
        this.handlers.onFrame({ type: 'stdout', text: ch });
      }
    }
  }

  stop(): void {
    if (this.done) return;
    this.done = true;
    this.stopTimers();
    this.handlers.onFrame({ type: 'stdout', text: '\r\n[stopped]\r\n' });
    this.handlers.onStatus('idle');
  }

  private prompt(): void {
    this.handlers.onFrame({ type: 'stdout', text: 'Enter a number: ' });
  }

  private finish(): void {
    this.done = true;
    this.handlers.onFrame({
      type: 'stdout',
      text: mockOutput(this.source, this.inputs),
    });
    this.after(250, () => {
      this.handlers.onFrame({ type: 'exit', code: 0 });
      this.handlers.onStatus('idle');
    });
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private stopTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }
}

// ---------------------------------------------------------------------------
// Real transport: JSON frames over WSS.
// ---------------------------------------------------------------------------

export class WsTransport implements Transport {
  private ws?: WebSocket;
  private queue: string[] = [];

  constructor(
    private readonly url: string,
    private readonly handlers: Handlers,
  ) {
    this.connect();
  }

  private connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      for (const message of this.queue) ws.send(message);
      this.queue = [];
    };

    ws.onmessage = (event) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(event.data)) as ServerFrame;
      } catch {
        return;
      }

      if (frame.type === 'stdout' || frame.type === 'stderr') {
        this.handlers.onStatus('running');
      }
      this.handlers.onFrame(frame);
      if (frame.type === 'exit') this.handlers.onStatus('idle');
      if (frame.type === 'error') this.handlers.onStatus('error');
    };

    ws.onerror = () => this.handlers.onStatus('error');
    ws.onclose = () => {
      this.handlers.onStatus('idle');
      this.ws = undefined;
    };
  }

  private send(payload: unknown): void {
    const message = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.queue.push(message);
    }
  }

  run(source: string): void {
    this.handlers.onStatus('compiling');
    this.send({ type: 'run', source });
  }

  sendInput(data: string): void {
    this.send({ type: 'input', data });
  }

  stop(): void {
    this.send({ type: 'stop' });
    this.handlers.onStatus('idle');
  }
}

export function createTransport(handlers: Handlers): {
  transport: Transport;
  mode: 'mock' | 'ws';
} {
  const params = new URLSearchParams(window.location.search);
  const url = import.meta.env.VITE_WS_URL as string | undefined;

  if (params.get('mock') === '1' || !url) {
    return { transport: new MockTransport(handlers), mode: 'mock' };
  }
  return { transport: new WsTransport(url, handlers), mode: 'ws' };
}
