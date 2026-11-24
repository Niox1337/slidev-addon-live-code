import { spawn } from 'node:child_process'
import { rmSync, watch } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const helper = fileURLToPath(new URL('./terminal-pty.py', import.meta.url))
const replayLimit = 200_000
const syncDelay = 250
const scanDelay = 200
const scanEntryLimit = 2000
const scanDepthLimit = 8
const scanFileLimit = 200_000

export function createTerminals({ message, accept, onChange }) {
  const sessions = new Map()
  const listeners = new Map()
  const heartbeat = setInterval(() => {
    for (const group of listeners.values()) for (const response of group) response.write(': ping\n\n')
  }, 15_000)
  heartbeat.unref()

  function broadcast(id, event) {
    const text = `data: ${JSON.stringify(event)}\n\n`
    for (const response of listeners.get(id) ?? []) response.write(text)
  }

  function record(session, text) {
    session.buffer += text
    if (session.buffer.length > replayLimit) {
      const excess = session.buffer.length - replayLimit
      const cut = session.buffer.indexOf('\n', excess)
      session.buffer = session.buffer.slice(cut < 0 ? excess : cut + 1)
    }
    broadcast(session.id, { type: 'output', data: text })
  }

  function inside(session, name) {
    const path = resolve(session.directory, name)
    if (!path.startsWith(`${session.directory}/`)) throw new Error(`Path outside the terminal folder: ${name}`)
    return path
  }

  async function writeWorkspace(session, files, folders) {
    for (const folder of folders) await mkdir(inside(session, folder), { recursive: true })
    for (const [name, text] of Object.entries(files)) {
      if (session.written.get(name) === text) continue
      const path = inside(session, name)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, text, 'utf8')
      session.written.set(name, text)
    }
    for (const name of [...session.written.keys()]) {
      if (Object.hasOwn(files, name)) continue
      await rm(inside(session, name), { force: true })
      session.written.delete(name)
    }
  }

  function queueWrite(session, files, folders) {
    session.writing = session.writing
      .then(() => (session.closed ? undefined : writeWorkspace(session, { ...files }, [...folders])))
      .catch(error => console.error('Slidev live code terminal:', error))
    return session.writing
  }

  async function scan(session) {
    const found = new Map()
    const present = new Set()
    let budget = scanEntryLimit
    async function walk(directory, prefix, depth) {
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      }
      catch {
        return
      }
      for (const entry of entries) {
        if ((budget -= 1) < 0) return
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const relative = `${prefix}${entry.name}`
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (depth < scanDepthLimit) await walk(path, `${relative}/`, depth + 1)
        }
        else if (entry.isFile() && accept(session.id, relative)) {
          present.add(relative)
          try {
            if ((await stat(path)).size > scanFileLimit) continue
            const text = await readFile(path, 'utf8')
            if (!text.includes('\0')) found.set(relative, text)
          }
          catch {}
        }
      }
    }
    await walk(session.directory, '', 1)
    if (session.closed) return
    const updated = [...found].filter(([name, text]) => session.written.get(name) !== text)
    const removed = [...session.written.keys()].filter(name => !present.has(name))
    if (!updated.length && !removed.length) return
    const accepted = onChange(session.id, { updated, removed })
    for (const [name, text] of updated) if (accepted.has(name)) session.written.set(name, text)
    for (const name of removed) session.written.delete(name)
  }

  function scheduleScan(session) {
    clearTimeout(session.scanTimer)
    session.scanTimer = setTimeout(() => {
      session.writing = session.writing
        .then(() => (session.closed ? undefined : scan(session)))
        .catch(error => console.error('Slidev live code terminal:', error))
    }, scanDelay)
  }

  function finish(session, code) {
    if (session.closed) return
    session.closed = true
    clearTimeout(session.syncTimer)
    clearTimeout(session.scanTimer)
    session.watcher?.close()
    if (sessions.get(session.id) === session) sessions.delete(session.id)
    broadcast(session.id, { type: 'exit', code })
    session.writing.finally(() => rm(session.root, { recursive: true, force: true }).catch(console.error))
  }

  async function start(id, { files, folders, cols, rows }) {
    const existing = sessions.get(id)
    if (existing && !existing.closed) return
    const root = await mkdtemp(join(tmpdir(), 'slidev-live-code-terminal-'))
    const session = {
      id,
      root,
      directory: join(root, id),
      buffer: '',
      written: new Map(),
      writing: Promise.resolve(),
      child: null,
      closed: false,
      syncTimer: null,
      cols,
      rows,
    }
    if (sessions.get(id) && !sessions.get(id).closed) {
      await rm(root, { recursive: true, force: true })
      return
    }
    sessions.set(id, session)
    broadcast(id, { type: 'start', cols, rows })
    await mkdir(session.directory)
    await queueWrite(session, files, folders)
    try {
      session.watcher = watch(session.directory, { recursive: true }, () => scheduleScan(session))
      session.watcher.on('error', () => {})
    }
    catch (error) {
      console.error('Slidev live code terminal:', error)
    }

    const shell = process.env.SHELL || '/bin/sh'
    const child = spawn('python3', [helper, String(rows), String(cols), shell, '-l'], {
      cwd: session.directory,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'slidev-live-code' },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    })
    session.child = child
    child.stdin.on('error', () => {})
    child.stdio[3].on('error', () => {})
    child.stdout.setEncoding('utf8').on('data', text => record(session, text))
    child.stderr.setEncoding('utf8').on('data', text => record(session, text))
    child.once('error', error => {
      record(session, `\r\n${message(error.code === 'ENOENT' ? 'terminal.noPython' : 'terminal.startFailed')}\r\n`)
      finish(session, null)
    })
    child.once('close', code => finish(session, code))
  }

  function input(id, data) {
    const session = sessions.get(id)
    if (!session?.child || session.closed) return false
    session.child.stdin.write(data)
    return true
  }

  function resize(id, cols, rows) {
    const session = sessions.get(id)
    if (!session?.child || session.closed) return false
    session.child.stdio[3].write(`${rows} ${cols}\n`)
    if (session.cols !== cols || session.rows !== rows) {
      Object.assign(session, { cols, rows })
      broadcast(id, { type: 'resize', cols, rows })
    }
    return true
  }

  function kill(id) {
    const session = sessions.get(id)
    if (!session) return false
    if (session.child) session.child.kill('SIGTERM')
    else finish(session, null)
    return true
  }

  function sync(id, files, folders) {
    const session = sessions.get(id)
    if (!session || session.closed) return
    clearTimeout(session.syncTimer)
    session.syncTimer = setTimeout(() => queueWrite(session, files, folders), syncDelay)
  }

  function subscribe(id, request, response) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.write('retry: 1000\n\n')
    const group = listeners.get(id) ?? new Set()
    listeners.set(id, group)
    group.add(response)
    const session = sessions.get(id)
    const first = session && !session.closed
      ? { type: 'replay', data: session.buffer, cols: session.cols, rows: session.rows }
      : { type: 'none' }
    response.write(`data: ${JSON.stringify(first)}\n\n`)
    request.once('close', () => {
      group.delete(response)
      if (!group.size) listeners.delete(id)
    })
  }

  function shutdown() {
    clearInterval(heartbeat)
    for (const group of listeners.values()) for (const response of group) response.end()
    listeners.clear()
    for (const session of sessions.values()) {
      session.closed = true
      clearTimeout(session.scanTimer)
      session.watcher?.close()
      session.child?.kill('SIGTERM')
      try {
        rmSync(session.root, { recursive: true, force: true })
      }
      catch {}
    }
    sessions.clear()
  }

  return { start, input, resize, kill, sync, subscribe, shutdown }
}
