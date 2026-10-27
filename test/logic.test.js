'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');
const PUZZLES = require('../puzzles.js');

// 3x3: red 0..2 (top row), blue 3..5 (middle row), green 6..8 (bottom row)
const rows3 = { n: 3, pairs: [[0, 2], [3, 5], [6, 8]] };

test('neighbors and adjacent', () => {
  assert.deepStrictEqual(L.neighbors(3, 0).sort((a, b) => a - b), [1, 3]);
  assert.deepStrictEqual(L.neighbors(3, 4).sort((a, b) => a - b), [1, 3, 5, 7]);
  assert.deepStrictEqual(L.neighbors(3, 8).sort((a, b) => a - b), [5, 7]);
  assert.ok(L.adjacent(3, 2, 5));
  assert.ok(!L.adjacent(3, 2, 3), 'wrapping to the next row is not adjacent');
  assert.ok(!L.adjacent(3, 0, 4), 'diagonals are not adjacent');
});

test('begin only works on a dot or on an existing path', () => {
  const st = L.newGame(rows3);
  assert.strictEqual(L.begin(st, 1), -1);                      // empty cell
  assert.strictEqual(L.begin(st, 99), -1);
  assert.strictEqual(L.begin(st, 0), 0);
  assert.deepStrictEqual(st.paths[0], [0]);
  assert.ok(L.extend(st, 0, 1));
  assert.strictEqual(L.begin(st, 1), 0, 'a cell of the path continues it');
  assert.deepStrictEqual(st.paths[0], [0, 1]);
});

test('extend moves one cell at a time, never diagonally and never from a long jump', () => {
  const st = L.newGame(rows3);
  L.begin(st, 0);
  assert.strictEqual(L.extend(st, 0, 4), false);               // diagonal
  assert.strictEqual(L.extend(st, 0, 2), false);               // two cells away
  assert.strictEqual(L.extend(st, 0, 0), false);               // staying put
  assert.ok(L.extend(st, 0, 1));
  assert.ok(L.extend(st, 0, 4));
  assert.deepStrictEqual(st.paths[0], [0, 1, 4]);
});

test('going back over your own path trims it', () => {
  const st = L.newGame(rows3);
  L.begin(st, 0); L.extend(st, 0, 1); L.extend(st, 0, 4); L.extend(st, 0, 7);
  assert.ok(L.extend(st, 0, 4));
  assert.deepStrictEqual(st.paths[0], [0, 1, 4]);
  assert.ok(L.extend(st, 0, 1));
  assert.deepStrictEqual(st.paths[0], [0, 1]);
});

test('other color dots are walls, other color paths get cut', () => {
  const st = L.newGame(rows3);
  L.begin(st, 3); L.extend(st, 1, 4); L.extend(st, 1, 5);                 // blue is color 1: 3,4,5
  assert.ok(L.isConnected(st, 1));
  L.begin(st, 0);
  assert.strictEqual(L.extend(st, 0, 3), false, 'cannot step onto the blue dot');
  L.extend(st, 0, 1);
  assert.ok(L.extend(st, 0, 4), 'steps onto the blue path');
  assert.deepStrictEqual(st.paths[1], [3], 'blue is cut at that cell, only its start remains');
  assert.ok(!L.isConnected(st, 1));
  assert.deepStrictEqual(st.paths[0], [0, 1, 4]);
});

test('reaching the other dot connects and stops the path', () => {
  const st = L.newGame(rows3);
  L.begin(st, 0); L.extend(st, 0, 1); L.extend(st, 0, 2);
  assert.ok(L.isConnected(st, 0));
  assert.strictEqual(L.extend(st, 0, 5), false, 'a connected path does not grow further');
  assert.strictEqual(L.begin(st, 2), 0, 'pressing the far dot keeps the connection');
  assert.deepStrictEqual(st.paths[0], [0, 1, 2]);
  assert.ok(L.extend(st, 0, 1), 'but you can back up from the far end');
  assert.ok(!L.isConnected(st, 0));
  assert.strictEqual(L.begin(st, 0), 0);                       // pressing the start dot again restarts the color
  assert.deepStrictEqual(st.paths[0], [0]);
});

test('a path cannot loop back onto its own start dot', () => {
  const st = L.newGame({ n: 3, pairs: [[0, 8], [2, 6]] });
  L.begin(st, 0); L.extend(st, 0, 1); L.extend(st, 0, 4); L.extend(st, 0, 3);
  assert.strictEqual(L.extend(st, 0, 0), true, 'stepping onto the own path trims back to the start');
  assert.deepStrictEqual(st.paths[0], [0]);
});

test('solved needs every pair connected and every cell filled', () => {
  const st = L.newGame(rows3);
  const draw = (c, cells) => { L.begin(st, cells[0]); for (const i of cells.slice(1)) L.extend(st, c, i); };
  draw(0, [0, 1, 2]); draw(1, [3, 4, 5]);
  assert.strictEqual(L.connectedCount(st), 2);
  assert.ok(!L.isSolved(st));
  draw(2, [6, 7, 8]);
  assert.strictEqual(L.connectedCount(st), 3);
  assert.strictEqual(L.filledCount(st), 9);
  assert.ok(L.isSolved(st));
  // connected but with an empty cell is not solved
  const st2 = L.newGame({ n: 3, pairs: [[0, 2], [6, 8]] });
  L.begin(st2, 0); L.extend(st2, 0, 1); L.extend(st2, 0, 2);
  L.begin(st2, 6); L.extend(st2, 1, 7); L.extend(st2, 1, 8);
  assert.strictEqual(L.connectedCount(st2), 2);
  assert.ok(!L.isSolved(st2));
});

test('commit counts a stroke only when something changed, undo and reset restore', () => {
  const st = L.newGame(rows3);
  let before = L.snapshot(st);
  L.begin(st, 0); L.extend(st, 0, 1);
  assert.ok(L.commit(st, before));
  assert.strictEqual(st.moves, 1);
  before = L.snapshot(st);
  assert.strictEqual(L.commit(st, before), false, 'no change, no move');
  assert.strictEqual(st.moves, 1);
  assert.ok(L.undo(st));
  assert.deepStrictEqual(st.paths[0], []);
  assert.strictEqual(st.moves, 0);
  assert.strictEqual(L.undo(st), false);
  before = L.snapshot(st); L.begin(st, 0); L.extend(st, 0, 1); L.commit(st, before);
  assert.ok(L.reset(st));
  assert.ok(st.paths.every((p) => p.length === 0));
  assert.ok(L.undo(st), 'reset can be undone');
  assert.deepStrictEqual(st.paths[0], [0, 1]);
});

test('every puzzle is well formed', () => {
  assert.ok(PUZZLES.length >= 30);
  const ids = new Set();
  for (const p of PUZZLES) {
    assert.ok(!ids.has(p.id), 'duplicate id'); ids.add(p.id);
    assert.ok([5, 6, 7, 8].includes(p.n), p.id);
    const N = p.n * p.n, dots = new Set();
    for (const [a, b] of p.pairs) {
      assert.ok(a >= 0 && a < N && b >= 0 && b < N && a !== b, p.id + ' dot range');
      assert.ok(!dots.has(a) && !dots.has(b), p.id + ' dot reused'); dots.add(a); dots.add(b);
    }
    assert.ok(p.pairs.length >= 4 && p.pairs.length <= 12, p.id + ' colors');
    // the stored answer: contiguous paths from dot to dot covering every cell exactly once
    const seen = new Set();
    p.sol.forEach((path, c) => {
      assert.ok(path.length >= 3, p.id + ' short path');
      assert.ok(path[0] === p.pairs[c][0] && path[path.length - 1] === p.pairs[c][1], p.id + ' path ends at its dots');
      for (let k = 0; k < path.length; k++) { assert.ok(!seen.has(path[k]), p.id + ' cell used twice'); seen.add(path[k]); if (k) assert.ok(L.adjacent(p.n, path[k - 1], path[k]), p.id + ' path jumps'); }
    });
    assert.strictEqual(seen.size, N, p.id + ' answer leaves cells empty');
  }
  for (const n of [5, 6, 7, 8]) assert.ok(PUZZLES.filter((p) => p.n === n).length >= 6, 'few puzzles of size ' + n);
});

test('every puzzle has exactly one solution and it is the stored one', () => {
  for (const p of PUZZLES) {
    const r = L.solve(p.n, p.pairs, 2);
    assert.ok(!r.aborted, p.id + ' solver gave up');
    assert.strictEqual(r.count, 1, p.id + ' has ' + r.count + ' solutions');
    assert.deepStrictEqual(r.first, p.sol, p.id + ' solver answer differs from the stored answer');
  }
});

test('solver counts several solutions when the puzzle is ambiguous', () => {
  assert.strictEqual(L.solve(3, [[0, 8]], 5).count, 2);          // two ways to snake from corner to corner
  assert.strictEqual(L.solve(3, [[0, 2], [3, 5]], 5).count, 0);  // the bottom row cannot be filled
});

test('replaying the answer with begin and extend solves every puzzle', () => {
  for (const p of PUZZLES) {
    const st = L.newGame(p);
    p.sol.forEach((path, c) => {
      const before = L.snapshot(st);
      assert.strictEqual(L.begin(st, path[0]), c);
      for (const i of path.slice(1)) assert.ok(L.extend(st, c, i), `${p.id} step to ${i}`);
      L.commit(st, before);
    });
    assert.ok(L.isSolved(st), p.id);
    assert.strictEqual(st.moves, p.pairs.length);
  }
});

test('hint fixes one color at a time until the puzzle is solved', () => {
  const p = PUZZLES.find((x) => x.n === 7);
  const st = L.newGame(p);
  let n = 0;
  while (!L.isSolved(st) && n < 40) { const c = L.hint(st, p.sol, () => 0); assert.ok(c >= 0, 'hint says done too early'); n++; }
  assert.ok(L.isSolved(st));
  assert.ok(n <= p.pairs.length + 4, 'hints used ' + n);
  assert.strictEqual(L.hint(st, p.sol), -1);
  // a wrong drawing is corrected and the cells it covered are cut out of other paths
  const st2 = L.newGame(p);
  const c0 = 0, a = p.pairs[c0][0];
  L.begin(st2, a);
  for (const i of L.neighbors(p.n, a)) if (!p.sol[c0].includes(i) && L.extend(st2, c0, i)) break;
  const fixed = L.hint(st2, p.sol, () => 0);
  assert.strictEqual(fixed, c0, 'the wrongly drawn color is fixed first');
  assert.deepStrictEqual(st2.paths[c0], p.sol[c0]);
});
