import { expect } from 'vitest'

export function readZip(archive) {
  const end = archive.length - 22
  expect(archive.readUInt32LE(end)).toBe(0x06054B50)
  expect(archive.readUInt32LE(end + 4)).toBe(0)
  expect(archive.readUInt16LE(end + 20)).toBe(0)
  const count = archive.readUInt16LE(end + 10)
  const directorySize = archive.readUInt32LE(end + 12)
  const directoryOffset = archive.readUInt32LE(end + 16)
  expect(archive.readUInt16LE(end + 8)).toBe(count)
  expect(directoryOffset + directorySize).toBe(end)

  const entries = []
  let local = 0
  let record = directoryOffset
  for (let index = 0; index < count; index += 1) {
    expect(archive.readUInt32LE(record)).toBe(0x02014B50)
    expect(archive.readUInt32LE(record + 42)).toBe(local)
    expect(archive.readUInt32LE(local)).toBe(0x04034B50)
    const flags = archive.readUInt16LE(record + 8)
    const crc = archive.readUInt32LE(record + 16)
    const size = archive.readUInt32LE(record + 24)
    const nameLength = archive.readUInt16LE(record + 28)
    const extraLength = archive.readUInt16LE(record + 30)
    const commentLength = archive.readUInt16LE(record + 32)
    const attributes = archive.readUInt32LE(record + 38)
    expect(archive.readUInt16LE(local + 6)).toBe(flags)
    expect(archive.readUInt16LE(local + 8)).toBe(0)
    expect(archive.readUInt16LE(record + 10)).toBe(0)
    expect(archive.readUInt32LE(local + 14)).toBe(crc)
    expect(archive.readUInt32LE(local + 18)).toBe(size)
    expect(archive.readUInt32LE(local + 22)).toBe(size)
    expect(archive.readUInt32LE(record + 20)).toBe(size)
    expect(archive.readUInt16LE(local + 26)).toBe(nameLength)

    const filename = archive.subarray(record + 46, record + 46 + nameLength)
    expect(archive.subarray(local + 30, local + 30 + nameLength)).toEqual(filename)
    const dataOffset = local + 30 + nameLength + archive.readUInt16LE(local + 28)
    const data = archive.subarray(dataOffset, dataOffset + size)
    expect(data.length).toBe(size)
    entries.push({ name: filename.toString('utf8'), data, flags, attributes, crc })
    local = dataOffset + size
    record += 46 + nameLength + extraLength + commentLength
  }
  expect(local).toBe(directoryOffset)
  expect(record).toBe(end)
  return entries
}
