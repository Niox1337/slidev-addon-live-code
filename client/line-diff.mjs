const cellLimit = 4_000_000

function splitLines(text) {
  return text.split(/\r?\n/)
}

function middleOperations(before, after) {
  const rows = before.length
  const columns = after.length
  if (!rows) return after.map(() => 'insert')
  if (!columns) return before.map(() => 'delete')
  if (rows * columns > cellLimit) return [...before.map(() => 'delete'), ...after.map(() => 'insert')]
  const width = columns + 1
  const table = new Uint32Array((rows + 1) * width)
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[row * width + column] = before[row] === after[column]
        ? table[(row + 1) * width + column + 1] + 1
        : Math.max(table[(row + 1) * width + column], table[row * width + column + 1])
    }
  }
  const operations = []
  let row = 0
  let column = 0
  while (row < rows && column < columns) {
    if (before[row] === after[column]) {
      operations.push('equal')
      row += 1
      column += 1
    }
    else if (table[(row + 1) * width + column] >= table[row * width + column + 1]) {
      operations.push('delete')
      row += 1
    }
    else {
      operations.push('insert')
      column += 1
    }
  }
  while (row++ < rows) operations.push('delete')
  while (column++ < columns) operations.push('insert')
  return operations
}

export function lineChanges(original, current) {
  const before = splitLines(original)
  const after = splitLines(current)
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  const operations = middleOperations(before.slice(prefix, before.length - suffix), after.slice(prefix, after.length - suffix))

  const changes = []
  let line = prefix
  let deleted = 0
  let inserted = 0
  const flush = () => {
    if (inserted) changes.push({ kind: deleted ? 'modified' : 'added', start: line - inserted + 1, end: line })
    else if (deleted) changes.push({ kind: 'deleted', start: Math.max(line, 1), end: Math.max(line, 1), after: line > 0 })
    deleted = 0
    inserted = 0
  }
  for (const operation of operations) {
    if (operation === 'equal') {
      flush()
      line += 1
    }
    else if (operation === 'delete') deleted += 1
    else {
      inserted += 1
      line += 1
    }
  }
  flush()
  return changes
}
