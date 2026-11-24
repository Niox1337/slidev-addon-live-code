import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { languages } from './languages/index.mjs'
import { normaliseLocale, translate } from './messages.mjs'
import { createTerminals } from './terminal.mjs'
import { createZip } from './zip.mjs'

const notesDirectory = '.slidev-live-code-notes'
const notesGlob = `**/${notesDirectory}/**`
const savesDirectory = '.slidev-live-code-saves'
const savesGlob = `**/${savesDirectory}/**`
const renamesFile = '.live-code-renames.json'
const autosaveInterval = 5_000
const signalKeys = { SIGSEGV: 'server.segfault', SIGBUS: 'server.segfault', SIGABRT: 'server.aborted', SIGFPE: 'server.arithmetic' }
const viteDenyDefaults = ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**']
const outputLimit = 40_000
const zoomRange = [0.7, 2.5]

const sourceName = /^[A-Za-z0-9_$][\w$.-]*$/

function isSourceFile(path, extensions) {
  const parts = path.split('/')
  const name = parts.at(-1)
  return sourceName.test(name) && extensions.some(extension => name.endsWith(extension) && name.length > extension.length)
    && parts.every(part => part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/.test(part))
}

function isFolderPath(path) {
  return typeof path === 'string' && path.length <= 200
    && path.split('/').every(part => sourceName.test(part) && part !== '.' && part !== '..')
}

async function readSavedEntries(directory, extensions, prefix = '') {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  }
  catch (error) {
    if (error.code === 'ENOENT') return { files: [], folders: [] }
    throw error
  }
  const files = []
  const folders = []
  for (const entry of entries) {
    const relative = `${prefix}${entry.name}`
    if (entry.isDirectory() && isFolderPath(relative)) {
      const nested = await readSavedEntries(join(directory, entry.name), extensions, `${relative}/`)
      folders.push(relative, ...nested.folders)
      files.push(...nested.files)
    }
    else if (entry.isFile() && isSourceFile(relative, extensions)) {
      files.push([relative, await readFile(join(directory, entry.name), 'utf8')])
    }
  }
  return { files, folders }
}

async function readSourceFiles(directory, extensions, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name)
    const relative = `${prefix}${entry.name}`

    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      return readSourceFiles(path, extensions, `${relative}/`)
    }
    if (entry.isFile() && isSourceFile(relative, extensions)) return [[relative, await readFile(path, 'utf8')]]
    return []
  }))
  return groups.flat()
}

async function readOptional(path, fallback) {
  return readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return fallback
    throw error
  })
}

const readNotes = path => readOptional(path, '')

function savedCopyPath(root, project, file) {
  return join(root, savesDirectory, project, ...file.split('/'))
}

function currentPath(project, source) {
  return project.moved.get(source) ?? source
}

function sourcePath(project, current) {
  if (!Object.hasOwn(project.originals, current)) return current
  for (const [source, target] of project.moved) if (target === current) return source
  return current
}

function remapOptions(options, moved) {
  const remap = value => (typeof value === 'string' && moved.has(value) ? moved.get(value) : value)
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, Array.isArray(value) ? value.map(remap) : remap(value)]))
}

function effectiveOptions(project) {
  return remapOptions({ ...project.options, initialFile: project.initialFile }, project.moved)
}

function conflicts(names, path) {
  return names.some(name => name === path || name.startsWith(`${path}/`) || path.startsWith(`${name}/`))
}

async function applyRenames(root, id, files, extensions) {
  const moved = new Map()
  let entries = []
  try {
    const parsed = JSON.parse(await readOptional(join(root, savesDirectory, id, renamesFile), '{}'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) entries = Object.entries(parsed)
  }
  catch {}
  const valid = entries.filter(([source, target]) => Object.hasOwn(files, source) && typeof target === 'string'
    && target !== source && isSourceFile(target, extensions))
  const texts = new Map(valid.map(([source]) => [source, files[source]]))
  for (const [source] of valid) delete files[source]
  for (const [source, target] of valid) {
    if (conflicts(Object.keys(files), target)) files[source] = texts.get(source)
    else {
      files[target] = texts.get(source)
      moved.set(source, target)
    }
  }
  return moved
}

async function loadDeck(root) {
  const module = await import(pathToFileURL(join(root, 'live-code.config.mjs')).href)
  const { default: config, steps: definitions = [] } = module
  if (!Array.isArray(config) || !config.length) throw new Error('Add a project in live-code.config.mjs.')
  const projects = new Map()

  for (const project of config) {
    const { id, label, directory, loadFiles, initialLines = {}, inputPrompt, language: languageId = 'java' } = project
    const language = Object.hasOwn(languages, languageId) ? languages[languageId] : null
    if (!language) throw new Error(`Unknown language for ${id}: ${languageId}. Use ${Object.keys(languages).join(', ')}.`)
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || projects.has(id)
      || typeof label !== 'string' || !label || (language.validate && !language.validate(project))
      || (inputPrompt !== undefined && (typeof inputPrompt !== 'string' || !inputPrompt))) {
      throw new Error(languageId === 'java'
        ? 'Each Java project needs a unique id, label and mainClass.'
        : `Each ${language.label} project needs a unique id and label, and valid options.`)
    }

    const files = loadFiles
      ? await loadFiles()
      : Object.fromEntries(await readSourceFiles(resolve(root, directory), language.extensions))
    const names = Object.keys(files).sort()
    const initialFile = project.initialFile ?? names[0]
    if (!Object.hasOwn(files, initialFile)
      || names.some(name => !isSourceFile(name, language.extensions) || typeof files[name] !== 'string')
      || (language.sourcesValid && !language.sourcesValid(names, project))) {
      throw new Error(`Invalid ${language.label} source files for ${id}.`)
    }
    const moved = await applyRenames(root, id, files, language.extensions)
    const originals = { ...files }
    const saved = await readSavedEntries(join(root, savesDirectory, id), language.extensions)
    for (const [name, text] of saved.files) files[name] = text
    const folders = new Set(saved.folders)
    const notesPath = join(root, notesDirectory, `${id}.md`)
    const notes = await readNotes(notesPath)
    projects.set(id, {
      label,
      language: languageId,
      options: project,
      files,
      originals,
      folders,
      moved,
      initialFile: moved.get(initialFile) ?? initialFile,
      initialLines,
      inputPrompt,
      notesPath,
      notes,
      viewLines: new Map(),
    })
  }

  const steps = new Map()
  for (const step of definitions) {
    const { id, label, slide, nextSlide, project, file, line, anchor } = step
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id) || steps.has(id)
      || typeof label !== 'string' || !label || !projects.has(project)
      || !Object.hasOwn(projects.get(project).files, currentPath(projects.get(project), file))
      || ![slide, nextSlide, line].every(value => Number.isInteger(value) && value > 0)
      || (anchor !== undefined && (typeof anchor !== 'string' || !anchor))) {
      throw new Error(`Invalid teaching step: ${id}.`)
    }
    const notesPath = join(root, notesDirectory, 'steps', `${id}.md`)
    steps.set(id, { id, label, slide, nextSlide, project, file, line, anchor, notesPath, notes: await readNotes(notesPath) })
  }
  return { projects, steps, locale: normaliseLocale(module.locale) }
}

export function liveCode() {
  return {
    name: 'slidev-live-code',
    apply: 'serve',
    config(config) {
      return {
        ...(config.cacheDir ? {} : { cacheDir: '.slidev-live-code-cache' }),
        server: {
          fs: { deny: [...(config.server?.fs?.deny ?? viteDenyDefaults), notesGlob, savesGlob] },
          watch: { ignored: [notesGlob, savesGlob] },
        },
      }
    },
    configureServer(server) {
      if (!['localhost', '127.0.0.1', '::1'].includes(server.config.server.host)) return
      const base = server.config.base
      const publicRoute = `${base}__slidev_live_code`
      const presenterRoute = `${publicRoute}/presenter`
      const terminalRoute = `${presenterRoute}/terminal`
      const audienceTerminalRoute = `${publicRoute}/terminal`
      const audienceDownloadRoute = `${publicRoute}/download`
      const credential = `slidev-live-code-${server.config.server.port}=${randomBytes(24).toString('hex')}`
      let projects
      let steps
      let pinnedLocale = null
      let noteId = ''
      let active
      const buildDirectories = new Set()
      let revision = 0
      let wasVisible = false
      let outputTail = ''
      let outputLength = 0
      const screen = {
        visible: false,
        project: '',
        file: '',
        line: 1,
        jump: 0,
        sync: 0,
        output: [],
        phase: 'ready',
        exitCode: null,
        duration: null,
        diagnostics: [],
        focus: null,
        zoom: 1,
        locale: null,
        panel: 'output',
      }

      const t = (key, params) => translate(screen.locale ?? 'en', key, params)
      const terminals = createTerminals({
        message: t,
        accept: (id, name) => isSourceFile(name, languages[projects.get(id).language].extensions),
        onChange: (id, changes) => applyTerminalChanges(id, changes),
      })
      const terminalSize = value => Number.isInteger(value) && value >= 2 && value <= 500
      const selection = () => projects.get(screen.project)
      const note = () => steps.get(noteId)
      const stepFile = step => currentPath(projects.get(step.project), step.file)
      const stepLine = (step) => {
        const lines = projects.get(step.project).files[stepFile(step)].split('\n')
        const found = step.anchor ? lines.findIndex(line => line.includes(step.anchor)) + 1 : 0
        return found || Math.min(step.line, lines.length)
      }
      const sharedSnapshot = () => ({
        ...screen,
        revision,
        label: selection().label,
        code: selection().files[screen.file],
        awaitingInput: awaitingInput(),
      })
      const audienceSnapshot = () => screen.visible ? sharedSnapshot() : { visible: false, revision, locale: screen.locale }
      const presenterSnapshot = () => {
        const step = note()
        return {
          ...sharedSnapshot(),
          projects: Array.from(projects, ([id, project]) => ({
            id,
            label: project.label,
            language: project.language,
            files: Object.keys(project.files),
            modified: Object.keys(project.files).filter(name => Object.hasOwn(project.originals, name) && project.files[name] !== project.originals[name]),
            created: Object.keys(project.files).filter(name => !Object.hasOwn(project.originals, name)),
            folders: [...project.folders],
            extensions: languages[project.language].extensions,
          })),
          original: Object.hasOwn(selection().originals, screen.file) && selection().originals[screen.file] !== selection().files[screen.file]
            ? selection().originals[screen.file]
            : null,
          interactive: Boolean(selection().inputPrompt),
          steps: Array.from(steps.values(), ({ id, label, slide }) => ({ id, label, slide })),
          noteStep: step
            ? { id: step.id, label: step.label, file: stepFile(step), line: stepLine(step), nextSlide: step.nextSlide, project: step.project }
            : null,
          notes: step?.notes ?? selection().notes,
          autosave: { ...autosave, pending: dirty.size > 0 || dirtyRenames.size > 0 },
        }
      }
      const publish = () => {
        revision += 1
        if (screen.visible || wasVisible) server.ws.send('slidev:live-code', audienceSnapshot())
        wasVisible = screen.visible
      }

      function resetOutput() {
        screen.output = []
        outputTail = ''
        outputLength = 0
        screen.exitCode = null
        screen.duration = null
        screen.diagnostics = []
      }

      function append(text, stream = 'out') {
        if (!text) return
        const last = screen.output.at(-1)
        if (last?.stream === stream) last.text += text
        else screen.output.push({ stream, text })
        outputLength += text.length
        outputTail = (outputTail + text).slice(-256)
        while (outputLength > outputLimit) {
          const first = screen.output[0]
          const excess = outputLength - outputLimit
          if (first.text.length <= excess) {
            screen.output.shift()
            outputLength -= first.text.length
          }
          else {
            first.text = first.text.slice(excess)
            outputLength -= excess
          }
        }
        publish()
      }

      function startProcess(run, command, args, directory, { timeout, interactive, collect, env } = {}) {
        return new Promise((resolve, reject) => {
          const child = spawn(command, args, { cwd: directory, env: env ? { ...process.env, ...env } : process.env })
          run.child = child
          const timer = timeout && setTimeout(() => child.kill('SIGKILL'), timeout)
          child.stdin.on('error', () => {})
          child.stdout.setEncoding('utf8').on('data', text => {
            if (collect) collect.text += text
            append(text, 'out')
          })
          child.stderr.setEncoding('utf8').on('data', text => {
            if (collect) collect.text += text
            append(text, 'err')
          })
          child.once('error', reject)
          child.once('close', (code, signal) => {
            clearTimeout(timer)
            run.child = undefined
            if (signal && !run.stopped) append(`\n${t(signalKeys[signal] ?? 'server.interrupted', { signal })}\n`, 'system')
            resolve(code)
          })
          if (!interactive) child.stdin.end()
        })
      }

      async function execute(run, { language: languageId, options, inputPrompt, files }) {
        const language = languages[languageId]
        let directory
        const startedAt = Date.now()
        try {
          directory = await mkdtemp(join(tmpdir(), 'slidev-live-code-'))
          buildDirectories.add(directory)
          const names = Object.keys(files)
          await Promise.all(names.map(async name => {
            const path = join(directory, name)
            await mkdir(dirname(path), { recursive: true })
            await writeFile(path, files[name], 'utf8')
          }))
          if (run.stopped) return
          const inside = name => {
            const path = resolve(directory, name)
            if (!path.startsWith(`${directory}/`)) throw new Error(`Path outside the build folder: ${name}`)
            return path
          }
          const plan = await language.prepare({
            directory,
            options,
            names,
            resolve: inside,
            writeFile: async (name, text) => {
              const path = inside(name)
              await mkdir(dirname(path), { recursive: true })
              await writeFile(path, text, 'utf8')
            },
          })
          if (run.stopped) return

          const context = { files, directory }
          screen.diagnostics = []
          if (plan.compile) {
            const compileLog = { text: '' }
            const compiled = await startProcess(run, plan.compile[0], plan.compile[1], directory, {
              timeout: language.compileTimeout ?? 30_000, collect: compileLog, env: plan.env,
            })
            screen.diagnostics = language.compileDiagnostics?.(compileLog.text, context) ?? []
            if (run.stopped) return
            if (compiled !== 0) {
              screen.phase = 'compile-error'
              return
            }
          }

          screen.phase = 'running'
          publish()
          const runLog = { text: '' }
          const result = await startProcess(run, plan.run[0], plan.run[1], directory, {
            interactive: Boolean(inputPrompt), collect: runLog, env: plan.env,
          })
          if (!run.stopped) {
            screen.phase = result === 0 ? 'finished' : 'error'
            screen.exitCode = result
            if (result !== 0) screen.diagnostics.push(...(language.runtimeDiagnostics?.(runLog.text, context) ?? []))
          }
        }
        catch (error) {
          screen.phase = 'error'
          append(`${error.code === 'ENOENT'
            ? t('server.noToolchain', { tools: language.toolchain })
            : t('server.startFailed', { language: language.label })}\n`, 'system')
        }
        finally {
          if (run.stopped) screen.phase = 'stopped'
          screen.duration = Date.now() - startedAt
          active = undefined
          publish()
          if (directory) {
            await rm(directory, { recursive: true, force: true }).catch(console.error)
            buildDirectories.delete(directory)
          }
        }
      }

      function stop() {
        if (!active) return
        active.stopped = true
        active.child?.kill('SIGKILL')
      }

      function awaitingInput() {
        const prompt = selection().inputPrompt
        return Boolean(prompt && screen.phase === 'running'
          && outputTail.endsWith(prompt) && active?.child?.stdin.writable)
      }

      function select(projectId, file) {
        const project = projects.get(projectId)
        const { files, initialFile, initialLines, viewLines } = project
        const name = file ?? initialFile
        if (typeof name !== 'string' || !Object.hasOwn(files, name)) return false
        if (screen.project !== projectId) {
          if (active) return false
          resetOutput()
          screen.phase = 'ready'
        }
        if (screen.file) selection().viewLines.set(screen.file, screen.line)
        const anchor = initialLines[sourcePath(project, name)]
        const anchorLine = anchor ? files[name].split('\n').findIndex(value => value.includes(anchor)) + 1 : 1
        Object.assign(screen, { project: projectId, file: name, line: viewLines.get(name) ?? (anchorLine || 1), focus: null })
        return true
      }

      function reveal(projectId, file, line) {
        if (!select(projectId, file)) return false
        screen.line = Math.min(line, projects.get(projectId).files[file].split('\n').length)
        screen.jump += 1
        return true
      }

      function locateStep() {
        const step = note()
        return Boolean(step) && reveal(step.project, stepFile(step), stepLine(step))
      }

      const dirty = new Set()
      const dirtyRenames = new Set()
      const renamesPath = id => join(server.config.root, savesDirectory, id, renamesFile)
      const renamesText = id => `${JSON.stringify(Object.fromEntries(projects.get(id).moved), null, 2)}\n`
      const autosave = { savedAt: null, error: false }
      let flushing = Promise.resolve()
      let autosaveTimer

      function markDirty(project, file) {
        dirty.add(JSON.stringify([project, file]))
      }

      async function writeAtomic(file, text) {
        const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`
        try {
          await mkdir(dirname(file), { recursive: true, mode: 0o700 })
          await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
          await rename(temporary, file)
        }
        finally {
          await rm(temporary, { force: true }).catch(console.error)
        }
      }

      function flushCode() {
        const run = flushing.then(async () => {
          if (!dirty.size && !dirtyRenames.size) return
          const batch = [...dirty]
          const renamed = [...dirtyRenames]
          dirty.clear()
          dirtyRenames.clear()
          try {
            for (const key of batch) {
              const [id, file] = JSON.parse(key)
              const project = projects.get(id)
              const path = savedCopyPath(server.config.root, id, file)
              if (project.files[file] === project.originals[file]) await rm(path, { force: true })
              else if (!Object.hasOwn(project.files, file)) await rm(path, { force: true })
              else await writeAtomic(path, project.files[file])
            }
            for (const id of renamed) {
              const path = renamesPath(id)
              if (projects.get(id).moved.size) await writeAtomic(path, renamesText(id))
              else await rm(path, { force: true })
            }
            autosave.savedAt = Date.now()
            autosave.error = false
          }
          catch (error) {
            for (const key of batch) dirty.add(key)
            for (const id of renamed) dirtyRenames.add(id)
            autosave.error = true
            throw error
          }
          finally {
            revision += 1
          }
        })
        flushing = run.catch(error => console.error('Slidev live code autosave:', error))
        return run
      }

      function flushCodeSync() {
        for (const key of dirty) {
          const [id, file] = JSON.parse(key)
          const project = projects.get(id)
          const path = savedCopyPath(server.config.root, id, file)
          try {
            if (project.files[file] === project.originals[file] || !Object.hasOwn(project.files, file)) rmSync(path, { force: true })
            else {
              mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
              writeFileSync(path, project.files[file], { encoding: 'utf8', mode: 0o600 })
            }
          }
          catch (error) {
            console.error('Slidev live code autosave:', error)
          }
        }
        dirty.clear()
        for (const id of dirtyRenames) {
          try {
            if (projects.get(id).moved.size) {
              mkdirSync(dirname(renamesPath(id)), { recursive: true, mode: 0o700 })
              writeFileSync(renamesPath(id), renamesText(id), { encoding: 'utf8', mode: 0o600 })
            }
            else rmSync(renamesPath(id), { force: true })
          }
          catch (error) {
            console.error('Slidev live code autosave:', error)
          }
        }
        dirtyRenames.clear()
      }

      function stopAutosave() {
        clearInterval(autosaveTimer)
        flushCodeSync()
      }

      function removeBuildDirectories() {
        for (const directory of buildDirectories) {
          try {
            rmSync(directory, { recursive: true, force: true })
          }
          catch {}
        }
        buildDirectories.clear()
      }

      function shutdown() {
        terminals.shutdown()
        stop()
        stopAutosave()
        removeBuildDirectories()
      }

      async function saveNotes(project, text) {
        const file = project.notesPath
        const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`
        project.savingNotes = true
        try {
          await mkdir(dirname(file), { recursive: true, mode: 0o700 })
          await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
          await rename(temporary, file)
          project.notes = text
          revision += 1
        }
        finally {
          project.savingNotes = false
          await rm(temporary, { force: true }).catch(console.error)
        }
      }

      function pathAvailable(project, path) {
        const names = Object.keys(project.files)
        return names.length < 200 && !project.folders.has(path) && !conflicts(names, path)
      }

      function applyTerminalChanges(id, { updated, removed }) {
        const project = projects.get(id)
        const accepted = new Set()
        for (const [name, text] of updated) {
          if (text.length > outputLimit) continue
          if (Object.hasOwn(project.files, name)) {
            if (project.files[name] !== text) {
              project.files[name] = text
              markDirty(id, name)
            }
          }
          else if (pathAvailable(project, name)) {
            project.files[name] = text
            markDirty(id, name)
          }
          else continue
          accepted.add(name)
        }
        let restore = false
        for (const name of removed) {
          if (Object.hasOwn(project.originals, name) || name === project.initialFile) restore ||= Object.hasOwn(project.files, name)
          if (!Object.hasOwn(project.files, name) || Object.hasOwn(project.originals, name) || name === project.initialFile) continue
          delete project.files[name]
          project.viewLines.delete(name)
          markDirty(id, name)
          accepted.add(name)
        }
        if (restore) terminals.sync(id, project.files, project.folders)
        if (!accepted.size) return accepted
        if (id === screen.project) {
          screen.diagnostics = screen.diagnostics.filter(item => Object.hasOwn(project.files, item.file))
          if (!Object.hasOwn(project.files, screen.file)) select(id, project.initialFile)
          else if (accepted.has(screen.file)) screen.sync += 1
          if (screen.focus && accepted.has(screen.focus.file)) screen.focus = null
        }
        publish()
        return accepted
      }

      function isCurrentFile(action) {
        return action.project === screen.project && action.file === screen.file
      }

      function perform(action) {
        switch (action.type) {
          case 'view':
            if (typeof action.visible !== 'boolean') break
            screen.visible = action.visible
            if (Number.isInteger(action.slide)) {
              noteId = [...steps.values()].find(step => step.slide === action.slide)?.id ?? ''
              if (noteId) locateStep()
            }
            return true
          case 'select-note':
            if (action.id !== '' && !steps.has(action.id)) break
            noteId = action.id
            return true
          case 'locate-step':
            if (!locateStep()) break
            screen.visible = true
            return true
          case 'select':
            if (!projects.has(action.project) || !select(action.project, action.file)) break
            if (action.share !== false) screen.visible = true
            return true
          case 'reveal':
            if (!projects.has(action.project) || !Number.isInteger(action.line) || action.line < 1
              || !reveal(action.project, action.file, action.line)) break
            screen.visible = true
            return true
          case 'edit':
          case 'scroll':
            if (!isCurrentFile(action)) break
            if (action.type === 'edit') {
              if (typeof action.code !== 'string' || action.code.length > outputLimit) break
              selection().files[screen.file] = action.code
              markDirty(screen.project, screen.file)
            }
            if (Number.isInteger(action.line) && action.line > 0) screen.line = action.line
            return true
          case 'focus': {
            if (action.clear) {
              screen.focus = null
              return true
            }
            const { start, end } = action
            if (!isCurrentFile(action) || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) break
            screen.focus = { file: screen.file, start, end }
            return true
          }
          case 'reset': {
            const project = projects.get(action.project)
            if (!project || !Object.hasOwn(project.originals, action.file)) break
            project.files[action.file] = project.originals[action.file]
            markDirty(action.project, action.file)
            if (action.project === screen.project) screen.diagnostics = screen.diagnostics.filter(item => item.file !== action.file)
            screen.sync += 1
            return true
          }
          case 'create-file': {
            const project = projects.get(action.project)
            const path = action.path
            if (!project || typeof path !== 'string' || path.length > 200 || !pathAvailable(project, path)
              || !isSourceFile(path, languages[project.language].extensions)) break
            project.files[path] = languages[project.language].template?.(path) ?? ''
            markDirty(action.project, path)
            select(action.project, path)
            return true
          }
          case 'create-folder': {
            const project = projects.get(action.project)
            if (!project || !isFolderPath(action.path) || !pathAvailable(project, action.path)) break
            project.folders.add(action.path)
            mkdir(savedCopyPath(server.config.root, action.project, action.path), { recursive: true, mode: 0o700 })
              .catch(error => console.error('Slidev live code:', error))
            return true
          }
          case 'rename': {
            const project = projects.get(action.project)
            const { from, to } = action
            if (!project || typeof from !== 'string' || !from || typeof to !== 'string' || from === to || to.startsWith(`${from}/`)) break
            const language = languages[project.language]
            const inside = name => name === from || name.startsWith(`${from}/`)
            const files = Object.keys(project.files).filter(inside)
            const folders = [...project.folders].filter(inside)
            const isFile = Object.hasOwn(project.files, from)
            if (!files.length && !folders.length) break
            if (isFile ? !isSourceFile(to, language.extensions) : !isFolderPath(to)) break
            if (!pathAvailable(project, to)) break
            const moved = name => `${to}${name.slice(from.length)}`
            if (!isFile && files.some(name => !isSourceFile(moved(name), language.extensions))) break
            const names = Object.keys(project.files).map(name => (inside(name) ? moved(name) : name))
            const nextOptions = remapOptions(effectiveOptions(project), new Map(files.map(name => [name, moved(name)])))
            if (language.sourcesValid && !language.sourcesValid(names.sort(), nextOptions)) break
            let renamedOriginal = false
            for (const name of files) {
              const text = project.files[name]
              const target = moved(name)
              project.files[target] = language.template && text === language.template(name) ? language.template(target) : text
              delete project.files[name]
              if (Object.hasOwn(project.originals, name)) {
                const source = sourcePath(project, name)
                project.originals[target] = project.originals[name]
                delete project.originals[name]
                if (source === target) project.moved.delete(source)
                else project.moved.set(source, target)
                if (project.initialFile === name) project.initialFile = target
                renamedOriginal = true
              }
              if (project.viewLines.has(name)) project.viewLines.set(target, project.viewLines.get(name))
              project.viewLines.delete(name)
              markDirty(action.project, name)
              markDirty(action.project, target)
            }
            for (const name of folders) {
              project.folders.delete(name)
              project.folders.add(moved(name))
            }
            if (renamedOriginal) dirtyRenames.add(action.project)
            if (action.project === screen.project) {
              screen.diagnostics = screen.diagnostics
                .filter(item => !inside(item.file) || files.includes(item.file))
                .map(item => (inside(item.file) ? { ...item, file: moved(item.file) } : item))
              if (inside(screen.file)) {
                screen.file = moved(screen.file)
                screen.sync += 1
              }
              if (screen.focus && inside(screen.focus.file)) screen.focus = null
            }
            const root = server.config.root
            flushCode().catch(() => {}).finally(async () => {
              try {
                for (const name of folders) await mkdir(savedCopyPath(root, action.project, moved(name)), { recursive: true, mode: 0o700 })
                if (!isFile) await rm(savedCopyPath(root, action.project, from), { recursive: true, force: true })
              }
              catch (error) {
                console.error('Slidev live code:', error)
              }
            })
            return true
          }
          case 'delete': {
            const project = projects.get(action.project)
            if (!project || typeof action.path !== 'string' || !action.path) break
            const inside = name => name === action.path || name.startsWith(`${action.path}/`)
            const files = Object.keys(project.files).filter(inside)
            const folders = [...project.folders].filter(inside)
            if ((!files.length && !folders.length) || files.some(name => Object.hasOwn(project.originals, name))
              || Object.keys(project.originals).some(inside)) break
            if (files.includes(project.initialFile)) break
            for (const name of files) {
              delete project.files[name]
              project.viewLines.delete(name)
              markDirty(action.project, name)
            }
            for (const name of folders) project.folders.delete(name)
            if (action.project === screen.project) {
              screen.diagnostics = screen.diagnostics.filter(item => !files.includes(item.file))
              if (files.includes(screen.file)) select(action.project, project.initialFile)
            }
            if (folders.length) {
              flushCode().catch(() => {}).finally(() => {
                for (const name of folders.sort((first, second) => second.length - first.length)) {
                  rm(savedCopyPath(server.config.root, action.project, name), { recursive: true, force: true }).catch(console.error)
                }
              })
            }
            return true
          }
          case 'panel':
            if (!['output', 'terminal'].includes(action.value)) break
            screen.panel = action.value
            return true
          case 'zoom': {
            const value = Number(action.value)
            if (!Number.isFinite(value)) break
            screen.zoom = Math.round(Math.min(zoomRange[1], Math.max(zoomRange[0], value)) * 20) / 20
            return true
          }
          case 'clear':
            if (active) break
            resetOutput()
            screen.phase = 'ready'
            return true
          case 'run':
            if (active) break
            screen.visible = true
            active = { stopped: false }
            resetOutput()
            screen.phase = 'compiling'
            void execute(active, {
              ...selection(),
              options: effectiveOptions(selection()),
              files: { ...selection().files },
            })
            return true
          case 'input':
            if (!awaitingInput()) break
            if (typeof action.line !== 'string' || !action.line || action.line.length > 256 || /[\r\n]/.test(action.line)) break
            append(action.line + '\n', 'input')
            active.child.stdin.write(action.line + '\n')
            return true
          case 'stop':
            stop()
            return true
        }
        return false
      }

      function applyLocale(header) {
        const locale = pinnedLocale ?? normaliseLocale(header)
        if (!locale || locale === screen.locale) return
        screen.locale = locale
        publish()
      }

      let initialise
      server.httpServer?.on('close', shutdown)
      process.once('exit', shutdown)
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?', 1)[0] ?? ''
        if (req.method === 'GET' && pathname.startsWith(base)
          && /^presenter(?:\/\d+)?\/?$/.test(pathname.slice(base.length))) {
          res.appendHeader('Set-Cookie', `${credential}; Path=${presenterRoute}; HttpOnly; SameSite=Strict`)
        }
        const isTerminal = pathname === terminalRoute
        const isPresenter = pathname === presenterRoute || isTerminal
        const isAudienceTerminal = pathname === audienceTerminalRoute
        const isAudienceDownload = pathname === audienceDownloadRoute
        if (!isPresenter && !isAudienceTerminal && !isAudienceDownload && pathname !== publicRoute) return next()
        const requestLocale = pinnedLocale ?? screen.locale ?? normaliseLocale(req.headers['x-live-code-locale']) ?? 'en'
        const reply = (status, data) => {
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(data))
        }
        const fail = (status, key) => reply(status, { error: translate(requestLocale, key) })
        const host = req.headers.host ?? ''
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
          || !/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) {
          return fail(403, 'error.localOnly')
        }
        if (isAudienceTerminal) {
          if (req.method !== 'GET') return fail(405, 'error.audienceReadOnly')
          const id = new URLSearchParams(req.url.split('?')[1] ?? '').get('project')
          if (!projects || !screen.visible || screen.panel !== 'terminal' || id !== screen.project) return fail(403, 'error.audienceReadOnly')
          return terminals.subscribe(id, req, res)
        }
        if (isAudienceDownload) {
          if (req.method !== 'GET') return fail(405, 'error.audienceReadOnly')
          const id = new URLSearchParams(req.url.split('?')[1] ?? '').get('project')
          if (!projects || !screen.visible || id !== screen.project) return fail(403, 'error.audienceReadOnly')
          const { label, files } = selection()
          const entries = Object.entries(files)
            .filter(([name]) => !name.split('/').some(part => part.startsWith('.')))
            .map(([name, text]) => ({ name: `${id}/${name}`, text }))
          let archive
          try {
            archive = createZip([{ name: `${id}/`, text: '' }, ...entries])
          }
          catch (error) {
            console.error('Slidev live code download:', error)
            return fail(500, 'audience.downloadFailed')
          }
          const filename = encodeURIComponent(`${label || id}.zip`.toWellFormed())
            .replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
            'Cache-Control': 'no-store',
          })
          return res.end(archive)
        }
        if (!isPresenter) {
          if (req.method !== 'GET') return fail(405, 'error.audienceReadOnly')
          return reply(200, audienceSnapshot())
        }
        if (!req.headers.cookie?.split('; ').includes(credential)
          || (req.method !== 'GET' && (req.method !== 'POST' || req.headers.origin !== `http://${host}`
            || req.headers['content-type'] !== 'application/json'))) {
          return fail(403, 'error.reload')
        }
        try {
          await (initialise ??= loadDeck(server.config.root).then(loaded => {
            projects = loaded.projects
            steps = loaded.steps
            pinnedLocale = loaded.locale
            screen.locale = pinnedLocale
            select(projects.keys().next().value)
            autosaveTimer = setInterval(() => {
              if (dirty.size) flushCode().catch(() => {})
            }, autosaveInterval)
            autosaveTimer.unref()
          }))
          applyLocale(req.headers['x-live-code-locale'])
          if (isTerminal) {
            if (req.method !== 'GET') return fail(405, 'error.badRequest')
            const id = new URLSearchParams(req.url.split('?')[1] ?? '').get('project')
            if (!projects.has(id)) return fail(400, 'error.badRequest')
            return terminals.subscribe(id, req, res)
          }
          if (req.method === 'GET') return reply(200, presenterSnapshot())
          let body = ''
          for await (const chunk of req.setEncoding('utf8')) {
            body += chunk
            if (body.length > 100_000) return fail(413, 'error.tooLong')
          }
          let action
          try {
            action = JSON.parse(body)
          }
          catch {
            return fail(400, 'error.badRequest')
          }
          if (action?.type === 'save-code') {
            try {
              await flushCode()
              return reply(200, presenterSnapshot())
            }
            catch {
              return fail(500, 'error.codeWrite')
            }
          }
          if (action?.type === 'save-notes') {
            const project = action.step ? steps.get(action.step) : projects.get(action.project)
            if (!project || typeof action.text !== 'string' || action.text.length > 40_000) {
              return fail(400, 'error.notesInvalid')
            }
            if (project.savingNotes) return fail(409, 'error.notesBusy')
            try {
              await saveNotes(project, action.text)
              return reply(200, presenterSnapshot())
            }
            catch (error) {
              console.error('Slidev live code notes:', error)
              return fail(500, 'error.notesWrite')
            }
          }
          if (typeof action?.type === 'string' && action.type.startsWith('terminal-')) {
            const project = projects.get(action.project)
            let accepted = false
            if (project && action.type === 'terminal-start' && terminalSize(action.cols) && terminalSize(action.rows)) {
              await terminals.start(action.project, { files: project.files, folders: project.folders, cols: action.cols, rows: action.rows })
              accepted = true
            }
            else if (project && action.type === 'terminal-input' && typeof action.data === 'string' && action.data.length <= 65_536) {
              accepted = terminals.input(action.project, action.data)
            }
            else if (project && action.type === 'terminal-resize' && terminalSize(action.cols) && terminalSize(action.rows)) {
              accepted = terminals.resize(action.project, action.cols, action.rows)
            }
            else if (project && action.type === 'terminal-kill') {
              accepted = terminals.kill(action.project)
            }
            return accepted ? reply(200, { ok: true }) : fail(409, 'error.busy')
          }
          if (!action || !perform(action)) return fail(409, 'error.busy')
          const touched = projects.get(action.project ?? screen.project)
          if (touched) terminals.sync(action.project ?? screen.project, touched.files, touched.folders)
          if (action.type === 'select-note') revision += 1
          else publish()
          return reply(200, presenterSnapshot())
        }
        catch (error) {
          console.error('Slidev live code:', error)
          return fail(500, 'error.load')
        }
      })
    },
  }
}
