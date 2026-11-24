# slidev-addon-live-code

[English](README.md) | 中文

给 [Slidev](https://sli.dev) 讲者模式用的现场编程面板。在课件旁边编辑、运行和调试 Java、C 和 Haskell 练习，并由讲者决定观众什么时候看到代码。

- **编辑器**：基于 Monaco，有标签页、快速打开、自动保存，并能和初始代码对比
- **运行**：在本机编译运行，错误直接标在出错的行上
- **终端**：每个练习一个真实的 shell，观众页同步显示，只能看不能输入
- **观众页**：跟随讲者的选区和滚动，学生可以复制文件或下载练习
- **讲者笔记**：每个练习一份私人 Markdown 笔记，可以和课件页绑定
- **界面语言**：中文和英文

## 目录

- [环境要求](#环境要求)
- [安装](#安装)
- [配置练习](#配置练习)
- [上课](#上课)
- [快捷键](#快捷键)
- [教学步骤](#教学步骤)
- [添加新语言](#添加新语言)
- [开发](#开发)

## 环境要求

| 需要什么 | 用途 |
| --- | --- |
| Slidev 53.1、Vue 3.5、Monaco 0.57、Markdown Exit 2.1 | 插件本身 |
| JDK（`PATH` 中有 `javac` 和 `java`） | Java 练习 |
| 能以 `cc` 调用的 C 编译器（GCC 或 Clang），或用 `compiler` 指定 | C 练习 |
| GHC（`PATH` 中有 `ghc`） | Haskell 练习 |
| `python3` | macOS 和 Linux 上的终端 |
| [`node-pty`](https://github.com/microsoft/node-pty) | Windows 上的终端 |

代码由本机的 Slidev 开发服务器运行。静态构建仍能放映课件，但没有现场面板。

> [!NOTE]
> Windows 支持还在试验阶段。`node-pty` 需要在本机编译原生模块，所以没有默认安装。在课件目录运行 `npm install node-pty`，然后重启 Slidev。

## 安装

在课件目录安装插件。

```sh
npm install slidev-addon-live-code
```

在 `slides.md` 的第一段配置里加上插件。

```yaml
---
addons: [live-code]
---
```

课件还没有声明下面这些 peer dependencies 时，一并安装。

```sh
npm install @slidev/client@53.1.0 monaco-editor@0.57.0 markdown-exit@2.1.3
```

<details>
<summary>改用本地源码</summary>

1. 把插件文件夹放在 `slides.md` 旁边。
2. 在插件文件夹里运行 `npm install`，安装 xterm.js。
3. 在配置里写路径：`addons: ['./slidev-addon-live-code']`。

插件的 `.npmrc` 会跳过 peer dependencies，课件里只保留一份 Vue 和 Monaco。

</details>

## 配置练习

在课件目录创建 `live-code.config.mjs`，每一项是一个练习。

```js
export default [
  {
    id: 'hello',
    label: '第一段 Java',
    directory: './java-example',
    mainClass: 'Hello',
    initialFile: 'Hello.java',
  },
  {
    id: 'pointers',
    label: '指针练习',
    language: 'c',
    directory: './c-example',
    initialFile: 'main.c',
  },
  {
    id: 'lists',
    label: '列表练习',
    language: 'haskell',
    directory: './haskell-example',
    inputPrompt: 'Name: ',
  },
]
```

第一项最先打开。每个练习在文件列表里显示为一个文件夹。

| 选项 | 说明 |
| --- | --- |
| `id` | 唯一标识，也用作保存和笔记文件夹的名字 |
| `label` | 文件列表里显示的名字 |
| `language` | `'java'`（默认）、`'c'` 或 `'haskell'` |
| `directory` | 递归读取源码的文件夹 |
| `loadFiles()` | 代替 `directory`，返回 `{ 'path/File.java': 源码 }` |
| `initialFile` | 最先打开的文件，相对于 `directory`。默认按路径排序的第一份 |
| `initialLines` | `{ 'File.java': '文字' }`，打开该文件时定位到第一处包含这段文字的行 |
| `inputPrompt` | 程序等待输入时打印的提示符，设置后才有输入框 |
| `mainClass` | 仅 Java，要运行的类，例如 `examples.Hello` |

### C 选项

所有 `.c` 文件一起编译，带 `-I.`，`#include` 从练习根目录查找。至少要有一个 `.c` 文件。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `compiler` | `'cc'` | 编译器命令，例如 `'gcc-14'` |
| `flags` | `['-std=c17', '-Wall', '-Wextra', '-g', '-O0']` | 写了就整体替换默认值 |
| `link` | `['-lm']` | 链接参数 |
| `sanitize` | `true` | AddressSanitizer 和 UndefinedBehaviorSanitizer |

开启 sanitizer 时，数组越界、空指针和整数溢出会标在出错的行上。标准输出不经缓冲，提示符在程序等待输入前就会出现。

### Haskell 选项

先用 GHC 做类型检查，再解释运行 `main`，不生成可执行文件。`Data/Stack.hs` 对应模块 `Data.Stack`。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `main` | `'Main.hs'`，没有时用 `initialFile` | 入口文件 |
| `compiler` | `'ghc'` | GHC 命令 |
| `flags` | `[]` | 额外的 GHC 参数，例如 `['-Wall']` |

### 界面语言

默认跟随讲者浏览器的语言。要固定语言，导出 `locale`。

```js
export const locale = 'zh' // 或 'en'
```

## 上课

用 Slidev 开发服务器启动课件，打开 `/presenter`，点底栏的 **演示** 按钮。把观众页所在的窗口共享出去。

### 讲者面板

| 控件 | 作用 |
| --- | --- |
| **运行** | 编译并运行当前练习 |
| **课件 / 代码** | 选择观众看到什么。红点和红色状态栏表示观众正在看代码 |
| **− / +** | 观众页字号，点百分比恢复默认 |
| 面板边缘 | 拖动调整宽度，双击在预设宽度间切换 |

面板尺寸、打开的标签、光标位置和撤销记录都保存在浏览器里。

### 观众页

- 讲者用 Slidev 翻页时，自动切回课件
- 讲者打开文件、运行或点 **定位代码** 时，切到代码
- 用色带标出讲者的选区，编辑过的行会短暂闪亮
- 讲者打开终端时同步显示，只读，并按讲者终端的行宽缩放
- 提供 **复制文件** 和 **下载 ZIP**。ZIP 只包含当前显示的练习和其中的修改

### 运行和错误

- 每次运行都用新的临时文件夹，编译产物不会出现在课件目录
- 编译错误标在出错的行上，行尾显示信息，状态栏显示数量
- 输出和终端里的 `File.java:12`、`main.c:8:5`、`Main.hs:4` 可以点击，跳到对应的行
- 程序崩溃时，按调用栈标出相关的行
- 程序等待输入时，在输出下方的输入框里输入并回车

### 文件

| 操作 | 方法 |
| --- | --- |
| 保存 | 每 5 秒自动保存，或按 Ctrl+S / ⌘S。存入 `.slidev-live-code-saves/<id>/` |
| 新建 | 文件列表的 **新建文件** 或 **新建文件夹**。`a/b/C` 会建好中间的文件夹，缺少的扩展名自动补上 |
| 重命名 | 铅笔按钮或 F2。课件目录里的文件保持原名 |
| 移动 | 拖到文件夹上，拖到练习名上移到根目录 |
| 删除 | 垃圾桶按钮或 Delete。8 秒内点提示里的 **撤销** |
| 对比 | **对比** 打开只读的差异视图。行号旁的色条标出新增、修改和删除 |
| 还原 | **还原** 恢复单个文件的初始代码 |

- 课件里的原始文件不会被改写，也不能删除
- 新文件带起始内容：Java 的类、C 的 include guard、Haskell 的模块声明
- 会让练习无法运行的改名不会生效，例如 C 练习里不再有 `.c` 文件
- 给 Java 主类文件改名不会改 `mainClass`，需要同时改类名
- 要全部恢复，删除 `.slidev-live-code-saves` 后重启。可以把它加进 `.gitignore`

### 终端

- 每个练习一个 shell，运行在这个练习的临时副本里
- 编辑器的改动会同步到副本。在终端里新建或修改的源码文件也会同步回编辑器
- 编译产物和其他类型的文件只留在终端副本里
- `exit` 或垃圾桶按钮结束 shell 并删除副本，按 Enter 重新启动
- 按 Ctrl+Shift+F / ⌘F 搜索，可以区分大小写和使用正则表达式
- macOS 和 Linux 上用 `$SHELL`，Windows 上用 `COMSPEC` 或 PowerShell

终端会优先使用已安装的 Nerd Font 显示提示符图标。可以在课件样式里覆盖。

```css
.lc-root { --lc-terminal-font: "JetBrainsMono Nerd Font", monospace; }
```

### 讲者笔记

每个练习有一份私人 Markdown 笔记，存在 `.slidev-live-code-notes/<id>.md`。点铅笔图标编辑。观众页不会收到笔记。

## 快捷键

在面板里按 **?** 可以看到这张表。

| 作用 | Windows 和 Linux | macOS |
| --- | --- | --- |
| 运行 | Ctrl+Enter | ⌘↩ |
| 停止 | Ctrl+. | ⌘. |
| 快速打开 | Ctrl+P | ⌘P |
| 显示或隐藏文件列表 | Ctrl+B | ⌘B |
| 显示或隐藏底部面板 | Ctrl+J | ⌘J |
| 打开或收起终端 | Ctrl+\` | Ctrl+\` |
| 保存代码或笔记 | Ctrl+S | ⌘S |
| 在文件列表里重命名 | F2 | F2 |
| 在文件列表里删除 | Delete | ⌘⌫ |
| 搜索终端 | Ctrl+Shift+F | ⌘F |
| 中断终端里的程序 | Ctrl+C | Ctrl+C |
| 快捷键列表 | ? | ? |
| 关闭对话框、搜索或对比 | Esc | Esc |

## 教学步骤

有固定讲解路线的课件可以把笔记和代码绑定到课件页。在 `live-code.config.mjs` 中导出 `steps`。

```js
export const steps = [
  {
    id: 'print',
    label: '运行第一行输出',
    slide: 2,
    nextSlide: 3,
    project: 'hello',
    file: 'Hello.java',
    line: 3,
    anchor: 'System.out.println',
  },
]
```

步骤笔记写在 `.slidev-live-code-notes/steps/print.md`。

- 翻到第 2 页时，讲者侧备好代码和笔记，观众继续看课件
- **定位代码** 打开文件并定位到 `anchor`（找不到时用 `line`），同时显示给观众
- **去第 3 页** 让 Slidev 翻到 `nextSlide`，面板保持打开
- **‹** 和 **›** 在步骤间切换，不会翻页

## 添加新语言

每种语言是 `shared/languages/` 下的一个文件，服务器和浏览器共用。

1. 复制 `shared/languages/c.mjs` 为新文件。
2. 把它加进 `shared/languages/index.mjs` 的 `languageList`。

高亮、文件类型识别、可点击的位置、新建文件的模板和 Vite 预构建都从这份定义生成。语言文件不能在顶层导入 Node 模块。

```js
export default {
  id: 'python',
  label: 'Python',
  extensions: ['.py'],
  editor: {
    language: 'python',
    optimize: ['monaco-editor/languages/definitions/python/register.js'],
    setup: () => import('monaco-editor/languages/definitions/python/register.js'),
  },
  toolchain: 'python3',
  template: path => '',
  prepare({ directory, options, names, writeFile, resolve }) {
    return { run: ['python3', ['-u', options.main ?? 'main.py']], env: {} }
  },
  compileDiagnostics: (text, { files }) => [],
  runtimeDiagnostics: (text, { files }) => [],
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id`、`label`、`extensions`、`editor.language`、`prepare` | 是 | 基本信息和运行方式 |
| `editor.setup(monaco)` | 否 | 注册高亮。自定义 Monarch 规则可参考 `haskell.mjs` |
| `editor.optimize` | 否 | 交给 Vite 预构建的模块，和 `setup` 一致 |
| `toolchain` | 否 | 找不到命令时提示的名字 |
| `validate(options)` | 否 | 返回 `false` 时拒绝这个练习的配置 |
| `sourcesValid(names, options)` | 否 | 检查文件组合，例如至少一个 `.c` |
| `template(path)` | 否 | 新建文件的内容 |
| `compileTimeout` | 否 | 编译超时，默认 30000 毫秒 |
| `compileDiagnostics(text, context)` | 否 | 把编译输出解析成 `{ file, line, column, severity, message }` |
| `runtimeDiagnostics(text, context)` | 否 | 同上，用于崩溃程序的输出 |

`prepare` 在每次运行前调用。`directory` 是写好全部源码的临时文件夹，`names` 是源码路径列表，`resolve(name)` 返回绝对路径。返回 `compile: [command, args]` 可以加一个编译步骤。`shared/languages/shared.mjs` 里有 `matchFile` 和 `shorten` 两个辅助函数。

## 开发

```text
global-top.vue      Slidev 入口：讲者面板和观众页
vite.config.mjs     Slidev 入口：Vite 配置和服务器插件
client/             浏览器里的组件、样式和图标字体
server/             开发服务器插件：运行代码、终端、自动保存、下载
shared/             语言定义和界面文字
test/               vitest 测试
```

```sh
npm install
npm test
```

测试覆盖行差异、ZIP 打包、终端会话，以及针对临时课件的 HTTP 接口。CI 在 Ubuntu 和 macOS 上运行。

## 致谢

界面素材和许可见 [credits.txt](credits.txt)。
