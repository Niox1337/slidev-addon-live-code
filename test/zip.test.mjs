import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as zlib from 'node:zlib'
import { afterEach, expect, test, vi } from 'vitest'
import { createZip } from '../zip.mjs'
import { readZip } from './read-zip.mjs'

const entries = [
  { name: 'lesson/', text: '' },
  { name: 'lesson/café.txt', text: 'Crème brûlée\n' },
  { name: 'lesson/example.c', text: '123456789' },
]

afterEach(() => vi.restoreAllMocks())

test('local headers and central directory describe the same files and folder', () => {
  const records = readZip(createZip(entries))
  expect(records.map(({ name, data }) => ({ name, text: data.toString('utf8') }))).toEqual(entries)
  expect(records.map(({ flags }) => flags & 0x800)).toEqual([0x800, 0x800, 0x800])
  expect(records.map(({ attributes }) => attributes & 0x10)).toEqual([0x10, 0, 0])
  expect(records[2].crc).toBe(0xCBF43926)
})

test.skipIf(typeof zlib.crc32 !== 'function')('entry checksums match zlib CRC32', () => {
  for (const { data, crc } of readZip(createZip(entries))) {
    expect(crc).toBe(zlib.crc32(data))
  }
})

test('an empty archive contains an empty central directory', () => {
  expect(readZip(createZip([]))).toEqual([])
})

test('rejects the reserved classic ZIP entry count', () => {
  expect(() => createZip(new Array(0xFFFF))).toThrow(new RangeError('Too many ZIP entries'))
})

test('enforces the filename length in UTF-8 bytes', () => {
  const name = `${'é'.repeat(32767)}x`
  expect(readZip(createZip([{ name, text: '' }]))[0].name).toBe(name)
  expect(() => createZip([{ name: 'é'.repeat(32768), text: '' }]))
    .toThrow(new RangeError('ZIP entry exceeds size limits'))
})

test('rejects a local entry ending at the classic ZIP offset limit', () => {
  const text = 'oversized payload'
  const from = Buffer.from
  vi.spyOn(Buffer, 'from').mockImplementation((value, ...args) => {
    if (value === text) return { length: 0xFFFFFFFF - 31 }
    return from(value, ...args)
  })
  expect(() => createZip([{ name: 'x', text }])).toThrow(new RangeError('ZIP entry exceeds size limits'))
})

test('rejects a central directory exceeding the classic ZIP size limit', () => {
  const name = 'x'.repeat(0xFFFF)
  const filename = Buffer.from(name)
  const count = Math.ceil(0xFFFFFFFF / (46 + filename.length))
  const entries = Array(count).fill({ name, text: '' })
  const from = Buffer.from
  vi.spyOn(Buffer, 'from').mockImplementation((value, ...args) => {
    if (value === name) return filename
    return from(value, ...args)
  })
  expect(() => createZip(entries)).toThrow(new RangeError('ZIP directory exceeds size limits'))
})

const unzipAvailable = spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0

test.skipIf(!unzipAvailable)('unzip validates the archive on disk', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'live-code-zip-test-'))
  try {
    const archive = join(directory, 'lesson.zip')
    await writeFile(archive, createZip(entries))
    expect(execFileSync('unzip', ['-t', archive], { encoding: 'utf8', timeout: 3000 }))
      .toContain('No errors detected')
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
