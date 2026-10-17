import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  write(text: string): void;
  clear(): void;
  focus(): void;
  dispose(): void;
}

export function mountTerminal(
  el: HTMLElement,
  onData: (data: string) => void,
): TerminalHandle {
  const term = new Terminal({
    cursorBlink: true,
    convertEol: false,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
    },
  });

  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el);
  fit.fit();

  const observer = new ResizeObserver(() => {
    try {
      fit.fit();
    } catch {
      // The pane can be zero-sized transiently; ignore.
    }
  });
  observer.observe(el);

  const dataSub = term.onData(onData);

  return {
    write: (text) => term.write(text),
    clear: () => term.clear(),
    focus: () => term.focus(),
    dispose: () => {
      observer.disconnect();
      dataSub.dispose();
      term.dispose();
    },
  };
}
