export const haskellConfiguration = {
  comments: { lineComment: '--', blockComment: ['{-', '-}'] },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '{-', close: ' -}', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  indentationRules: {
    increaseIndentPattern: /(\b(?:where|let|do|of)|[=(\[{,]|->)\s*$/,
    decreaseIndentPattern: /^\s*[)\]}]/,
  },
}

export const haskellTokens = {
  defaultToken: '',
  tokenPostfix: '.hs',
  keywords: [
    'case', 'class', 'data', 'default', 'deriving', 'do', 'else', 'family', 'forall', 'foreign', 'if', 'import',
    'in', 'infix', 'infixl', 'infixr', 'instance', 'let', 'mdo', 'module', 'newtype', 'of', 'proc', 'qualified',
    'rec', 'then', 'type', 'where', 'as', 'hiding',
  ],
  symbols: /[!#$%&*+./<=>?@\\^|\-~:]+/,
  reservedOps: ['..', ':', '::', '=', '\\', '|', '<-', '->', '@', '~', '=>'],
  escapes: /\\(?:[abfnrtv\\"'&]|\^[A-Z@[\\\]^_]|NUL|SOH|STX|ETX|EOT|ENQ|ACK|BEL|BS|HT|LF|VT|FF|CR|SO|SI|DLE|DC[1-4]|NAK|SYN|ETB|CAN|EM|SUB|ESC|FS|GS|RS|US|SP|DEL|\d+|o[0-7]+|x[0-9A-Fa-f]+)/,
  tokenizer: {
    root: [
      [/\{-#/, 'annotation', '@pragma'],
      [/\{-/, 'comment', '@comment'],
      [/--+(?![!#$%&*+./<=>?@\\^|~:]).*$/, 'comment'],
      [/(?:[A-Z][\w']*\.)*[A-Z][\w']*/, 'type.identifier'],
      [/[a-z_][\w']*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/0[xX][0-9a-fA-F_]+/, 'number.hex'],
      [/0[oO][0-7_]+/, 'number.octal'],
      [/0[bB][01_]+/, 'number.binary'],
      [/\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d+)?|\d[\d_]*[eE][+-]?\d+/, 'number.float'],
      [/\d[\d_]*/, 'number'],
      [/'(?:[^\\']|@escapes)'/, 'string'],
      [/"/, 'string', '@string'],
      [/`[A-Za-z_][\w'.]*`/, 'operator'],
      [/[{}()[\]]/, '@brackets'],
      [/[,;]/, 'delimiter'],
      [/@symbols/, { cases: { '@reservedOps': 'keyword.operator', '@default': 'operator' } }],
      [/\s+/, 'white'],
    ],
    comment: [
      [/[^{-]+/, 'comment'],
      [/\{-/, 'comment', '@push'],
      [/-\}/, 'comment', '@pop'],
      [/[{-]/, 'comment'],
    ],
    pragma: [
      [/#-\}/, 'annotation', '@pop'],
      [/[^#]+/, 'annotation'],
      [/#/, 'annotation'],
    ],
    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],
  },
}
