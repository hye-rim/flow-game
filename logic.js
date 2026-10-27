'use strict';

// 플로우: 규칙과 풀이만 모아 둔 파일 (그리기·입력 없음). 브라우저·시험(Node)이 같이 쓴다.
//
// - n x n 칸에 색깔 점이 쌍으로 있다. 같은 색 점 두 개를 선(길)으로 이어야 한다. 길은 상하좌우로만 이어진다
// - 길끼리는 겹치거나 지나갈 수 없다. 다른 색 길 위로 새 길을 그으면 그 길이 그 칸에서 끊긴다
// - 모든 쌍을 잇고 **빈 칸이 하나도 없어야** 클리어
// - 칸 번호는 행 * n + 열 (왼쪽 위가 0)
const LOGIC_FLOW = (() => {

const neighbors = (n, i) => {
  const r = (i / n) | 0, c = i % n, out = [];
  if (r > 0) out.push(i - n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  if (r < n - 1) out.push(i + n);
  return out;
};
const adjacent = (n, a, b) => neighbors(n, a).includes(b);

// ---------- 게임 상태 ----------
// puz: { n, pairs: [[a, b], ...] }  paths[c] 는 색 c 의 길(칸 번호 목록, 첫 칸은 점 하나)
function newGame(puz) {
  return { n: puz.n, pairs: puz.pairs.map((p) => p.slice()), paths: puz.pairs.map(() => []), moves: 0, history: [] };
}
const snapshot = (st) => st.paths.map((p) => p.slice());
const restore = (st, snap) => { st.paths = snap.map((p) => p.slice()); };

const endpointOf = (st, i) => st.pairs.findIndex((p) => p[0] === i || p[1] === i);        // 점이면 그 색, 아니면 -1
// 칸 i 를 지나는 길의 색 (없으면 -1)
function ownerOf(st, i) {
  for (let c = 0; c < st.paths.length; c++) if (st.paths[c].includes(i)) return c;
  return -1;
}
const isConnected = (st, c) => {
  const p = st.paths[c];
  return p.length >= 2 && p[0] !== p[p.length - 1] && st.pairs[c].includes(p[0]) && st.pairs[c].includes(p[p.length - 1]);
};
const connectedCount = (st) => st.pairs.reduce((a, _, c) => a + (isConnected(st, c) ? 1 : 0), 0);
function filledCount(st) {
  const seen = new Set();
  for (const p of st.paths) for (const i of p) seen.add(i);
  return seen.size;
}
const isSolved = (st) => connectedCount(st) === st.pairs.length && filledCount(st) === st.n * st.n;

// 선 긋기를 시작한다: 색 c 의 점이거나, 색 c 의 길 위의 칸에서 시작해야 한다.
// 점에서 시작하면 그 색의 길을 처음부터 다시 긋는다. 길 위의 칸에서 시작하면 그 칸까지만 남기고 거기서 이어 긋는다
function begin(st, i) {
  if (!Number.isInteger(i) || i < 0 || i >= st.n * st.n) return -1;
  let c = endpointOf(st, i);
  if (c >= 0) {
    const p = st.paths[c];
    if (p.length && p[0] !== i && p[p.length - 1] === i && isConnected(st, c)) return c;       // 이어진 길의 반대쪽 점에서는 그대로 둔다
    if (!p.length || p[0] !== i) st.paths[c] = [i];
    else if (p.length > 1) st.paths[c] = [i];                                                   // 시작 점을 다시 누르면 처음부터
    return c;
  }
  c = ownerOf(st, i);
  if (c < 0) return -1;
  const p = st.paths[c];
  st.paths[c] = p.slice(0, p.indexOf(i) + 1);
  return c;
}

// 색 c 의 길 끝에서 이웃 칸 i 로 한 칸 나아간다. 바뀌었으면 true
function extend(st, c, i) {
  const p = st.paths[c];
  if (!p.length || !Number.isInteger(i) || i < 0 || i >= st.n * st.n) return false;
  const tail = p[p.length - 1];
  if (isConnected(st, c) && tail !== p[0]) {
    // 이미 이어진 길: 되돌아가기(자기 길 위의 칸)만 가능
    const at = p.indexOf(i);
    if (at >= 0 && at < p.length - 1 && adjacent(st.n, tail, i)) { st.paths[c] = p.slice(0, at + 1); return true; }
    return false;
  }
  if (!adjacent(st.n, tail, i)) return false;
  const back = p.indexOf(i);
  if (back >= 0) { st.paths[c] = p.slice(0, back + 1); return true; }                            // 자기 길로 되돌아가면 거기까지 지운다
  const e = endpointOf(st, i);
  if (e >= 0 && e !== c) return false;                                                           // 다른 색 점은 지나갈 수 없다
  if (e === c && i === p[0]) return false;
  const d = e < 0 ? ownerOf(st, i) : -1;
  if (d >= 0) {                                                                                  // 다른 색 길을 끊는다 (그 칸부터 뒤를 지운다)
    const q = st.paths[d];
    st.paths[d] = q.slice(0, q.indexOf(i));
  }
  p.push(i);
  return true;
}

// 한 번 긋기를 마친다: 바뀐 게 있으면 기록하고 이동 수를 센다
function commit(st, before) {
  if (JSON.stringify(before) === JSON.stringify(st.paths)) return false;
  st.history.push(before);
  st.moves++;
  return true;
}
function undo(st) {
  const s = st.history.pop();
  if (!s) return false;
  restore(st, s);
  st.moves = Math.max(0, st.moves - 1);
  return true;
}
function reset(st) {
  const before = snapshot(st);
  st.paths = st.pairs.map(() => []);
  return commit(st, before);
}

// 힌트: 정답 sol[c] (색 c 의 길, 첫 칸이 pairs[c][0]) 와 다른 색 하나를 정답 길로 놓아 준다. 놓은 색을 돌려준다 (다 맞으면 -1)
function hint(st, sol, rand = Math.random) {
  const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
  const wrong = [];
  for (let c = 0; c < st.pairs.length; c++) {
    const p = st.paths[c];
    const rev = p.slice().reverse();
    if (!(same(p, sol[c]) || same(rev, sol[c]))) wrong.push(c);
  }
  if (!wrong.length) return -1;
  // 아직 아무것도 안 그은 색보다 틀리게 그은 색을 먼저 알려 준다
  const drawn = wrong.filter((c) => st.paths[c].length > 1);
  const pool = drawn.length ? drawn : wrong;
  const c = pool[Math.floor(rand() * pool.length)];
  const before = snapshot(st);
  const path = sol[c].slice();
  const mine = new Set(path);
  for (let d = 0; d < st.paths.length; d++) {
    if (d === c) continue;
    const q = st.paths[d];
    const cut = q.findIndex((i) => mine.has(i));
    if (cut >= 0) st.paths[d] = q.slice(0, cut);
  }
  st.paths[c] = path;
  commit(st, before);
  return c;
}

// ---------- 풀이 (시험·퍼즐 만들기용) ----------
// 모든 칸을 채우는 해의 개수를 센다 (limit 개까지). 돌려주는 값: { count, first: [색마다 길], nodes }
function solve(n, pairs, limit = 2, maxNodes = 5e6) {
  const N = n * n, K = pairs.length;
  const nb = Array.from({ length: N }, (_, i) => neighbors(n, i));
  const owner = new Int8Array(N).fill(-1);
  const head = new Int32Array(K), tail = new Int32Array(K), done = new Uint8Array(K);
  const pathOf = pairs.map((p) => [p[0]]);
  pairs.forEach((p, c) => { owner[p[0]] = c; owner[p[1]] = c; head[c] = p[0]; tail[c] = p[1]; });
  let count = 0, nodes = 0, first = null, aborted = false;
  const isEnd = new Int8Array(N).fill(-1);
  pairs.forEach((p, c) => { isEnd[p[0]] = c; isEnd[p[1]] = c; });
  // 빈 칸이 이어갈 수 있는 이웃 수: 빈 칸 + 아직 안 이은 색의 머리·도착 점
  function viable() {
    for (let i = 0; i < N; i++) {
      if (owner[i] !== -1) continue;
      let a = 0;
      for (const j of nb[i]) {
        if (owner[j] === -1) a++;
        else { const c = owner[j]; if (!done[c] && (j === head[c] || j === tail[c])) a++; }
      }
      if (a < 2) return false;
    }
    // 아직 안 이은 색마다 머리에서 도착 점까지 빈 칸으로 갈 수 있어야 한다
    const seen = new Int32Array(N);
    let stamp = 0;
    for (let c = 0; c < K; c++) {
      if (done[c]) continue;
      stamp++;
      const q = [head[c]]; seen[head[c]] = stamp;
      let ok = false;
      while (q.length && !ok) {
        const x = q.pop();
        for (const j of nb[x]) {
          if (seen[j] === stamp) continue;
          if (j === tail[c]) { ok = true; break; }
          if (owner[j] === -1) { seen[j] = stamp; q.push(j); }
        }
      }
      if (!ok) return false;
    }
    return true;
  }
  function rec(filled) {
    if (aborted) return;
    if (++nodes > maxNodes) { aborted = true; return; }
    // 가장 갈 곳이 적은 색의 머리를 고른다
    let bc = -1, bm = null;
    for (let c = 0; c < K; c++) {
      if (done[c]) continue;
      const moves = [];
      for (const j of nb[head[c]]) if (owner[j] === -1 || j === tail[c]) moves.push(j);
      if (bc < 0 || moves.length < bm.length) { bc = c; bm = moves; if (!moves.length) return; }
    }
    if (bc < 0) {
      if (filled === N) { count++; if (!first) first = pathOf.map((p) => p.slice()); }
      return;
    }
    for (const j of bm) {
      if (j === tail[bc]) {
        done[bc] = 1; pathOf[bc].push(j);
        if (viable()) rec(filled);
        pathOf[bc].pop(); done[bc] = 0;
      } else {
        owner[j] = bc; const old = head[bc]; head[bc] = j; pathOf[bc].push(j);
        if (viable()) rec(filled + 1);
        pathOf[bc].pop(); head[bc] = old; owner[j] = -1;
      }
      if (count >= limit || aborted) return;
    }
  }
  rec(2 * K);
  return { count, first, nodes, aborted };
}

return { neighbors, adjacent, newGame, snapshot, restore, endpointOf, ownerOf, isConnected, connectedCount, filledCount, isSolved, begin, extend, commit, undo, reset, hint, solve };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_FLOW;
