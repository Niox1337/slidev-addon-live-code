export const optionalString = value => value === undefined || (typeof value === 'string' && value.length > 0)
export const stringList = value => value === undefined || (Array.isArray(value) && value.every(item => typeof item === 'string'))

export function matchFile(path, files) {
  const clean = path.replace(/^\.\//, '')
  if (Object.hasOwn(files, clean)) return clean
  const matches = Object.keys(files).filter(name => clean.endsWith(`/${name}`))
  return matches.length === 1 ? matches[0] : null
}

export function shorten(message) {
  const text = message.replace(/\s+/g, ' ').trim()
  return text.length > 160 ? `${text.slice(0, 157)}...` : text
}
