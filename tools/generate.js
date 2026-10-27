'use strict';
// 사용: node tools/generate.js   → 판 크기별로 "해가 하나뿐인" 퍼즐을 무작위로 만들어 puzzles.js 에 쓴다.
// 판 전체를 한 번에 지나는 길을 만들고(backbite) 몇 조각으로 자른 뒤 모양을 섞어서, 조각의 양 끝을 점으로 찍는다.
// 풀이기(logic.js 의 solve)로 해가 하나뿐인지 확인한다. 크기마다 시간 상한(budget 초)이 있어서 끝없이 돌지 않는다.
const fs = require('fs');
const path = require('path');
const L = require('../logic.js');

function rng(seed) {                   // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 판 전체를 지나는 길을 무작위로 만든다 (끝에서 이웃 칸으로 되꺾기를 되풀이). 뱀 모양에서 시작해 충분히 섞는다
function hamiltonian(n, rand, iters) {
  let p = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) p.push(r * n + (r % 2 ? n - 1 - c : c));
  const pos = new Int32Array(n * n);
  p.forEach((v, i) => { pos[v] = i; });
  for (let it = 0; it < iters; it++) {
    const flip = rand() < 0.5;
    if (flip) p.reverse();                                    // 항상 마지막 칸을 움직인다
    p.forEach((x, i) => { pos[x] = i; });
    const last = p.length - 1, end = p[last];
    const opts = L.neighbors(n, end).filter((v) => v !== p[last - 1]);
    const v = opts[Math.floor(rand() * opts.length)];
    const j = pos[v];
    p = p.slice(0, j + 1).concat(p.slice(j + 1).reverse());
    if (flip) p.reverse();
  }
  return p;
}

// 한 줄 길을 k 조각으로 자른다 (조각마다 minLen 칸 이상)
function cutPath(p, k, minLen, rand) {
  const N = p.length;
  if (k * minLen > N) return null;
  const extra = N - k * minLen, sizes = new Array(k).fill(minLen);
  for (let e = 0; e < extra; e++) sizes[Math.floor(rand() * k)]++;
  const parts = []; let at = 0;
  for (const len of sizes) { parts.push(p.slice(at, at + len)); at += len; }
  return parts;
}

// 길 끝의 칸을 이웃한 다른 길의 끝으로 옮기는 일을 되풀이해 모양을 섞는다 (한 줄을 자른 티가 안 나게)
function diversify(paths, n, rand, moves, minLen) {
  const owner = new Int16Array(n * n);
  paths.forEach((p, i) => p.forEach((c) => { owner[c] = i; }));
  for (let m = 0; m < moves; m++) {
    const a = Math.floor(rand() * paths.length), A = paths[a];
    if (A.length <= minLen) continue;
    const front = rand() < 0.5;
    const x = front ? A[0] : A[A.length - 1];
    const targets = [];
    for (const y of L.neighbors(n, x)) {
      const b = owner[y];
      if (b === a) continue;
      const B = paths[b];
      if (B[0] === y) targets.push([b, true]);
      if (B[B.length - 1] === y) targets.push([b, false]);
    }
    if (!targets.length) continue;
    const [b, atFront] = targets[Math.floor(rand() * targets.length)];
    if (front) A.shift(); else A.pop();
    if (atFront) paths[b].unshift(x); else paths[b].push(x);
    owner[x] = b;
  }
  return paths;
}

function make(n, kMin, kMax, seed, minLen, budgetMs) {
  const rand = rng(seed), t0 = Date.now();
  for (let tries = 0; tries < 300 && Date.now() - t0 < budgetMs; tries++) {
    const ham = hamiltonian(n, rand, n * n * 40);
    for (let k = kMin; k <= kMax; k++) {
      for (let rep = 0; rep < 20; rep++) {
        let paths = cutPath(ham, k, minLen + 1, rand);
        if (!paths) continue;
        paths = diversify(paths.map((q) => q.slice()), n, rand, n * n * 4, minLen);
        const pairs = paths.map((q) => [q[0], q[q.length - 1]]);
        const r = L.solve(n, pairs, 2, 100000);
        if (!r.aborted && r.count === 1) return { n, pairs, sol: paths, nodes: r.nodes, tries };
      }
    }
  }
  return null;
}

const SPECS = [
  { n: 5, count: 10, kMin: 4, kMax: 5, minLen: 3, budget: 15 },
  { n: 6, count: 8, kMin: 5, kMax: 7, minLen: 3, budget: 20 },
  { n: 7, count: 10, kMin: 5, kMax: 8, minLen: 3, budget: 30 },
  { n: 8, count: 6, kMin: 7, kMax: 10, minLen: 3, budget: 20 },
];
const out = [];
for (const spec of SPECS) {
  const got = [], start = Date.now();
  for (let s = 1; got.length < spec.count * 2 && s < 400 && Date.now() - start < spec.budget * 1000; s++) {
    const p = make(spec.n, spec.kMin, spec.kMax, spec.n * 1000 + s, spec.minLen, spec.budget * 1000 - (Date.now() - start));
    if (p) got.push(p);
  }
  // 쉬운 순(풀이기가 덜 헤맨 순)으로 늘어놓고 고르게 뽑는다
  got.sort((a, b) => a.nodes - b.nodes);
  const picked = [];
  for (let k = 0; k < spec.count && got.length; k++) picked.push(got[Math.min(got.length - 1, Math.round((k * (got.length - 1)) / Math.max(1, spec.count - 1)))]);
  const uniq = [...new Map(picked.map((p) => [JSON.stringify(p.pairs), p])).values()];
  uniq.forEach((p, i) => out.push({ id: `${p.n}-${String(i + 1).padStart(2, '0')}`, n: p.n, pairs: p.pairs, sol: p.sol }));
  console.log('size', spec.n, 'candidates', got.length, 'picked', uniq.length, (Date.now() - start) + 'ms');
}
const body = '// 퍼즐 데이터 (tools/generate.js 가 만든다). pairs 는 색마다 [점 한 칸, 점 다른 칸], sol 은 정답 길 (모두 해가 하나뿐).\nconst PUZZLES = ' + JSON.stringify(out).replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, '\n]') + ';\nif (typeof module !== \'undefined\') module.exports = PUZZLES;\n';
fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), body);
console.log('wrote', out.length);
