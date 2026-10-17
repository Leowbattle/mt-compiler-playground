import * as monaco from 'monaco-editor/editor/editor.api';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { registerMtLanguage } from './monaco-mt';

// Monaco needs a worker. We only use the core editor features, so the single
// generic editor worker is enough.
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

registerMtLanguage();

export interface EditorHandle {
  getValue(): string;
  setValue(value: string): void;
  focus(): void;
  dispose(): void;
}

export function mountEditor(el: HTMLElement): EditorHandle {
  const editor = monaco.editor.create(el, {
    value: '',
    language: 'mt',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    tabSize: 2,
    renderLineHighlight: 'line',
  });

  return {
    getValue: () => editor.getValue(),
    setValue: (value) => editor.setValue(value),
    focus: () => editor.focus(),
    dispose: () => editor.dispose(),
  };
}
