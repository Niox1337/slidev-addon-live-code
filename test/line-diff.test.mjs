import { expect, test } from 'vitest'
import { lineChanges } from '../line-diff.mjs'

test('identical text has no changes', () => {
  expect(lineChanges('one\ntwo\n', 'one\ntwo\n')).toEqual([])
  expect(lineChanges('', '')).toEqual([])
})

test('insertions use current line numbers', () => {
  expect(lineChanges('one\ntwo\nthree', 'start\none\nnew\ntwo\nthree\nend')).toEqual([
    { kind: 'added', start: 1, end: 1 },
    { kind: 'added', start: 3, end: 3 },
    { kind: 'added', start: 6, end: 6 },
  ])
})

test.each([
  ['top', 'removed\none\ntwo', 1, false],
  ['middle', 'one\nremoved\ntwo', 1, true],
  ['end', 'one\ntwo\nremoved', 2, true],
])('anchors deletions at the %s', (_position, original, line, after) => {
  expect(lineChanges(original, 'one\ntwo')).toEqual([
    { kind: 'deleted', start: line, end: line, after },
  ])
})

test('replaced lines form one modification across the new span', () => {
  expect(lineChanges('one\nold\nlast', 'one\nnew\nnext\nlast')).toEqual([
    { kind: 'modified', start: 2, end: 3 },
  ])
})

test('mixed hunks count current lines across unchanged lines', () => {
  expect(lineChanges(
    'one\nold\ntwo\nremove\nthree\nfour',
    'one\nnew\ntwo\nthree\ninsert\nfour',
  )).toEqual([
    { kind: 'modified', start: 2, end: 2 },
    { kind: 'deleted', start: 3, end: 3, after: true },
    { kind: 'added', start: 5, end: 5 },
  ])
})

test('CRLF and LF share the same line numbering', () => {
  expect(lineChanges('one\r\ntwo\r\n', 'one\ntwo\n')).toEqual([])
  expect(lineChanges('one\r\nold\r\nlast', 'one\r\nnew\r\nlast')).toEqual([
    { kind: 'modified', start: 2, end: 2 },
  ])
})

test('large unmatched spans use one hunk even with an internal matching line', () => {
  const before = Array.from({ length: 2001 }, (_, index) => index === 1000 ? 'shared' : `old ${index}`)
  const after = Array.from({ length: 2001 }, (_, index) => index === 1000 ? 'shared' : `new ${index}`)
  expect(lineChanges(
    ['first', ...before, 'last'].join('\n'),
    ['first', ...after, 'last'].join('\n'),
  )).toEqual([
    { kind: 'modified', start: 2, end: 2002 },
  ])
})
