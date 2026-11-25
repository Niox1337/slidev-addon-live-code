export const keywords = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float',
  'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof', 'static',
  'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', 'bool', 'true', 'false', 'NULL',
  'printf', 'scanf', 'malloc', 'calloc', 'realloc', 'free', 'strlen', 'strcpy', 'strcmp', 'memcpy', 'memset', 'size_t',
]

export const members = []

export const snippets = [
  { label: 'main', body: 'int main(void) {\n\t${0}\n\treturn 0;\n}' },
  { label: 'include', body: '#include <${1:stdio.h}>' },
  { label: 'for', body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}' },
  { label: 'while', body: 'while (${1:condition}) {\n\t${0}\n}' },
  { label: 'if', body: 'if (${1:condition}) {\n\t${0}\n}' },
  { label: 'printf', body: 'printf("${1:%d}\\\\n", ${2:value});' },
  { label: 'struct', body: 'struct ${1:name} {\n\t${0}\n};' },
]
