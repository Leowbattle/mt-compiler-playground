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
// Transport: JSON frames over WSS.
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

export function createTransport(handlers: Handlers): Transport {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const url =
    envUrl ??
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  return new WsTransport(url, handlers);
}
