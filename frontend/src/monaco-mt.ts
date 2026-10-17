import * as monaco from 'monaco-editor/editor/editor.api';

let registered = false;

/** Register the `mt` language once with Monaco. */
export function registerMtLanguage(): void {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: 'mt' });

  monaco.languages.setMonarchTokensProvider('mt', {
    keywords: [
      'let',
      'in',
      'var',
      'fun',
      'if',
      'then',
      'else',
      'while',
      'do',
      'begin',
      'end',
      'getint',
      'printint',
      'true',
      'false',
      'Integer',
      'Boolean',
    ],
    operators: [
      '+',
      '-',
      '*',
      '/',
      '&&',
      '||',
      '!',
      '<',
      '<=',
      '>',
      '>=',
      '==',
      '!=',
      '?',
      ':',
      ':=',
      '=',
    ],
    tokenizer: {
      root: [
        [
          /[A-Za-z_]\w*/,
          { cases: { '@keywords': 'keyword', '@default': 'identifier' } },
        ],
        [/\d+/, 'number'],
        [
          /[=><!~?:&|+\-*/]+/,
          { cases: { '@operators': 'operator', '@default': '' } },
        ],
        [/[()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('mt', {
    brackets: [
      ['(', ')'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
    ],
  });
}
