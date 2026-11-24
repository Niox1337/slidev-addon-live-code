const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
  }
  return crc
})

function crc32(data) {
  let crc = 0xFFFFFFFF
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}

const utf8Flag = 1 << 11
const dosDate = 0x21
const sizeLimit = 0xFFFFFFFF

export function createZip(entries) {
  // shortcut: classic ZIP size and entry limits, add ZIP64 when projects exceed them
  if (entries.length >= 0xFFFF) throw new RangeError('Too many ZIP entries')
  const local = []
  const directory = []
  let offset = 0
  let directorySize = 0

  for (const { name, text } of entries) {
    const filename = Buffer.from(name, 'utf8')
    const data = Buffer.from(text, 'utf8')
    const nextOffset = offset + 30 + filename.length + data.length
    if (filename.length > 0xFFFF || nextOffset >= sizeLimit) throw new RangeError('ZIP entry exceeds size limits')
    const crc = crc32(data)

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034B50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(utf8Flag, 6)
    header.writeUInt16LE(dosDate, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, data)

    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014B50, 0)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(utf8Flag, 8)
    record.writeUInt16LE(dosDate, 14)
    record.writeUInt32LE(crc, 16)
    record.writeUInt32LE(data.length, 20)
    record.writeUInt32LE(data.length, 24)
    record.writeUInt16LE(filename.length, 28)
    if (name.endsWith('/')) record.writeUInt32LE(0x10, 38)
    record.writeUInt32LE(offset, 42)
    directory.push(record, filename)

    offset = nextOffset
    directorySize += record.length + filename.length
  }

  if (directorySize >= sizeLimit) throw new RangeError('ZIP directory exceeds size limits')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directorySize, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...local, ...directory, end])
}
