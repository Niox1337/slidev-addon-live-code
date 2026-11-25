# slidev-addon-live-code

English | [中文](README.zh-CN.md)

A live coding panel for [Slidev](https://sli.dev) presenter mode. Edit, run and debug exercises in Java, C, C++, Rust, Go, Zig, Haskell, Python, JavaScript or TypeScript next to your slides, and choose when the audience sees the code.

- **Editor**: Monaco with tabs, quick open, autosave and a diff against the starter code
- **Run**: compile and run on the local machine, with errors marked on the offending lines
- **Terminal**: a real shell per exercise, mirrored read-only to the audience
- **Audience view**: follows your selection and scroll, lets students copy the file or download the exercise
- **Presenter notes**: private Markdown notes per exercise, optionally tied to slides
- **Interface**: English and Chinese

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Configure exercises](#configure-exercises)
- [Presenting](#presenting)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Teaching steps](#teaching-steps)
- [Adding a language](#adding-a-language)
- [Development](#development)

## Requirements

| What | Needed for |
| --- | --- |
| Slidev 53.1, Vue 3.5, Monaco 0.57, Markdown Exit 2.1 | The addon itself |
| `python3` | Terminal on macOS and Linux |
| [`node-pty`](https://github.com/microsoft/node-pty) | Terminal on Windows |

Code runs through the local Slidev dev server. A static build still shows the slides, without the live panel.

### Language toolchains

Install only the toolchains your exercises use. A deck with only Java exercises needs no C compiler or GHC. A missing toolchain only affects running that language, and the panel says which command it could not find.

| Language | Toolchain |
| --- | --- |
| Java | JDK, with `javac` and `java` on `PATH` |
| C | GCC or Clang available as `cc`, or set `compiler` |
| C++ | GCC or Clang available as `c++`, or set `compiler` |
| Rust | `rustc` on `PATH`. Cargo is not used |
| Go | Go 1.22 or newer, with `go` on `PATH` |
| Zig | `zig` on `PATH` |
| Haskell | GHC, with `ghc` on `PATH` |
| Python | Python 3 as `python3`, or `python` on Windows, or set `interpreter` |
| JavaScript | Nothing extra. Runs on the Node.js that runs Slidev |
| TypeScript | Node.js 22.13 or newer. `tsc` only with `typecheck` |

> [!NOTE]
> Windows support is experimental. `node-pty` compiles a native module, so it is not installed by default. Run `npm install node-pty` in the deck folder and restart Slidev.

## Install

Install the addon in the deck folder.

```sh
npm install slidev-addon-live-code
```

Add it to the headmatter of `slides.md`.

```yaml
---
addons: [live-code]
---
```

If the deck does not already depend on them, install the peer dependencies too.

```sh
npm install @slidev/client@53.1.0 monaco-editor@0.57.0 markdown-exit@2.1.3
```

<details>
<summary>Using a local checkout instead</summary>

1. Put the addon folder next to `slides.md`.
2. Run `npm install` inside the addon folder to install xterm.js.
3. Reference it by path: `addons: ['./slidev-addon-live-code']`.

The addon's `.npmrc` skips peer dependencies, so the deck keeps a single copy of Vue and Monaco.

</details>

## Configure exercises

Create `live-code.config.mjs` in the deck folder. Each entry is one exercise.

```js
export default [
  {
    id: 'hello',
    label: 'First Java program',
    directory: './java-example',
    mainClass: 'Hello',
    initialFile: 'Hello.java',
  },
  {
    id: 'pointers',
    label: 'Pointers',
    language: 'c',
    directory: './c-example',
    initialFile: 'main.c',
  },
  {
    id: 'lists',
    label: 'Lists',
    language: 'haskell',
    directory: './haskell-example',
    inputPrompt: 'Name: ',
  },
]
```

The first exercise opens first. Each one appears as a folder in the file explorer.

| Option | Description |
| --- | --- |
| `id` | Unique id. Also names the save and notes folders |
| `label` | Name shown in the file explorer |
| `language` | `'java'` (default), `'c'`, `'cpp'`, `'rust'`, `'go'`, `'zig'`, `'haskell'`, `'python'`, `'javascript'` or `'typescript'` |
| `directory` | Folder read recursively for source files |
| `loadFiles()` | Alternative to `directory`. Returns `{ 'path/File.java': source }` |
| `initialFile` | File opened first, relative to `directory`. Defaults to the first file by path |
| `initialLines` | `{ 'File.java': 'text' }` opens that file at the first line containing the text |
| `inputPrompt` | Prompt the program prints when it waits for input. Enables the input box |
| `mainClass` | Java only. Class to run, for example `examples.Hello` |

### C options

All `.c` files compile together, with `-I.` so includes resolve from the exercise root. At least one `.c` file is required.

| Option | Default | Description |
| --- | --- | --- |
| `compiler` | `'cc'` | Compiler command, for example `'gcc-14'` |
| `flags` | `['-std=c17', '-Wall', '-Wextra', '-g', '-O0']` | Replaces the default flags |
| `link` | `['-lm']` | Linker flags |
| `sanitize` | `true` | AddressSanitizer and UndefinedBehaviorSanitizer |

With the sanitizers on, out-of-bounds access, null pointers and integer overflow are marked on the line that caused them. Standard output is unbuffered, so prompts appear before the program waits.

### C++ options

Same options and behavior as C. `.cpp`, `.cc` and `.cxx` files compile together and the default `flags` use `-std=c++20`. The default `compiler` is `'c++'`. A `.h` file is highlighted as C++ in a C++ exercise and as C in a C exercise.

### Rust options

`rustc` compiles the entry file. Other files join through `mod` declarations.

| Option | Default | Description |
| --- | --- | --- |
| `main` | `'main.rs'` | Entry file |
| `edition` | `'2024'` | Rust edition |
| `flags` | `[]` | Extra `rustc` flags |

Panics are marked on the line that panicked.

### Go options

The exercise builds as one `main` package. Without a `go.mod`, a module named `livecode` is created for the run.

| Option | Default | Description |
| --- | --- | --- |
| `flags` | `[]` | Extra `go build` flags |

### Zig options

`zig build-exe` compiles the entry file in Debug mode. Other files join through `@import`.

| Option | Default | Description |
| --- | --- | --- |
| `main` | `'main.zig'` | Entry file |
| `flags` | `[]` | Extra `zig build-exe` flags |

### Haskell options

GHC type checks the exercise, then interprets `main` without producing an executable. `Data/Stack.hs` resolves as module `Data.Stack`.

| Option | Default | Description |
| --- | --- | --- |
| `main` | `'Main.hs'`, else `initialFile` | Entry module file |
| `compiler` | `'ghc'` | GHC command |
| `flags` | `[]` | Extra GHC flags, for example `['-Wall']` |

### Python options

All `.py` files are checked for syntax errors first, then the entry file runs unbuffered. Tracebacks are marked on the lines they name.

| Option | Default | Description |
| --- | --- | --- |
| `main` | `'main.py'`, else `initialFile` | Entry file |
| `interpreter` | `'python3'`, or `'python'` on Windows | Python command, for example `'python3.13'` |

### JavaScript and TypeScript options

Node.js checks every file for syntax errors, then runs the entry file. TypeScript runs through Node's type stripping, so imports between files need the `.ts` extension, for example `import { add } from './math.ts'`.

| Option | Default | Description |
| --- | --- | --- |
| `main` | `'main.js'` or `'main.mjs'`, TypeScript `'main.ts'` or `'main.mts'`, else `initialFile` | Entry file |
| `args` | `[]` | Extra Node.js flags |
| `typecheck` | `false` | TypeScript only. `true` runs `tsc --noEmit --strict` before each run. A string names the `tsc` command |

### Interface language

The interface follows the presenter's browser language. To pin it, export `locale`.

```js
export const locale = 'en' // or 'zh'
```

## Presenting

Start the deck with the Slidev dev server, open `/presenter` and click the **demo** button in the bottom bar. Share the window with the audience page.

### Presenter panel

| Control | Effect |
| --- | --- |
| **Run** | Compile and run the current exercise |
| **Slides / Code** | Choose what the audience sees. A red dot and red status bar mean the audience sees code |
| **− / +** | Audience code size. Click the percentage to reset |
| Panel edge | Drag to resize. Double-click to cycle preset widths |

Panel sizes, open tabs, cursor positions and undo history are kept in the browser.

### Audience view

- Switches back to the slides when you change slides with Slidev
- Switches to the code when you open a file, run, or click **Show code**
- Highlights your selection and briefly flashes edited lines
- Mirrors the terminal read-only when you open it, scaled to the same line width
- Offers **Copy file** and **Download ZIP**. The ZIP contains the current edits of the visible exercise only

### Running and errors

- Each run uses a fresh temporary folder. Build output never lands in the deck folder
- Compile errors mark the line, show the message at its end and are counted in the status bar
- `File.java:12`, `main.c:8:5` and `Main.hs:4` in the output and terminal are links to that line
- Runtime crashes mark the lines from the stack trace
- When the program waits for input, type in the box under the output and press Enter

### Completion

A suggestion box opens while you type in the presenter editor, like in an IDE.

| Suggests | When |
| --- | --- |
| Names from the files of the exercise | Typing a word |
| Keywords and short templates such as `for` or `main` | Typing a word |
| Methods and fields, such as `append` after `names.` | After `.`, `->` or `::` |

- Accept with **Tab**, **Enter** or **→**. **Esc** closes the box and **Ctrl+Space** opens it
- Templates have stops. Press **Tab** to jump to the next one
- Suggestions come from the text of the exercise, not from a type checker
- The audience view never shows the box. Completion code loads only in the presenter editor, and only for the languages in use

### Files

| Task | How |
| --- | --- |
| Save | Automatic every 5 seconds, or Ctrl+S / ⌘S. Saved to `.slidev-live-code-saves/<id>/` |
| Create | **New file** or **New folder** in the explorer. `a/b/C` creates folders, a missing extension is added |
| Rename | Pencil button or F2. The file in the deck folder keeps its name |
| Move | Drag onto a folder, or onto the exercise name for the root |
| Delete | Trash button or Delete. Click **Undo** in the toast within 8 seconds |
| Compare | **Compare** opens a read-only diff. Gutter bars mark added, changed and deleted lines |
| Revert | **Revert** restores the starter code of one file |

- Original files in the deck are never modified and cannot be deleted
- New files start from a template, for example a Java class, a C or C++ include guard, a Haskell module header or a Go `package main`
- A rename that would break the exercise is refused, for example a C exercise without any `.c` file
- Renaming the Java main class file does not change `mainClass`. Rename the class too
- To reset everything, delete `.slidev-live-code-saves` and restart. Consider adding it to `.gitignore`

### Terminal

- One shell per exercise, running in a temporary copy of it
- Editor changes sync into the copy. Source files created or edited in the terminal sync back
- Build output and other file types stay in the terminal copy
- `exit` or the trash button ends the shell and deletes the copy. Press Enter to start a new one
- Search with Ctrl+Shift+F / ⌘F, with match case and regular expression options
- The shell is `$SHELL` on macOS and Linux, and `COMSPEC` or PowerShell on Windows

The terminal prefers an installed Nerd Font for prompt icons. Override it in the deck styles.

```css
.lc-root { --lc-terminal-font: "JetBrainsMono Nerd Font", monospace; }
```

### Presenter notes

Each exercise has private Markdown notes, stored in `.slidev-live-code-notes/<id>.md`. Click the pencil to edit. The audience never receives them.

## Keyboard shortcuts

Press **?** in the panel to see this list.

| Action | Windows and Linux | macOS |
| --- | --- | --- |
| Run | Ctrl+Enter | ⌘↩ |
| Stop | Ctrl+. | ⌘. |
| Quick open | Ctrl+P | ⌘P |
| Toggle file list | Ctrl+B | ⌘B |
| Toggle bottom panel | Ctrl+J | ⌘J |
| Toggle terminal | Ctrl+\` | Ctrl+\` |
| Save code or notes | Ctrl+S | ⌘S |
| Rename in file list | F2 | F2 |
| Delete in file list | Delete | ⌘⌫ |
| Show suggestions | Ctrl+Space | Ctrl+Space |
| Accept a suggestion | Tab, Enter or → | Tab, Enter or → |
| Search terminal | Ctrl+Shift+F | ⌘F |
| Interrupt terminal program | Ctrl+C | Ctrl+C |
| Shortcut list | ? | ? |
| Close dialog, search or comparison | Esc | Esc |

## Teaching steps

Decks with a planned walkthrough can tie notes and code to slides. Export `steps` from `live-code.config.mjs`.

```js
export const steps = [
  {
    id: 'print',
    label: 'Run the first print',
    slide: 2,
    nextSlide: 3,
    project: 'hello',
    file: 'Hello.java',
    line: 3,
    anchor: 'System.out.println',
  },
]
```

Write the step notes in `.slidev-live-code-notes/steps/print.md`.

- Reaching slide 2 prepares the code and notes for the presenter while the audience stays on the slides
- **Show code** opens the file at `anchor` (or `line` if the anchor is not found) and shows it to the audience
- **Go to slide 3** moves Slidev to `nextSlide` and keeps the panel open
- **‹** and **›** move between steps without changing slides

## Adding a language

A language has two parts in `shared/languages/`. Both the server and the browser load them.

| Part | Where | Loaded |
| --- | --- | --- |
| Metadata | One entry in `languageList` in `index.mjs` | Always, it is small |
| Definition | A module named after the id, for example `lua.mjs` | Only when a project in the deck uses the language |

1. Copy `shared/languages/c.mjs` to a new module.
2. Add an entry to `languageList`.

```js
// shared/languages/index.mjs
{ id: 'lua', label: 'Lua', extensions: ['.lua'], monaco: 'lua', optimize: [monacoRegister('lua')] },
```

```js
// shared/languages/lua.mjs
export default {
  toolchain: 'lua',
  setupEditor: () => import('monaco-editor/languages/definitions/lua/register.js'),
  template: path => '',
  prepare({ directory, options, names, writeFile, resolve }) {
    return { run: ['lua', [options.main ?? 'main.lua']], env: {} }
  },
  compileDiagnostics: (text, { files }) => [],
  runtimeDiagnostics: (text, { files }) => [],
}
```

Metadata fields, all required except `optimize`:

| Field | Description |
| --- | --- |
| `id`, `label` | Name used in `live-code.config.mjs` and shown in the panel |
| `extensions` | Source files of the language. Two languages may share one, like `.h`. The project's language wins |
| `monaco` | Monaco language id used for highlighting |
| `optimize` | Modules for Vite to pre-bundle, matching `setupEditor` |

Definition fields, all optional except `prepare`:

| Field | Description |
| --- | --- |
| `prepare(context)` | Returns how to run, see below |
| `setupEditor(monaco)` | Registers highlighting. See `haskell.mjs` for a custom Monarch grammar |
| `completion()` | Imports a module in `completion/` that exports `grammar`, `keywords`, `members` and `snippets`, all optional |
| `toolchain` | Command name shown when it is missing |
| `validate(options)` | Return `false` to reject the exercise options |
| `sourcesValid(names, options)` | Checks the file set, for example at least one `.c` |
| `template(path)` | Contents of a new file |
| `compileTimeout` | Milliseconds, default 30000 |
| `compileDiagnostics(text, context)` | Parses compiler output into `{ file, line, column, severity, message }` |
| `runtimeDiagnostics(text, context)` | Same, for output of a crashed program |

`prepare` runs before every run. `directory` is the temporary run folder with all sources written, `names` lists their paths and `resolve(name)` gives an absolute path. Return `compile: [command, args]` to add a compile step. `shared/languages/shared.mjs` has the `matchFile` and `shorten` helpers. Definition modules must not import Node modules at the top level.

## Development

```text
global-top.vue      Slidev entry: presenter panel and audience view
vite.config.mjs     Slidev entry: Vite config and server plugin
client/             Browser components, styles and icon font
server/             Dev server plugin: runs code, terminals, autosave, downloads
shared/             Language definitions and interface text
test/               Vitest suite
```

```sh
npm install
npm test
```

The tests cover the line diff, the ZIP writer, terminal sessions, the HTTP routes and a real run of every language against a temporary deck. A language whose toolchain is missing is skipped. CI installs all toolchains and runs on Ubuntu and macOS.

## Credits

Interface assets and their licenses are listed in [credits.txt](credits.txt).
