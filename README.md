# Slidev 代码讲者视图

在 Slidev 的 `/presenter` 底部点 **Java 演示**（C 或 Haskell 课件显示对应的语言名）。讲者页同时显示 Slidev 的课件、备注和工具，以及可编辑的代码面板。支持 Java、C 和 Haskell。拖动两区之间的分隔线可以分配空间。观众页显示当前源码和输出。

## 接入另一套课件

在课件目录里安装插件。

```sh
npm install slidev-addon-live-code
```

然后在 `slides.md` 第一段配置里加上 `addons: [live-code]`。Slidev 会找到 `slidev-addon-live-code`。

```yaml
---
theme: default
addons: [live-code]
---
```

插件使用 Slidev 53.1、Vue 3.5、Monaco 0.57 和 Markdown Exit 2.1。课件还没有直接声明下面的依赖时，在课件目录里安装它们。

```sh
npm install @slidev/client@53.1.0 monaco-editor@0.57.0 markdown-exit@2.1.3
```

也可以把插件源码放在 `slides.md` 旁边，在配置里写 `addons: ['./slidev-addon-live-code']`，然后在插件目录运行 `npm install` 安装 xterm.js 等依赖。插件目录的 `.npmrc` 让 npm 跳过由课件提供的 peer dependencies，避免装出第二份 Vue 或 Monaco。

在同一个课件目录创建 `live-code.config.mjs`。下面的配置递归读取 `java-example/` 下的 `.java` 文件，默认打开其中的 `Hello.java`。

```js
export default [
  {
    id: 'hello',
    label: '第一段 Java',
    directory: './java-example',
    mainClass: 'Hello',
    initialFile: 'Hello.java',
  },
]
```

每个练习用不同的 `id`，会在文件探索器里显示为可展开的模块。配置数组的第一项会最先打开。子目录中的 `initialFile` 使用相对于 `directory` 的路径，例如 `src/examples/Hello.java`。省略时，会打开按相对路径排序的第一份源码。带 `package` 声明的程序可以把完整类名填进 `mainClass`，例如 `examples.Hello`。

### C 和 Haskell

给练习加上 `language`，取值为 `'java'`（默认）、`'c'` 或 `'haskell'`。同一套课件可以混用不同语言。

```js
export default [
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
    initialFile: 'Main.hs',
    inputPrompt: 'Name: ',
  },
]
```

C 练习读取 `.c` 和 `.h` 文件，至少要有一个 `.c`。所有 `.c` 文件一起编译，`-I.` 让 `#include "lib/list.h"` 从练习根目录查找。默认开启 AddressSanitizer 和 UndefinedBehaviorSanitizer，数组越界、空指针、整数溢出会标在出错的行上。程序的标准输出不经缓冲，`printf` 提示在等待输入前就会出现。可选项如下。

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `compiler` | `'cc'` | 编译器命令，例如 `'gcc-14'` |
| `flags` | `['-std=c17', '-Wall', '-Wextra', '-g', '-O0']` | 编译参数，写了就整体替换默认值 |
| `link` | `['-lm']` | 链接参数 |
| `sanitize` | `true` | 设为 `false` 关闭两个 sanitizer |

Haskell 练习读取 `.hs` 文件，用 GHC 先做类型检查，再解释运行入口模块的 `main`，不生成可执行文件。子目录中的模块按 `Data/Stack.hs` 对应 `Data.Stack` 的方式查找。类型错误、`error` 和 `head []` 这类运行时异常都会标在对应的行上。可选项如下。

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `main` | `'Main.hs'`，没有时用 `initialFile` | 入口文件 |
| `compiler` | `'ghc'` | GHC 命令 |
| `flags` | `[]` | 额外的 GHC 参数，例如 `['-Wall']` |

每次运行都在系统临时目录里新建一个文件夹，编译产物（Java 的 `.class`、C 的可执行文件和调试符号）只写在那里，运行结束或停止后立即删除。课件服务退出时，还在运行的程序也会清理。练习目录和课件目录不会出现编译产物。

课件特有的文件加载方式可以写在配置的 `loadFiles()` 中，返回「相对路径到源码」的对象，代替 `directory`。还可以用 `initialLines` 为指定文件配置一段定位文字，用 `inputPrompt` 配置程序等待输入时输出的提示符。完整用法可以对照 [PPA 首课的配置](../KCL/4CCS1PPA/lesson-01/slides/live-code.config.mjs)。

## 上课

用本机的 Slidev 开发服务器启动，另开一个窗口打开 `/presenter`。共享观众页所在的浏览器窗口。运行 Java 练习需要路径中可以找到 `javac` 和 `java`，C 练习需要 `cc`（macOS 上由 Xcode Command Line Tools 提供），Haskell 练习需要 `ghc`。静态构建可用于放映课件，现场运行功能由本机开发服务器提供。

面板顶栏从左到右是文件列表开关、文件搜索、**运行**、观众画面切换 **课件 | 代码**、观众字号和 **收起面板**。观众看到代码时，「代码」旁的圆点变红，底部状态栏也整条变红，讲者随时知道学生在看什么。

用 Slidev 原来的工具翻页或揭晓内容，观众页自动切回课件。也可以点 **课件** 留在当前页。讲者仍然能编辑源码、看程序输出和私人代码笔记。点文件、标签、搜索结果、**定位代码** 或 **运行**，观众页会直接显示代码。

讲者在编辑器里选中一段代码，观众页会用色带标出同一段。编辑过的行会在观众页短暂闪亮。用顶栏的 **−** 和 **+** 调整观众页字号，点百分比恢复默认。讲者自己的编辑器字号不受影响。

编译出错时，出错的行会标红，行尾直接显示错误信息，状态栏显示错误和警告数量。输出里的 `File.java:12`、`main.c:8`、`Main.hs:4` 可以点击，跳到对应的行。程序异常退出时，会按调用栈标出出错的行。程序等待输入时，输出末尾出现闪烁的光标，在下方输入框里回车发送。

代码改动每 5 秒自动保存一次，存入课件目录下的 `.slidev-live-code-saves/<id>/`，重启课件后仍会保留。状态栏右侧显示 **待保存** 或 **已保存** 和时间，按 **⌘S / Ctrl+S** 或点这一项会立即保存。练习的原始源码文件不会被改写。

点文件列表标题栏的 **新建文件** 或 **新建文件夹**，在选中的文件夹里（选中文件时是它所在的文件夹）出现输入框，回车创建，Esc 取消。名称里可以带 `/` 一次建好多层。不写扩展名时自动补上练习语言的扩展名，例如 Haskell 练习输入 `Stack` 得到 `Stack.hs`。新文件带有起始内容：Java 是同名的类，C 头文件是 include guard，Haskell 是按路径命名的 `module` 声明。新建的文件和文件夹标有 **新建**，和改动一样自动保存，重启课件后仍在。悬停时出现的铅笔按钮或 **F2** 可以就地重命名任何文件或文件夹，包括课件原有的文件，输入框会先选中不含扩展名的部分。不写扩展名时保留原来的扩展名，文件夹改名时里面的文件一起移动。新建后还没改过的文件会按新名字重新生成起始内容，例如 Java 的类名和 Haskell 的模块名。原有文件改名后，改名记录存入 `.slidev-live-code-saves/<id>/.live-code-renames.json`，课件目录里的源码文件保持原名。起始文件、`initialLines`、教学步骤和 Haskell 的 `main` 会跟着新名字走。改名会导致练习无法运行时（例如 C 练习里不再有 `.c` 文件，或 Haskell 练习找不到入口文件），改名不会生效。Java 的 `mainClass` 写的是类名，给主类文件改名时需要同时改类名。悬停时出现的垃圾桶按钮或 **Delete** 键可以删除新建的文件和文件夹。课件原有的文件不能删除。

改过的文件在标签、文件列表和路径栏上显示圆点。点路径栏右侧的 **还原** 可以恢复课件里的原始代码，还原后仍可撤销，保存的副本也会随之删除。想让整套练习回到原始代码，去掉新建的文件并撤销所有改名，删除 `.slidev-live-code-saves` 文件夹再重启课件。课件放在 Git 仓库里时，可以把这个文件夹加入 `.gitignore`。

底部面板左侧有 **输出** 和 **终端** 两个标签。终端是一个完整的交互式 shell，可以手动编译、运行 `ghci`、查看文件，Ctrl+C 中断前台程序。macOS 和 Linux 上使用登录 shell（`$SHELL`），需要 `python3`。Windows 上使用 `COMSPEC` 指定的 shell，未设置时用 `powershell.exe`。Windows 上的终端还需要 `node-pty`，它要在本机编译，所以没有默认安装。在课件目录运行 `npm install node-pty` 后重启课件服务器。

每个练习有自己的终端，切换练习时终端跟着切换，切回来时之前的内容仍在。终端运行在系统临时目录里这个练习的副本中，编辑器里的改动（包括新建、改名和删除）会自动同步过去，课件目录和保存的副本都不会被改动。反过来，在终端里新建、修改或删除这门语言的源码文件（例如 C 练习的 `.c`、`.h`），编辑器也会同步更新，并像普通改动一样自动保存。编译产物和其他类型的文件只留在终端副本里，不会进入编辑器。课件原有的文件在终端里删掉后会被放回，因为原有文件不能删除。输入 `exit` 或点垃圾桶按钮结束终端，副本连同编译产物一起删除，之后在终端里按 Enter 重新启动。关闭课件服务器时，所有终端和副本也会清理掉。

终端字体会依次尝试系统里已安装的 Nerd Font（例如 JetBrainsMono Nerd Font、MesloLGS NF、Symbols Nerd Font），用来显示 shell 提示符和 `eza`、`lsd` 等工具里的图标。没有安装任何 Nerd Font 时，这些图标会显示成方格。要换成别的字体，在课件的样式里覆盖 `--lc-terminal-font`。

```css
.lc-root { --lc-terminal-font: "MesloLGS NF", monospace; }
```

观众页会跟随讲者底部面板的标签。讲者打开终端时，观众在代码旁看到同一个终端画面，只能观看不能输入，字号会自动缩放，让行宽和讲者的终端一致。讲者切回输出或点 **运行** 时，观众页也切回输出。

| 快捷键 | 作用 |
| --- | --- |
| **⌘P / Ctrl+P** | 按文件名、路径或练习名搜索文件 |
| **⌘↩ / Ctrl+Enter** | 运行 |
| **⌘. / Ctrl+.** | 停止 |
| **⌘B / Ctrl+B** | 显示或隐藏文件列表 |
| **⌘J / Ctrl+J** | 显示或隐藏输出和笔记 |
| **⌘S / Ctrl+S** | 立即保存代码。编辑笔记时保存笔记 |
| **Ctrl+`** | 打开终端并聚焦，再按一次收起底部面板（macOS 上也是 Ctrl） |
| **F2** | 在文件列表里重命名文件或文件夹 |
| **Delete / ⌘⌫** | 在文件列表里删除新建的文件或文件夹 |
| **Esc** | 关闭搜索，或放弃笔记修改 |

拖动面板左边缘可以分配课件和代码的空间，双击边缘在三种宽度间切换。窗口较窄时，面板移到课件下方。编辑器和输出之间、输出和笔记之间也可以拖动。面板宽度、各区域大小和打开的标签会保存在浏览器里，下次打开时恢复。切换文件时，各文件保留光标位置、滚动位置和撤销记录。

每个练习有一份讲者笔记，只有讲者可见。点笔记栏的铅笔图标写下提示或贴入 Markdown 代码块，再点 **保存**。笔记存入课件目录下的 `.slidev-live-code-notes/<id>.md`，下次启动仍可打开。用文件编辑器修改笔记后，重启本机课件即可读取。观众页只接收演示源码、程序输出和讲者打开的终端画面。

代码画面显示时，学生可以在观众页点 **复制文件**，把当前文件的代码复制到剪贴板，也可以点 **下载 ZIP**，下载包含当前修改的整份练习。

界面文字有中文和英文两套，默认跟随讲者浏览器的语言，观众页使用同一种语言。要固定语言，在 `live-code.config.mjs` 中导出 `locale`。

```js
export const locale = 'zh'
```

界面的开源素材和许可见 [credits.txt](credits.txt)。

## 添加新语言

每种语言是 `languages/` 下的一个文件，服务器和浏览器共用同一份定义。添加语言分两步：照着 `languages/c.mjs` 写一个新文件，再把它加进 `languages/index.mjs` 的 `languageList`。编辑器高亮、文件类型识别、输出里可点击的位置、新建文件的扩展名检查和 Vite 预构建都从这份定义生成，不需要改其他文件。启动时会检查必填字段，并拒绝两种语言共用同一个扩展名。

语言文件不能在顶层导入 Node 模块，因为浏览器也会加载它。需要写临时文件时，用 `prepare` 收到的 `writeFile`。

```js
export default {
  id: 'python',                 // 配置里 language 的取值
  label: 'Python',              // 界面上显示的名字
  extensions: ['.py'],          // 读取、新建和高亮的文件类型
  editor: {
    language: 'python',         // Monaco 的语言 id
    optimize: ['monaco-editor/languages/definitions/python/register.js'],
    setup: () => import('monaco-editor/languages/definitions/python/register.js'),
  },
  toolchain: 'python3',         // 找不到命令时提示的名字
  validate: options => true,    // 检查这种语言专有的配置项
  template: path => '',         // 新建文件的起始内容
  prepare({ directory, options, names, writeFile, resolve }) {
    return {
      // compile: [command, args],  省略时直接运行
      run: ['python3', ['-u', options.main ?? 'main.py']],
      env: {},
    }
  },
  compileDiagnostics: (text, { files }) => [],
  runtimeDiagnostics: (text, { files }) => [],
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id`、`label`、`extensions`、`editor.language`、`prepare` | 是 | 基本信息和运行方式 |
| `editor.setup(monaco)` | 否 | 注册高亮。Monaco 自带的语言导入它的 `register.js`，没有的语言可以像 `languages/haskell.mjs` 那样注册 Monarch 规则 |
| `editor.optimize` | 否 | 交给 Vite 预构建的模块，和 `setup` 里导入的路径一致 |
| `validate(options)` | 否 | 返回 `false` 时启动报错 |
| `sourcesValid(names, options)` | 否 | 检查练习的文件组合，例如 C 至少要有一个 `.c` |
| `template(path)` | 否 | 新建文件的起始内容 |
| `compileTimeout` | 否 | 编译超时，默认 30000 毫秒 |
| `compileDiagnostics(text, context)` | 否 | 把编译输出解析成 `{ file, line, column, severity, message }` 列表 |
| `runtimeDiagnostics(text, context)` | 否 | 程序异常退出时解析运行输出，格式同上 |

`prepare` 在每次运行时调用。`directory` 是这次运行的临时文件夹，源码已经按相对路径写好，运行结束后整个文件夹会被删除。`names` 是全部源码的相对路径，`resolve(name)` 返回临时文件夹里的绝对路径。`languages/shared.mjs` 里有解析诊断信息常用的 `matchFile` 和 `shorten`。

## 给代码笔记编排步骤

有逐页讲解路线的课件可以在 `live-code.config.mjs` 中额外导出 `steps`。

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

把讲解步骤写进 `.slidev-live-code-notes/steps/print.md`。从第 2 页打开演示时，会选中这份笔记并定位代码。面板开启后，翻到有步骤的页会在讲者侧自动备好该页的第一份代码和笔记，观众继续看课件。同一页揭晓内容时，会保留当前文件和笔记。可以用笔记栏的 **‹**、**›** 或下拉列表单独跳转笔记，再点 **定位代码** 把选中的源码分享给观众。若源码有插入或删除，`anchor` 会优先查找当前代码中的匹配行，`line` 用来处理尚未写入的代码。点 **去第 3 页** 会用 Slidev 翻到第 3 页，代码面板继续打开。
