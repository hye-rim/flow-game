'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 플로우: 화면·입력·소리. 규칙과 풀이는 logic.js (LOGIC_FLOW), 퍼즐은 puzzles.js (PUZZLES)
(() => {
const L = LOGIC_FLOW;
const $ = (id) => document.getElementById(id);
const DONE_KEY = 'flowDone', LAST_KEY = 'flowLast';
const SIZES = [5, 6, 7, 8];
const COLORS = ['#ff4d4d', '#3d8bff', '#34c759', '#ffd23f', '#ff9500', '#b05cff', '#00c2d4', '#ff5fa2', '#a47148', '#9be22f', '#8a8dff', '#e6e6e6'];

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const loadDone = () => { try { return JSON.parse(store.get(DONE_KEY)) || {}; } catch (_) { return {}; } };
let done = loadDone();                                      // { 퍼즐 id: { moves, hints } } 가장 좋은 기록
const clearedCount = () => PUZZLES.filter((p) => done[p.id]).length;
let lastId = store.get(LAST_KEY);
if (!PUZZLES.some((p) => p.id === lastId)) lastId = PUZZLES[0].id;

// ---------- 소리 ----------
let audio = null;
let muted = store.get('flowMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  start: () => tone(440, 0.05, 'triangle', 0.06),
  step: (k) => tone(330 + k * 12, 0.04, 'triangle', 0.045),
  link: () => seq([523, 784], 80, 'triangle', 0.09),
  cut: () => tone(220, 0.08, 'square', 0.04),
  undo: () => tone(500, 0.08, 'triangle', 0.07, -150),
  hint: () => tone(880, 0.12, 'sine', 0.07, 260),
  win: () => seq([523, 659, 784, 1047, 1319], 100, 'triangle', 0.1),
};
function toggleMute() { muted = !muted; store.set('flowMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 상태 ----------
let P = null, st = null, hints = 0, playing = false, solvedShown = false;
let stroke = null;                                          // 긋는 중 { c, before, tailCell, connectedBefore }
let flashUntil = 0, hintColor = -1;
const indexIn = (p) => PUZZLES.filter((x) => x.n === p.n).findIndex((x) => x.id === p.id) + 1;

// ---------- 그리기 ----------
const canvas = $('board'), ctx = canvas.getContext('2d');
let cs = 40, size = 300, dpr = 1;
function layout() {
  const availW = Math.max(160, Math.min($('boardBox').clientWidth || 340, 420) - 8);
  const availH = Math.max(200, innerHeight - 250);
  size = Math.floor(Math.min(availW, availH));
  dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
  canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
  cs = size / (P ? P.n : 5);
}
const center = (i) => [((i % P.n) + 0.5) * cs, (((i / P.n) | 0) + 0.5) * cs];
function draw(now = performance.now()) {
  if (!P) return;
  const n = P.n;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#1b1740'; ctx.fillRect(0, 0, size, size);
  // 채워진 칸은 그 색으로 옅게
  for (let c = 0; c < st.paths.length; c++) {
    ctx.fillStyle = COLORS[c] + '33';
    for (const i of st.paths[c]) { const [x, y] = center(i); ctx.fillRect(x - cs / 2, y - cs / 2, cs, cs); }
  }
  // 격자
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k <= n; k++) { ctx.moveTo(k * cs, 0); ctx.lineTo(k * cs, size); ctx.moveTo(0, k * cs); ctx.lineTo(size, k * cs); }
  ctx.stroke();
  // 길
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let c = 0; c < st.paths.length; c++) {
    const p = st.paths[c];
    if (p.length < 2) continue;
    const pulse = L.isConnected(st, c) && now < flashUntil ? 0.06 * Math.sin(now / 60) : 0;
    ctx.strokeStyle = COLORS[c]; ctx.lineWidth = cs * (0.34 + pulse);
    ctx.beginPath();
    p.forEach((i, k) => { const [x, y] = center(i); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  }
  // 점
  for (let c = 0; c < st.pairs.length; c++) {
    for (const i of st.pairs[c]) {
      const [x, y] = center(i);
      ctx.fillStyle = COLORS[c];
      ctx.beginPath(); ctx.arc(x, y, cs * 0.3, 0, Math.PI * 2); ctx.fill();
      if (L.isConnected(st, c)) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(2, cs * 0.06); ctx.beginPath(); ctx.arc(x, y, cs * 0.3, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
  // 힌트로 알려 준 색은 잠깐 반짝
  if (hintColor >= 0 && now < flashUntil) {
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = cs * 0.12;
    ctx.beginPath(); st.paths[hintColor].forEach((i, k) => { const [x, y] = center(i); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
  }
  // 긋는 중인 손가락 끝
  if (stroke && st.paths[stroke.c].length) {
    const tail = st.paths[stroke.c][st.paths[stroke.c].length - 1];
    const [x, y] = center(tail);
    ctx.fillStyle = COLORS[stroke.c] + '66';
    ctx.beginPath(); ctx.arc(x, y, cs * 0.55, 0, Math.PI * 2); ctx.fill();
  }
}
function render() {
  if (!P) return;
  draw();
  $('lvl').textContent = `${P.n}×${P.n} · ${indexIn(P)}`;
  $('moves').textContent = String(st.moves);
  const total = P.n * P.n, filled = L.filledCount(st);
  $('conn').textContent = `연결 ${L.connectedCount(st)}/${st.pairs.length}`;
  $('fill').textContent = `채움 ${Math.round((filled / total) * 100)}%`;
  $('undoBtn').disabled = !st.history.length || solvedShown;
}
function say(text) { $('msg').textContent = text; }

// ---------- 창 ----------
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// ---------- 행동 ----------
function loadPuzzle(id) {
  P = PUZZLES.find((p) => p.id === id) || PUZZLES[0];
  lastId = P.id; store.set(LAST_KEY, lastId);
  st = L.newGame(P); hints = 0; solvedShown = false; playing = true; stroke = null; hintColor = -1; flashUntil = 0;
  hideOverlay(); layout(); render();
  say('같은 색 점을 끌어서 이어요. 빈 칸 없이 모두 채우면 성공!');
}
function cellAt(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * P.n, y = (e.clientY - r.top) / r.height * P.n;
  if (x < 0 || y < 0 || x >= P.n || y >= P.n) return -1;
  return Math.floor(y) * P.n + Math.floor(x);
}
canvas.addEventListener('pointerdown', (e) => {
  if (!playing || solvedShown || overlayOpen()) return;
  const i = cellAt(e);
  if (i < 0) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const before = L.snapshot(st);
  const c = L.begin(st, i);
  if (c < 0) return;
  stroke = { c, before, connected: L.connectedCount(st), cuts: 0 };
  sfx.start();
  render();
});
canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const target = cellAt(e);
  if (target < 0) return;
  const n = P.n;
  // 손가락이 빨리 움직여도 건너뛰지 않게 한 칸씩 따라간다
  for (let guard = 0; guard < n * 2; guard++) {
    const p = st.paths[stroke.c];
    const tail = p[p.length - 1];
    if (tail === target) break;
    const tr = (tail / n) | 0, tc = tail % n, gr = (target / n) | 0, gc = target % n;
    const dr = gr - tr, dc = gc - tc;
    const next = Math.abs(dr) >= Math.abs(dc) ? tail + Math.sign(dr) * n : tail + Math.sign(dc);
    const otherBefore = st.paths.reduce((a, q, k) => a + (k !== stroke.c ? q.length : 0), 0);
    if (!L.extend(st, stroke.c, next)) break;
    const otherAfter = st.paths.reduce((a, q, k) => a + (k !== stroke.c ? q.length : 0), 0);
    if (otherAfter < otherBefore) { stroke.cuts++; sfx.cut(); } else sfx.step(st.paths[stroke.c].length);
  }
  render();
});
function endStroke() {
  if (!stroke) return;
  const s = stroke; stroke = null;
  if (!L.commit(st, s.before)) { render(); return; }
  const nowConnected = L.connectedCount(st);
  if (nowConnected > s.connected && L.isConnected(st, s.c)) { sfx.link(); flashUntil = performance.now() + 500; tutorialSignal('connect'); }
  if (s.cuts) tutorialSignal('cut');
  say(defaultMsg());
  render();
  if (L.isSolved(st)) onClear();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);
const defaultMsg = () => {
  const empty = P.n * P.n - L.filledCount(st);
  return L.connectedCount(st) === st.pairs.length && empty ? `모두 이었지만 빈 칸이 ${empty}개 남았어요` : '같은 색 점을 끌어서 이어요';
};

function undo() {
  if (!playing || solvedShown || stroke || !L.undo(st)) return;
  sfx.undo(); tutorialSignal('undo'); say(defaultMsg()); render();
}
function restart() {
  if (!playing || solvedShown) return;
  loadPuzzle(P.id); tutorialSignal('restart');
}
function hint() {
  if (!playing || solvedShown || stroke) return;
  const c = L.hint(st, P.sol);
  if (c < 0) return;
  hints++; hintColor = c; flashUntil = performance.now() + 1200;
  sfx.hint(); tutorialSignal('hint');
  say('💡 한 색의 길을 알려 줬어요');
  render();
  if (L.isSolved(st)) onClear();
}
function onClear() {
  if (solvedShown) return;
  solvedShown = true; playing = false; hintColor = -1;
  sfx.win(); tutorialSignal('done');
  const prev = done[P.id];
  const better = !prev || st.moves < prev.moves || (st.moves === prev.moves && hints < prev.hints);
  if (better) { done[P.id] = { moves: st.moves, hints }; store.set(DONE_KEY, JSON.stringify(done)); }
  store.set('flowCleared', String(clearedCount()));
  say('🎉 모두 이었어요!'); render();
  setTimeout(() => {
    const idx = PUZZLES.findIndex((p) => p.id === P.id);
    const nextP = PUZZLES.slice(idx + 1).concat(PUZZLES.slice(0, idx)).find((p) => !done[p.id]);
    const perfect = st.moves <= st.pairs.length && !hints;
    showOverlay(`
      <h2>완성! 🎉</h2>
      <canvas class="prev" id="prev"></canvas>
      <p>${P.n}×${P.n} · 이동 <b>${st.moves}</b>번${hints ? ` · 힌트 ${hints}번` : ''}${perfect ? '<br>✨ 한 번에 쭉! 완벽해요' : ''}${better && prev ? '<br>🏆 내 최고 기록!' : ''}</p>
      <p style="font-size:12.5px">깬 퍼즐 ${clearedCount()} / ${PUZZLES.length}</p>
      <div class="col">${nextP ? '<button id="nextBtn">다음 퍼즐 ▶</button>' : '<p>모든 퍼즐을 깼어요! 🏆</p>'}<button id="viewBtn" class="sub">그림 보기</button><button id="listBtn" class="sub">퍼즐 선택</button></div>`);
    drawPreview($('prev'));
    $('nextBtn') && ($('nextBtn').onclick = () => loadPuzzle(nextP.id));
    $('viewBtn').onclick = hideOverlay;
    $('listBtn').onclick = () => showList(P.n);
  }, 700);
}
// 완성한 모양 미리보기
function drawPreview(cv) {
  const n = P.n, s = 150, pr = Math.min(2, window.devicePixelRatio || 1), u = s / n;
  cv.width = s * pr; cv.height = s * pr; cv.style.width = s + 'px'; cv.style.height = s + 'px';
  const g = cv.getContext('2d'); g.setTransform(pr, 0, 0, pr, 0, 0);
  g.fillStyle = '#1b1740'; g.fillRect(0, 0, s, s);
  g.lineCap = 'round'; g.lineJoin = 'round';
  st.paths.forEach((p, c) => {
    g.strokeStyle = COLORS[c]; g.lineWidth = u * 0.38; g.beginPath();
    p.forEach((i, k) => { const x = ((i % n) + 0.5) * u, y = (((i / n) | 0) + 0.5) * u; if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    for (const i of st.pairs[c]) { g.fillStyle = COLORS[c]; g.beginPath(); g.arc(((i % n) + 0.5) * u, (((i / n) | 0) + 0.5) * u, u * 0.3, 0, Math.PI * 2); g.fill(); }
  });
}
let listSize = 5;
const levelName = (n) => (n === 5 ? '쉬움' : n === 6 ? '보통' : n === 7 ? '어려움' : '아주 어려움');
function showList(sizeSel = listSize) {
  listSize = sizeSel;
  playing = false; stroke = null;
  const items = PUZZLES.filter((p) => p.n === sizeSel);
  showOverlay(`
    <h2>퍼즐 선택</h2>
    <p>깬 퍼즐 <b>${clearedCount()}</b> / ${PUZZLES.length}</p>
    <div class="tabs">${SIZES.map((s) => `<button data-size="${s}" class="${s === sizeSel ? 'on' : ''}">${s}×${s}</button>`).join('')}</div>
    <div class="scroll"><div class="pzs">${items.map((p, i) => `<button data-id="${p.id}" class="${done[p.id] ? 'done' : ''}${P && p.id === P.id ? ' cur' : ''}">${i + 1}<small>${done[p.id] ? `${done[p.id].moves}번` : levelName(p.n)}</small></button>`).join('')}</div></div>
    <button id="backBtn" class="sub">닫기</button>`);
  document.querySelectorAll('#overlay .pzs button').forEach((b) => { b.onclick = () => loadPuzzle(b.dataset.id); });
  document.querySelectorAll('#overlay .tabs button').forEach((b) => { b.onclick = () => showList(Number(b.dataset.size)); });
  $('backBtn').onclick = () => { if (st && P) { playing = !solvedShown; hideOverlay(); } };
}
function showTitle() {
  playing = false;
  const next = PUZZLES.find((p) => p.id === lastId && !done[p.id]) || PUZZLES.find((p) => !done[p.id]) || PUZZLES[0];
  const started = clearedCount() > 0;
  showOverlay(`
    <h1>플로우</h1>
    <p>같은 색 점을 <b>선으로 이어요!</b></p>
    <div class="card2" style="font-size:13px">👆 점에서 시작해 손가락을 <b>끌어서</b> 같은 색 점까지 이어요<br>🚫 선끼리는 겹칠 수 없어요 (다른 색 선을 지나가면 그 선이 끊겨요)<br>🧩 모든 점을 잇고 <b>빈 칸 없이 판을 가득</b> 채우면 성공!</div>
    <div class="col"><button id="startBtn">${started ? '이어서 하기' : '시작하기'}<small>${next.n}×${next.n} · 깬 퍼즐 ${clearedCount()}/${PUZZLES.length}</small></button><button id="listBtn" class="sub">퍼즐 선택</button></div>`);
  $('startBtn').onclick = () => loadPuzzle(next.id);
  $('listBtn').onclick = () => showList(next.n);
}

// ---------- 입력 ----------
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'z' || e.key === 'Z') undo();
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'm' || e.key === 'M') toggleMute();
});
$('undoBtn').onclick = (e) => { e.currentTarget.blur(); undo(); };
$('hintBtn').onclick = (e) => { e.currentTarget.blur(); hint(); };
$('restartBtn').onclick = (e) => { e.currentTarget.blur(); restart(); };
$('menuBtn').onclick = (e) => { e.currentTarget.blur(); if (!overlayOpen()) showList(P ? P.n : listSize); };
addEventListener('resize', () => { if (P) { layout(); render(); } });
(function loop() { requestAnimationFrame(loop); if (flashUntil && performance.now() < flashUntil + 100) draw(); })();

P = PUZZLES.find((p) => p.id === lastId) || PUZZLES[0];
st = L.newGame(P);
layout(); render();
showTitle();

/* @test-hooks:start */
window.__fl = { get st() { return st; }, get P() { return P; }, get playing() { return playing; }, get done() { return done; }, get hints() { return hints; }, loadPuzzle, undo, hint, restart, showList, PUZZLES, get cs() { return cs; } };
/* @test-hooks:end */
})();
