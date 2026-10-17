import './styles.css';
import { examples } from './examples';
import {
  createTransport,
  type ServerFrame,
  type Status,
  type Transport,
} from './session';

function el<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

async function init(): Promise<void> {
  // Lazy-load the heavy editor/terminal bundles so the shell paints first.
  const [{ mountEditor }, { mountTerminal }] = await Promise.all([
    import('./editor'),
    import('./terminal'),
  ]);

  const statusEl = el<HTMLSpanElement>('#status');
  const modeEl = el<HTMLSpanElement>('#mode');
  const tamEl = el<HTMLPreElement>('#tam');
  const examplesEl = el<HTMLSelectElement>('#examples');
  const runBtn = el<HTMLButtonElement>('#run');
  const stopBtn = el<HTMLButtonElement>('#stop');

  const setStatus = (status: Status): void => {
    statusEl.textContent = status;
    statusEl.className = `status ${status}`;
  };

  const editor = mountEditor(el('#editor'));

  let transport: Transport | null = null;

  const terminal = mountTerminal(el('#console'), (data) => {
    transport?.sendInput(data);
  });

  const handleFrame = (frame: ServerFrame): void => {
    switch (frame.type) {
      case 'tam':
        tamEl.textContent = frame.text;
        break;
      case 'diagnostics':
        if (frame.text.trim() !== '') {
          tamEl.textContent = `// diagnostics\n${frame.text}`;
          setStatus('error');
        }
        break;
      case 'stdout':
        terminal.write(frame.text);
        break;
      case 'stderr':
        terminal.write(`\x1b[31m${frame.text}\x1b[0m`);
        break;
      case 'exit':
        setStatus('idle');
        break;
      case 'error':
        terminal.write(`\r\n\x1b[31m${frame.message}\x1b[0m\r\n`);
        setStatus('error');
        break;
    }
  };

  const created = createTransport({ onFrame: handleFrame, onStatus: setStatus });
  transport = created.transport;
  modeEl.textContent = created.mode === 'mock' ? 'mock' : 'live';
  if (created.mode === 'ws') modeEl.classList.add('live');

  for (const example of examples) {
    const option = document.createElement('option');
    option.value = example.name;
    option.textContent = example.needsInput
      ? `${example.name} (needs input)`
      : example.name;
    examplesEl.appendChild(option);
  }

  const loadExample = (name: string): void => {
    const example = examples.find((candidate) => candidate.name === name);
    if (example) editor.setValue(example.source);
  };

  examplesEl.addEventListener('change', () => loadExample(examplesEl.value));

  if (examples.length > 0) {
    examplesEl.value = examples[0].name;
    loadExample(examples[0].name);
  }

  runBtn.addEventListener('click', () => {
    tamEl.textContent = '';
    terminal.clear();
    terminal.focus();
    transport?.run(editor.getValue());
  });

  stopBtn.addEventListener('click', () => {
    transport?.stop();
  });

  setStatus('idle');
}

void init();
