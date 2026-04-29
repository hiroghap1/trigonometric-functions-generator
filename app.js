"use strict";

/* =========================================================================
 * 三角関数ジェネレーター — 全機能版
 * ローカルファイルだけで動作するピュアフロントエンド。
 * ========================================================================= */

const STORAGE_KEY = "sankakukansu.v1";
const HISTORY_LIMIT = 50;

// -------- ノード種類定義 --------
const KIND_DEFS = {
  sin:        { icon: "🌸", label: "sin", cat: "fn", defaults: { a: 1, b: 1, c: 0, d: 0, useTime: false }, hint: "sin θ は単位円のy座標🌸  y = a·sin(b·x + c) + d" },
  cos:        { icon: "🍀", label: "cos", cat: "fn", defaults: { a: 1, b: 1, c: 0, d: 0, useTime: false }, hint: "cos θ は単位円のx座標🍀  y = a·cos(b·x + c) + d" },
  tan:        { icon: "🔥", label: "tan", cat: "fn", defaults: { a: 1, b: 1, c: 0, d: 0, useTime: false }, hint: "tan θ = sin/cos 🔥 漸近線に注意" },
  cot:        { icon: "❄️", label: "cot", cat: "fn", defaults: { a: 1, b: 1, c: 0, d: 0, useTime: false }, hint: "cot θ = cos/sin ❄️ tanの逆数" },
  sec:        { icon: "☀️", label: "sec", cat: "fn", defaults: { a: 1, b: 1, c: 0, d: 0, useTime: false }, hint: "sec θ = 1/cos ☀️" },
  csc:        { icon: "🌙", label: "csc", cat: "fn", defaults: { a: 1, b: 1, c: 0, d: 0, useTime: false }, hint: "csc θ = 1/sin 🌙" },
  const:      { icon: "🍡", label: "定数", cat: "const", defaults: { value: 1 }, hint: "x によらない一定の値🍡" },
  unitcircle: { icon: "⭕", label: "単位円", cat: "const", defaults: { angle: Math.PI / 4, autoRotate: false, output: "sin" }, hint: "角度θから sin/cos が得られる⭕" },
  add:        { icon: "➕", label: "合計", cat: "op",  defaults: {}, hint: "繋がっている入力の合計➕" },
  sub:        { icon: "➖", label: "差",   cat: "op",  defaults: {}, hint: "1番目の入力から残りを引く➖" },
  mul:        { icon: "✖️", label: "積",   cat: "op",  defaults: {}, hint: "繋がっている入力の積✖️" },
  div:        { icon: "➗", label: "商",   cat: "op",  defaults: {}, hint: "1番目を残りで順に割る➗" },
  shift:      { icon: "🎀", label: "平行移動", cat: "tr", defaults: { dx: 0, dy: 0 }, hint: "入力を上下/左右にずらす🎀" },
  scale:      { icon: "🎁", label: "拡大縮小", cat: "tr", defaults: { sx: 1, sy: 1 }, hint: "入力を伸縮する🎁" },
  flip:       { icon: "🪞", label: "反転", cat: "tr", defaults: { axis: "y" }, hint: "符号を反転🪞 (axis=yなら -f)" },
  diff:       { icon: "⚡", label: "微分", cat: "calc", defaults: {}, hint: "入力 f の傾き f'(x)⚡ (中央差分)" },
  integ:      { icon: "★", label: "積分", cat: "calc", defaults: {}, hint: "0→x の積分★ (台形則)" },
  output:     { icon: "📈", label: "出力", cat: "out", defaults: { mode: "graph" }, hint: "結果のグラフ📈" },
};

// -------- 状態 --------
let state = load() || createEmptyState();
let undoStack = [];
let redoStack = [];

let selectedId = null;        // ノードID
let selectedEdgeId = null;    // エッジID
let selectedGroupId = null;
let selectedNoteId = null;

let dragState = null;
let connectState = null;
let curveDragState = null;
let noteDragState = null;
let noteResizeState = null;

let animState = { playing: false, t: 0, raf: 0 };
let audioState = { ctx: null, src: null };

// -------- DOM 参照 --------
const canvas      = document.getElementById("canvas");
const canvasWrap  = document.getElementById("canvas-wrap");
const canvasStage = document.getElementById("canvas-stage");
const edgesSvg    = document.getElementById("edges");
const overlaySvg  = document.getElementById("overlay");
const inspector   = document.getElementById("inspector");
const hintTip     = document.getElementById("hint-tip");
const edgePopup   = document.getElementById("edge-popup");
const quizModal   = document.getElementById("quiz-modal");
const zoomIndicator = document.getElementById("zoom-indicator");

let panState = null;

// =========================================================================
// 初期化
// =========================================================================
init();

function init() {
  if (!state.nodes || state.nodes.length === 0) loadSample("basic");
  applyTheme(state.theme || "pastel");
  applyView();
  bindUi();
  renderAll();
  window.addEventListener("resize", () => { renderEdges(); renderGroups(); });
}

function createEmptyState() {
  return {
    nodes: [], edges: [], groups: [], notes: [],
    seq: 1,
    theme: "pastel",
    learnMode: false,
    view: { panX: 0, panY: 0, zoom: 1 },
  };
}

function bindUi() {
  // ヘッダ
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);
  document.getElementById("btn-add-node").addEventListener("click", () => addNode("sin"));
  document.getElementById("btn-screenshot").addEventListener("click", screenshot);
  document.getElementById("btn-learn").addEventListener("click", toggleLearnMode);
  document.getElementById("btn-quiz").addEventListener("click", openQuiz);
  const themeSel = document.getElementById("theme-select");
  themeSel.value = state.theme || "pastel";
  themeSel.addEventListener("change", (e) => { applyTheme(e.target.value); save(); });

  // パレット
  document.querySelectorAll(".palette .chip[data-kind]").forEach((el) => {
    el.addEventListener("click", () => addNode(el.dataset.kind));
  });
  document.querySelectorAll(".palette .chip[data-sample]").forEach((el) => {
    el.addEventListener("click", () => loadSample(el.dataset.sample));
  });

  document.getElementById("btn-add-group").addEventListener("click", addGroup);
  document.getElementById("btn-add-note").addEventListener("click", addNote);

  // 出力 / 再生
  document.getElementById("btn-play").addEventListener("click", playAnimation);
  document.getElementById("btn-stop").addEventListener("click", stopAnimation);
  document.getElementById("btn-sound").addEventListener("click", playSound);
  document.getElementById("btn-latex").addEventListener("click", copyLatex);

  // ファイル
  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("file-import").addEventListener("change", importJson);
  document.getElementById("btn-clear").addEventListener("click", clearAll);

  // 検索
  document.getElementById("search").addEventListener("input", onSearch);

  // キャンバスのパン / ズーム
  canvasWrap.addEventListener("mousedown", onCanvasMouseDown);
  canvasWrap.addEventListener("wheel", onWheel, { passive: false });
  document.getElementById("btn-zoom-in").addEventListener("click",    () => zoomBy(1.2));
  document.getElementById("btn-zoom-out").addEventListener("click",   () => zoomBy(1 / 1.2));
  document.getElementById("btn-zoom-reset").addEventListener("click", resetView);

  document.addEventListener("click", (e) => {
    if (!edgePopup.contains(e.target) && !e.target.classList.contains("edge-path")) {
      edgePopup.hidden = true;
    }
  });

  // クイズ
  document.getElementById("quiz-next").addEventListener("click", nextQuiz);
  document.getElementById("quiz-close").addEventListener("click", closeQuiz);

  // エッジポップアップ
  edgePopup.querySelectorAll("[data-label]").forEach((b) =>
    b.addEventListener("click", () => setEdgeLabel(selectedEdgeId, b.dataset.label)));
  edgePopup.querySelectorAll("[data-style]").forEach((b) =>
    b.addEventListener("click", () => setEdgeStyle(selectedEdgeId, b.dataset.style)));
  document.getElementById("edge-delete").addEventListener("click", () => {
    if (selectedEdgeId) deleteEdge(selectedEdgeId);
    edgePopup.hidden = true;
  });

  // キーボード
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
             ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")) { e.preventDefault(); redo(); }
    else if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedId) { deleteNode(selectedId); }
      else if (selectedEdgeId) { deleteEdge(selectedEdgeId); }
      else if (selectedNoteId) { deleteNote(selectedNoteId); }
      else if (selectedGroupId) { deleteGroup(selectedGroupId); }
    }
  });

  // 学習モードのhover
  canvasWrap.addEventListener("mousemove", (e) => {
    if (!state.learnMode) { hintTip.hidden = true; return; }
    const el = e.target.closest && e.target.closest(".node");
    if (!el) { hintTip.hidden = true; return; }
    const node = state.nodes.find((n) => n.id === el.dataset.id);
    if (!node) return;
    const def = KIND_DEFS[node.kind];
    if (!def || !def.hint) return;
    const rect = canvasWrap.getBoundingClientRect();
    hintTip.textContent = def.hint;
    hintTip.style.left = (e.clientX - rect.left + 14) + "px";
    hintTip.style.top  = (e.clientY - rect.top  + 14) + "px";
    hintTip.hidden = false;
  });
  canvasWrap.addEventListener("mouseleave", () => { hintTip.hidden = true; });
}

// =========================================================================
// テーマ
// =========================================================================
function applyTheme(theme) {
  document.body.dataset.theme = theme;
  state.theme = theme;
}
function toggleLearnMode() {
  state.learnMode = !state.learnMode;
  const btn = document.getElementById("btn-learn");
  btn.style.background = state.learnMode ? "var(--mint)" : "";
  save();
}

// =========================================================================
// パン / ズーム
// =========================================================================
function applyView() {
  if (!state.view) state.view = { panX: 0, panY: 0, zoom: 1 };
  const { panX, panY, zoom } = state.view;
  canvasStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  if (zoomIndicator) zoomIndicator.textContent = Math.round(zoom * 100) + "%";
}

function onCanvasMouseDown(e) {
  // 空き地でのみパン開始（ノード/メモ/エッジパス/単位円スライダー等は除外）
  const t = e.target;
  if (t !== canvasWrap && t !== canvasStage && t !== canvas &&
      t !== edgesSvg   && t !== overlaySvg) return;
  panState = {
    startX: e.clientX, startY: e.clientY,
    origPanX: state.view.panX, origPanY: state.view.panY,
    moved: false,
  };
  canvasWrap.classList.add("panning");
  document.addEventListener("mousemove", onPanMove);
  document.addEventListener("mouseup",   onPanEnd);
}
function onPanMove(e) {
  if (!panState) return;
  const dx = e.clientX - panState.startX;
  const dy = e.clientY - panState.startY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.moved = true;
  state.view.panX = panState.origPanX + dx;
  state.view.panY = panState.origPanY + dy;
  applyView();
}
function onPanEnd() {
  canvasWrap.classList.remove("panning");
  if (panState && !panState.moved) clearSelection();
  if (panState && panState.moved) save();
  panState = null;
  document.removeEventListener("mousemove", onPanMove);
  document.removeEventListener("mouseup",   onPanEnd);
}

function onWheel(e) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoomAt(factor, e.clientX, e.clientY);
}
function zoomBy(factor) {
  const r = canvasWrap.getBoundingClientRect();
  zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
}
function zoomAt(factor, clientX, clientY) {
  const v = state.view;
  const newZoom = Math.max(0.2, Math.min(4, v.zoom * factor));
  const r = canvasWrap.getBoundingClientRect();
  const cx = clientX - r.left, cy = clientY - r.top;
  const lx = (cx - v.panX) / v.zoom;
  const ly = (cy - v.panY) / v.zoom;
  v.zoom = newZoom;
  v.panX = cx - lx * newZoom;
  v.panY = cy - ly * newZoom;
  applyView();
  save();
}
function resetView() {
  state.view.panX = 0;
  state.view.panY = 0;
  state.view.zoom = 1;
  applyView();
  save();
}

// =========================================================================
// ノード操作
// =========================================================================
function addNode(kind, x, y) {
  const def = KIND_DEFS[kind];
  if (!def) return;
  pushHistory();
  const rect = canvas.getBoundingClientRect();
  const node = {
    id: "n" + state.seq++,
    kind, name: def.label,
    x: x ?? Math.round(rect.width / 2 - 50 + Math.random() * 100 - 50),
    y: y ?? Math.round(rect.height / 2 - 30 + Math.random() * 100 - 50),
    params: { ...def.defaults },
  };
  state.nodes.push(node);
  selectedId = node.id;
  selectedEdgeId = selectedGroupId = selectedNoteId = null;
  save();
  renderAll();
}
function deleteNode(id) {
  pushHistory();
  state.nodes = state.nodes.filter((n) => n.id !== id);
  state.edges = state.edges.filter((e) => e.from !== id && e.to !== id);
  state.groups.forEach((g) => g.nodeIds = g.nodeIds.filter((nid) => nid !== id));
  state.notes.forEach((m) => { if (m.attached === id) m.attached = null; });
  if (selectedId === id) selectedId = null;
  save(); renderAll();
}
function addEdge(from, to) {
  if (from === to) return;
  if (state.edges.some((e) => e.from === from && e.to === to)) return;
  pushHistory();
  state.edges.push({ id: "e" + state.seq++, from, to, label: "", style: "single", ctrl: null });
  save(); renderAll();
}
function deleteEdge(id) {
  pushHistory();
  state.edges = state.edges.filter((e) => e.id !== id);
  if (selectedEdgeId === id) selectedEdgeId = null;
  save(); renderAll();
}
function setEdgeLabel(id, label) {
  const e = state.edges.find((x) => x.id === id); if (!e) return;
  pushHistory();
  e.label = label;
  save(); renderEdges();
}
function setEdgeStyle(id, style) {
  const e = state.edges.find((x) => x.id === id); if (!e) return;
  pushHistory();
  e.style = style;
  save(); renderEdges();
}

// =========================================================================
// グループ
// =========================================================================
function addGroup() {
  pushHistory();
  const colors = ["#ffd6e7", "#d4f3e2", "#e6dcff", "#fff5b8", "#ffe1bf", "#d8ecff"];
  state.groups.push({
    id: "g" + state.seq++,
    name: "なかま" + (state.groups.length + 1),
    color: colors[state.groups.length % colors.length],
    nodeIds: [],
  });
  save(); renderAll();
}
function deleteGroup(id) {
  pushHistory();
  state.groups = state.groups.filter((g) => g.id !== id);
  if (selectedGroupId === id) selectedGroupId = null;
  save(); renderAll();
}
function toggleGroupNode(groupId, nodeId) {
  const g = state.groups.find((x) => x.id === groupId); if (!g) return;
  pushHistory();
  if (g.nodeIds.includes(nodeId)) g.nodeIds = g.nodeIds.filter((x) => x !== nodeId);
  else g.nodeIds.push(nodeId);
  save(); renderAll();
}

// =========================================================================
// メモ
// =========================================================================
function addNote() {
  pushHistory();
  const rect = canvas.getBoundingClientRect();
  state.notes.push({
    id: "m" + state.seq++,
    text: "メモを書いてね📝",
    x: Math.round(rect.width / 2 - 60 + Math.random() * 60),
    y: Math.round(rect.height / 2 - 30 + Math.random() * 60),
    w: 140, h: 70,
    rotate: -2,
    color: "#fff8c8",
    attached: null,
  });
  save(); renderAll();
}
function deleteNote(id) {
  pushHistory();
  state.notes = state.notes.filter((n) => n.id !== id);
  if (selectedNoteId === id) selectedNoteId = null;
  save(); renderAll();
}

// =========================================================================
// 履歴
// =========================================================================
function pushHistory() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state));
  state = JSON.parse(undoStack.pop());
  applyTheme(state.theme || "pastel");
  applyView();
  selectedId = selectedEdgeId = selectedGroupId = selectedNoteId = null;
  save(); renderAll();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state));
  state = JSON.parse(redoStack.pop());
  applyTheme(state.theme || "pastel");
  applyView();
  selectedId = selectedEdgeId = selectedGroupId = selectedNoteId = null;
  save(); renderAll();
}

function clearAll() {
  if (!confirm("すべて消しますか？")) return;
  pushHistory();
  state = createEmptyState();
  applyTheme("pastel");
  applyView();
  save(); renderAll();
}
function clearSelection() {
  selectedId = selectedEdgeId = selectedGroupId = selectedNoteId = null;
  edgePopup.hidden = true;
  renderAll();
}

// =========================================================================
// 評価エンジン
// =========================================================================
function evaluate(nodeId, x, t = 0, depth = 0) {
  if (depth > 60) return 0;
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return 0;
  const incoming = state.edges.filter((e) => e.to === nodeId).map((e) => e.from);
  const p = node.params || {};
  switch (node.kind) {
    case "sin": case "cos": case "tan": case "cot": case "sec": case "csc": {
      const arg = p.b * (x + (p.useTime ? t : 0)) + p.c;
      let base;
      switch (node.kind) {
        case "sin": base = Math.sin(arg); break;
        case "cos": base = Math.cos(arg); break;
        case "tan": base = Math.tan(arg); break;
        case "cot": base = 1 / Math.tan(arg); break;
        case "sec": base = 1 / Math.cos(arg); break;
        case "csc": base = 1 / Math.sin(arg); break;
      }
      return p.a * base + p.d;
    }
    case "const": return p.value;
    case "unitcircle": {
      const ang = p.angle + (p.autoRotate ? t : 0);
      return p.output === "cos" ? Math.cos(ang) : Math.sin(ang);
    }
    case "add":
      return incoming.reduce((s, id) => s + evaluate(id, x, t, depth + 1), 0);
    case "sub":
      if (!incoming.length) return 0;
      return incoming.slice(1).reduce((s, id) => s - evaluate(id, x, t, depth + 1),
        evaluate(incoming[0], x, t, depth + 1));
    case "mul":
      return incoming.reduce((s, id) => s * evaluate(id, x, t, depth + 1), 1);
    case "div":
      if (!incoming.length) return 0;
      return incoming.slice(1).reduce((s, id) => {
        const v = evaluate(id, x, t, depth + 1);
        return v === 0 ? NaN : s / v;
      }, evaluate(incoming[0], x, t, depth + 1));
    case "shift": {
      if (!incoming.length) return 0;
      return evaluate(incoming[0], x - p.dx, t, depth + 1) + p.dy;
    }
    case "scale": {
      if (!incoming.length) return 0;
      const sx = p.sx || 1;
      return p.sy * evaluate(incoming[0], x / sx, t, depth + 1);
    }
    case "flip": {
      if (!incoming.length) return 0;
      const v = evaluate(incoming[0], p.axis === "x" ? -x : x, t, depth + 1);
      return p.axis === "y" ? -v : v;
    }
    case "diff": {
      if (!incoming.length) return 0;
      const h = 1e-3;
      return (evaluate(incoming[0], x + h, t, depth + 1) -
              evaluate(incoming[0], x - h, t, depth + 1)) / (2 * h);
    }
    case "integ": {
      if (!incoming.length) return 0;
      const N = 200;
      const h = x / N;
      let s = 0;
      for (let i = 0; i <= N; i++) {
        const xi = i * h;
        const v = evaluate(incoming[0], xi, t, depth + 1);
        s += (i === 0 || i === N) ? v / 2 : v;
      }
      return s * h;
    }
    case "output": {
      if (!incoming.length) return 0;
      return evaluate(incoming[0], x, t, depth + 1);
    }
    default: return 0;
  }
}

// 出力ノードの入力一覧（リサジューや極座標で使用）
function outputInputs(nodeId) {
  return state.edges.filter((e) => e.to === nodeId).map((e) => e.from);
}

// 数式を生成（plain or LaTeX）
function formulaOf(nodeId, latex = false, depth = 0) {
  if (depth > 30) return "…";
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return "";
  const incoming = state.edges.filter((e) => e.to === nodeId).map((e) => e.from);
  const p = node.params || {};
  const xv = latex ? "x" : "x";
  switch (node.kind) {
    case "sin": case "cos": case "tan": case "cot": case "sec": case "csc": {
      const fn = latex ? "\\" + node.kind : node.kind;
      const inner = `${fmt(p.b)}${xv}${fmtSigned(p.c)}`;
      const body = `${fn}(${inner})`;
      const a = p.a === 1 ? body : (p.a === -1 ? "-" + body : `${fmt(p.a)} \\cdot ${body}`.replace("\\cdot", latex ? "\\cdot" : "·"));
      return a + (p.d ? fmtSigned(p.d) : "");
    }
    case "const":      return fmt(p.value);
    case "unitcircle": return latex
      ? `\\${p.output}(${fmt(p.angle)})`
      : `${p.output}(${fmt(p.angle)})`;
    case "add": return incoming.length
      ? incoming.map((id) => formulaOf(id, latex, depth + 1)).join(" + ") : "0";
    case "sub": return incoming.length
      ? incoming.map((id, i) => (i === 0 ? "" : " - ") + (i === 0 ? formulaOf(id, latex, depth + 1) : "(" + formulaOf(id, latex, depth + 1) + ")")).join("") : "0";
    case "mul": return incoming.length
      ? incoming.map((id) => "(" + formulaOf(id, latex, depth + 1) + ")").join(latex ? " \\cdot " : "·") : "1";
    case "div": return incoming.length
      ? incoming.map((id, i) => (i === 0 ? "" : " ÷ ") + "(" + formulaOf(id, latex, depth + 1) + ")").join("") : "1";
    case "shift": {
      if (!incoming.length) return "0";
      const inner = formulaOf(incoming[0], latex, depth + 1);
      return `(${inner})${fmtSigned(p.dy)}`;
    }
    case "scale": {
      if (!incoming.length) return "0";
      return `${fmt(p.sy)}·(${formulaOf(incoming[0], latex, depth + 1)})`;
    }
    case "flip": {
      if (!incoming.length) return "0";
      return `-(${formulaOf(incoming[0], latex, depth + 1)})`;
    }
    case "diff": {
      if (!incoming.length) return "0";
      return latex ? `\\frac{d}{dx}(${formulaOf(incoming[0], latex, depth + 1)})`
                   : `d/dx(${formulaOf(incoming[0], latex, depth + 1)})`;
    }
    case "integ": {
      if (!incoming.length) return "0";
      return latex ? `\\int_0^x (${formulaOf(incoming[0], latex, depth + 1)})\\,dx`
                   : `∫₀ˣ(${formulaOf(incoming[0], latex, depth + 1)})dx`;
    }
    case "output": {
      if (!incoming.length) return "(未接続)";
      return formulaOf(incoming[0], latex, depth + 1);
    }
  }
  return "";
}

// =========================================================================
// レンダリング
// =========================================================================
function renderAll() {
  renderNodes();
  renderEdges();
  renderGroups();
  renderNotes();
  renderInspector();
}

function renderNodes() {
  // ノードDOMを再生成
  canvas.innerHTML = "";
  state.nodes.forEach((node) => {
    const def = KIND_DEFS[node.kind];
    if (!def) return;
    const el = document.createElement("div");
    el.className = `node kind-${node.kind}` + (node.id === selectedId ? " selected" : "");
    el.dataset.id = node.id;
    el.style.left = node.x + "px";
    el.style.top  = node.y + "px";

    let inner = `
      <button class="del" title="削除">×</button>
      <div class="icon">${def.icon}</div>
      <div class="label">${escapeHtml(node.name)}</div>
      <div class="sub">${subtitleFor(node)}</div>
    `;
    if (node.kind === "unitcircle") {
      inner += `<canvas class="uc-canvas" width="110" height="110"></canvas>
                <input type="range" class="uc-range" min="0" max="${(2 * Math.PI).toFixed(4)}" step="0.01" value="${node.params.angle}">`;
    }
    if (node.kind === "output") {
      inner += `<canvas class="graph" width="210" height="90"></canvas>
                <div class="formula"></div>`;
    }
    inner += `<div class="plus" title="ドラッグして接続">＋</div>`;
    el.innerHTML = inner;
    canvas.appendChild(el);

    el.addEventListener("mousedown", onNodeMouseDown);
    el.querySelector(".del").addEventListener("click", (e) => { e.stopPropagation(); deleteNode(node.id); });
    el.querySelector(".plus").addEventListener("mousedown", (e) => { e.stopPropagation(); startConnect(node.id, e); });

    if (node.kind === "unitcircle") {
      const range = el.querySelector(".uc-range");
      range.addEventListener("input", () => {
        node.params.angle = parseFloat(range.value);
        save();
        drawUnitCircle(node);
        // 出力ノード再描画
        state.nodes.filter((n) => n.kind === "output").forEach(drawOutput);
      });
      range.addEventListener("mousedown", (e) => e.stopPropagation());
      drawUnitCircle(node);
    }
  });

  state.nodes.filter((n) => n.kind === "output").forEach(drawOutput);
}

function renderEdges() {
  const ns = "http://www.w3.org/2000/svg";
  edgesSvg.innerHTML = "";
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `
    <marker id="arrow"      viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 Z" fill="var(--edge)"/>
    </marker>
    <marker id="arrowStart" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M10,0 L0,5 L10,10 Z" fill="var(--edge)"/>
    </marker>`;
  edgesSvg.appendChild(defs);

  state.edges.forEach((edge) => {
    const a = nodeAnchor(edge.from, "right");
    const b = nodeAnchor(edge.to, "left");
    if (!a || !b) return;
    const cx = (a.x + b.x) / 2 + (edge.ctrl ? edge.ctrl.dx : 0);
    const cy = (a.y + b.y) / 2 + (edge.ctrl ? edge.ctrl.dy : 0);

    // 描画path（スタイル別）
    const visible = document.createElementNS(ns, "path");
    let d;
    if (edge.style === "wavy") {
      // 波線: 始点→終点を波として表現
      d = wavyPath(a, b, cx, cy);
    } else {
      d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
    }
    visible.setAttribute("d", d);
    visible.setAttribute("fill", "none");
    visible.setAttribute("stroke", "var(--edge)");
    visible.setAttribute("stroke-width", edge.id === selectedEdgeId ? "3" : "2");
    if (edge.style === "dotted") visible.setAttribute("stroke-dasharray", "4 4");
    visible.setAttribute("marker-end", "url(#arrow)");
    if (edge.style === "double") visible.setAttribute("marker-start", "url(#arrowStart)");
    edgesSvg.appendChild(visible);

    // 当たり判定用の太いpath（透明）
    const hit = document.createElementNS(ns, "path");
    hit.setAttribute("d", d);
    hit.setAttribute("class", "edge-path");
    hit.dataset.id = edge.id;
    hit.addEventListener("click", (e) => onEdgeClick(edge.id, e));
    edgesSvg.appendChild(hit);

    // ラベル
    if (edge.label) {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", cy - 6);
      text.setAttribute("class", "edge-label");
      text.setAttribute("text-anchor", "middle");
      text.textContent = edge.label;
      edgesSvg.appendChild(text);
    }

    // カーブハンドル（PC：選択中のみ）
    if (edge.id === selectedEdgeId) {
      const handle = document.createElementNS(ns, "circle");
      handle.setAttribute("cx", cx);
      handle.setAttribute("cy", cy);
      handle.setAttribute("r", 6);
      handle.setAttribute("class", "edge-curve-handle");
      handle.style.pointerEvents = "auto";
      handle.addEventListener("mousedown", (e) => startCurveDrag(edge.id, e));
      edgesSvg.appendChild(handle);
    }
  });

  // 接続中の仮線
  if (connectState && connectState.cursor) {
    const a = nodeAnchor(connectState.from, "right");
    if (a) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${a.x} ${a.y} L ${connectState.cursor.x} ${connectState.cursor.y}`);
      path.setAttribute("stroke", "var(--edge)");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-dasharray", "6 4");
      path.setAttribute("fill", "none");
      edgesSvg.appendChild(path);
    }
  }
}

function wavyPath(a, b, cx, cy) {
  // 始点→終点を6個ぐらいの波で繋ぐ
  const segs = 8;
  let d = `M ${a.x} ${a.y} `;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
    const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
    const dxLine = b.x - a.x, dyLine = b.y - a.y;
    const len = Math.hypot(dxLine, dyLine) || 1;
    const nx = -dyLine / len, ny = dxLine / len;
    const wave = (i % 2 === 0 ? -1 : 1) * 5;
    d += `Q ${x + nx * wave} ${y + ny * wave} ${x} ${y} `;
  }
  return d;
}

function renderGroups() {
  const ns = "http://www.w3.org/2000/svg";
  overlaySvg.innerHTML = "";
  state.groups.forEach((g) => {
    if (!g.nodeIds.length) return;
    const rects = g.nodeIds.map((id) => {
      const el = canvas.querySelector(`.node[data-id="${id}"]`);
      if (!el) return null;
      return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    }).filter(Boolean);
    if (!rects.length) return;
    const pad = 14;
    const x = Math.min(...rects.map((r) => r.x)) - pad;
    const y = Math.min(...rects.map((r) => r.y)) - pad - 14;
    const x2 = Math.max(...rects.map((r) => r.x + r.w)) + pad;
    const y2 = Math.max(...rects.map((r) => r.y + r.h)) + pad;

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("class", "group-rect");
    rect.setAttribute("x", x); rect.setAttribute("y", y);
    rect.setAttribute("width",  Math.max(40, x2 - x));
    rect.setAttribute("height", Math.max(40, y2 - y));
    rect.setAttribute("fill", g.color);
    rect.setAttribute("fill-opacity", g.id === selectedGroupId ? 0.55 : 0.35);
    rect.style.pointerEvents = "auto";
    rect.style.cursor = "pointer";
    rect.addEventListener("click", () => {
      clearSelection();
      selectedGroupId = g.id;
      renderInspector();
      renderGroups();
    });
    overlaySvg.appendChild(rect);

    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", x + 12);
    text.setAttribute("y", y + 14);
    text.setAttribute("class", "group-label");
    text.textContent = "🌈 " + g.name;
    overlaySvg.appendChild(text);
  });
}

function renderNotes() {
  // 既存のメモを除去
  canvas.querySelectorAll(".note").forEach((el) => el.remove());
  const ns = "http://www.w3.org/2000/svg";

  state.notes.forEach((note) => {
    const el = document.createElement("div");
    el.className = "note" + (note.id === selectedNoteId ? " selected" : "");
    el.dataset.id = note.id;
    el.style.left = note.x + "px";
    el.style.top  = note.y + "px";
    el.style.width  = note.w + "px";
    el.style.height = note.h + "px";
    el.style.transform = `rotate(${note.rotate || 0}deg)`;
    el.style.background = note.color || "#fff8c8";
    el.innerHTML = `
      <button class="del" title="削除">×</button>
      <textarea>${escapeHtml(note.text)}</textarea>
      <div class="resize-h"></div>
    `;
    canvas.appendChild(el);

    el.querySelector(".del").addEventListener("click", (e) => { e.stopPropagation(); deleteNote(note.id); });
    el.addEventListener("mousedown", (e) => onNoteMouseDown(note.id, e));
    el.querySelector(".resize-h").addEventListener("mousedown", (e) => { e.stopPropagation(); startNoteResize(note.id, e); });
    const ta = el.querySelector("textarea");
    ta.addEventListener("input", () => { note.text = ta.value; save(); });
    ta.addEventListener("mousedown", (e) => e.stopPropagation());
  });

  // 付箋とノードを点線で結ぶ
  state.notes.forEach((note) => {
    if (!note.attached) return;
    const target = canvas.querySelector(`.node[data-id="${note.attached}"]`);
    const noteEl = canvas.querySelector(`.note[data-id="${note.id}"]`);
    if (!target || !noteEl) return;
    const tx = target.offsetLeft + target.offsetWidth / 2;
    const ty = target.offsetTop  + target.offsetHeight / 2;
    const nx = noteEl.offsetLeft + noteEl.offsetWidth / 2;
    const ny = noteEl.offsetTop  + noteEl.offsetHeight / 2;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", `M ${nx} ${ny} L ${tx} ${ty}`);
    path.setAttribute("stroke", "var(--pink-strong)");
    path.setAttribute("stroke-dasharray", "3 4");
    path.setAttribute("stroke-width", "1.4");
    path.setAttribute("fill", "none");
    overlaySvg.appendChild(path);
  });
}

function nodeAnchor(id, side = "right") {
  const el = canvas.querySelector(`.node[data-id="${id}"]`);
  if (!el) return null;
  const w = el.offsetWidth, h = el.offsetHeight;
  const cx = el.offsetLeft + w / 2, cy = el.offsetTop + h / 2;
  if (side === "right") return { x: el.offsetLeft + w, y: cy };
  if (side === "left")  return { x: el.offsetLeft,     y: cy };
  return { x: cx, y: cy };
}

function subtitleFor(node) {
  const p = node.params || {};
  switch (node.kind) {
    case "sin": case "cos": case "tan":
    case "cot": case "sec": case "csc":
      return `${fmt(p.a)}·${node.kind}(${fmt(p.b)}x${fmtSigned(p.c)})${fmtSigned(p.d)}` + (p.useTime ? " ⏱" : "");
    case "const":      return `= ${fmt(p.value)}`;
    case "unitcircle": return `θ=${fmt(p.angle)} → ${p.output}`;
    case "add":  return "Σ 入力";
    case "sub":  return "1番目 - 残り";
    case "mul":  return "Π 入力";
    case "div":  return "1番目 / 残り";
    case "shift": return `(x${fmtSigned(-p.dx)})${fmtSigned(p.dy)}`;
    case "scale": return `×${fmt(p.sy)}（x/${fmt(p.sx)}）`;
    case "flip":  return `反転 ${p.axis}軸`;
    case "diff":  return "f'(x)";
    case "integ": return "∫₀ˣ f dx";
    case "output": return ({graph:"y = f(x)", lissajous:"(f₁,f₂)", polar:"r = f(θ)"}[p.mode] || "出力");
  }
  return "";
}

// =========================================================================
// 出力グラフ描画
// =========================================================================
function drawOutput(node) {
  const el = canvas.querySelector(`.node[data-id="${node.id}"]`);
  if (!el) return;
  const cv = el.querySelector("canvas.graph");
  const formulaEl = el.querySelector(".formula");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const styles = getComputedStyle(document.body);
  const lineCol = styles.getPropertyValue("--line").trim() || "#f1c8d8";
  const edgeCol = styles.getPropertyValue("--edge").trim() || "#ff8fb5";

  const mode = (node.params && node.params.mode) || "graph";
  const t = animState.t;

  if (mode === "graph") {
    drawAxes(ctx, w, h, lineCol);
    const xMin = -2 * Math.PI, xMax = 2 * Math.PI;
    const yScale = 18;
    ctx.beginPath();
    ctx.strokeStyle = edgeCol; ctx.lineWidth = 2;
    let started = false, lastY = null;
    for (let px = 0; px <= w; px++) {
      const x = xMin + (px / w) * (xMax - xMin);
      let y = evaluate(node.id, x, t);
      if (!isFinite(y)) { started = false; continue; }
      y = Math.max(-h, Math.min(h, y));
      const py = h / 2 - y * yScale;
      if (!started || (lastY !== null && Math.abs(py - lastY) > h * 0.7)) {
        ctx.moveTo(px, py); started = true;
      } else ctx.lineTo(px, py);
      lastY = py;
    }
    ctx.stroke();
  } else if (mode === "lissajous") {
    // 入力2つを (x(t), y(t)) として描く
    const ins = outputInputs(node.id);
    if (ins.length < 2) {
      drawAxes(ctx, w, h, lineCol);
      ctx.fillStyle = "#bbb";
      ctx.font = "12px sans-serif";
      ctx.fillText("入力2つを繋ぐと描画されるよ", 6, h / 2);
      return;
    }
    drawAxes(ctx, w, h, lineCol);
    ctx.beginPath();
    ctx.strokeStyle = edgeCol; ctx.lineWidth = 1.5;
    const N = 400;
    const sc = Math.min(w, h) / 4;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 * Math.PI;
      const xv = evaluate(ins[0], u, t);
      const yv = evaluate(ins[1], u, t);
      const px = w / 2 + xv * sc;
      const py = h / 2 - yv * sc;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (mode === "polar") {
    drawAxes(ctx, w, h, lineCol);
    ctx.beginPath();
    ctx.strokeStyle = edgeCol; ctx.lineWidth = 1.5;
    const N = 400;
    const sc = Math.min(w, h) / 4;
    let started = false;
    for (let i = 0; i <= N; i++) {
      const theta = (i / N) * 2 * Math.PI;
      const r = evaluate(node.id, theta, t);
      if (!isFinite(r)) { started = false; continue; }
      const px = w / 2 + r * Math.cos(theta) * sc;
      const py = h / 2 - r * Math.sin(theta) * sc;
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  if (formulaEl) {
    const expr = formulaOf(node.id);
    formulaEl.textContent = (mode === "graph" ? "y = " : mode === "polar" ? "r = " : "(x,y) = ") + expr;
  }
}

function drawAxes(ctx, w, h, lineCol) {
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
}

function drawUnitCircle(node) {
  const el = canvas.querySelector(`.node[data-id="${node.id}"]`);
  if (!el) return;
  const cv = el.querySelector("canvas.uc-canvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
  const styles = getComputedStyle(document.body);
  const lineCol = styles.getPropertyValue("--line").trim();
  const edgeCol = styles.getPropertyValue("--edge").trim();

  ctx.strokeStyle = lineCol;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();

  const ang = node.params.angle + (node.params.autoRotate ? animState.t : 0);
  const px = cx + r * Math.cos(ang);
  const py = cy - r * Math.sin(ang);

  // 補助線
  ctx.strokeStyle = "#bbb";
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, py); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = edgeCol;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();

  ctx.fillStyle = edgeCol;
  ctx.beginPath(); ctx.arc(px, py, 4, 0, 2 * Math.PI); ctx.fill();

  ctx.fillStyle = "#888";
  ctx.font = "10px sans-serif";
  ctx.fillText(`θ=${ang.toFixed(2)}`, 4, 12);
  ctx.fillText(`sin=${Math.sin(ang).toFixed(2)}`, 4, h - 14);
  ctx.fillText(`cos=${Math.cos(ang).toFixed(2)}`, 4, h - 2);
}

// =========================================================================
// インスペクタ
// =========================================================================
function renderInspector() {
  if (selectedEdgeId) return renderEdgeInspector();
  if (selectedGroupId) return renderGroupInspector();
  if (selectedNoteId) return renderNoteInspector();
  if (selectedId)     return renderNodeInspector();
  inspector.innerHTML = `<p class="muted">ノード・線・グループ・メモをクリックすると編集できます</p>`;
}

function renderNodeInspector() {
  const node = state.nodes.find((n) => n.id === selectedId);
  if (!node) return;
  const p = node.params || {};
  let html = `<div class="row"><label>名前</label><input type="text" data-key="name" value="${escapeAttr(node.name)}"></div>`;

  if (["sin", "cos", "tan", "cot", "sec", "csc"].includes(node.kind)) {
    html += `
      <p class="muted">y = a · ${node.kind}(b·x + c) + d</p>
      <div class="row"><label>a 振幅</label><input type="number" step="0.1" data-key="params.a" value="${p.a}"></div>
      <div class="row"><label>b 周期</label><input type="number" step="0.1" data-key="params.b" value="${p.b}"></div>
      <div class="row"><label>c 位相</label><input type="number" step="0.1" data-key="params.c" value="${p.c}"></div>
      <div class="row"><label>d 上下</label><input type="number" step="0.1" data-key="params.d" value="${p.d}"></div>
      <div class="row"><label>時間連動</label><input type="checkbox" data-key="params.useTime" ${p.useTime ? "checked" : ""}></div>
    `;
  } else if (node.kind === "const") {
    html += `<div class="row"><label>値</label><input type="number" step="0.1" data-key="params.value" value="${p.value}"></div>`;
  } else if (node.kind === "unitcircle") {
    html += `
      <div class="row"><label>角度θ</label><input type="number" step="0.05" data-key="params.angle" value="${p.angle}"></div>
      <div class="row"><label>自動回転</label><input type="checkbox" data-key="params.autoRotate" ${p.autoRotate ? "checked" : ""}></div>
      <div class="row"><label>出力</label>
        <select data-key="params.output">
          <option value="sin" ${p.output==="sin"?"selected":""}>sin θ</option>
          <option value="cos" ${p.output==="cos"?"selected":""}>cos θ</option>
        </select>
      </div>
    `;
  } else if (node.kind === "shift") {
    html += `
      <div class="row"><label>dx 横</label><input type="number" step="0.1" data-key="params.dx" value="${p.dx}"></div>
      <div class="row"><label>dy 縦</label><input type="number" step="0.1" data-key="params.dy" value="${p.dy}"></div>
    `;
  } else if (node.kind === "scale") {
    html += `
      <div class="row"><label>sx 横倍率</label><input type="number" step="0.1" data-key="params.sx" value="${p.sx}"></div>
      <div class="row"><label>sy 縦倍率</label><input type="number" step="0.1" data-key="params.sy" value="${p.sy}"></div>
    `;
  } else if (node.kind === "flip") {
    html += `
      <div class="row"><label>軸</label>
        <select data-key="params.axis">
          <option value="y" ${p.axis==="y"?"selected":""}>y軸（上下反転 -f）</option>
          <option value="x" ${p.axis==="x"?"selected":""}>x軸（左右反転 f(-x)）</option>
        </select>
      </div>
    `;
  } else if (node.kind === "output") {
    html += `
      <div class="row"><label>モード</label>
        <select data-key="params.mode">
          <option value="graph"     ${p.mode==="graph"?"selected":""}>グラフ y=f(x)</option>
          <option value="lissajous" ${p.mode==="lissajous"?"selected":""}>リサジュー (x,y)</option>
          <option value="polar"     ${p.mode==="polar"?"selected":""}>極座標 r=f(θ)</option>
        </select>
      </div>
    `;
  } else {
    html += `<p class="muted">このノードに編集項目はありません</p>`;
  }

  // グループ所属
  if (state.groups.length) {
    html += `<p class="muted">グループ</p>`;
    state.groups.forEach((g) => {
      html += `<div class="row"><label>${escapeHtml(g.name)}</label>
        <input type="checkbox" data-group="${g.id}" ${g.nodeIds.includes(node.id) ? "checked" : ""}></div>`;
    });
  }

  inspector.innerHTML = html;

  inspector.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("change", () => commitInspector(el, node));
    if (el.type !== "checkbox" && el.tagName !== "SELECT") {
      el.addEventListener("input", () => commitInspector(el, node));
    }
  });
}

function commitInspector(el, node) {
  const groupKey = el.dataset.group;
  if (groupKey) {
    toggleGroupNode(groupKey, node.id);
    return;
  }
  const key = el.dataset.key;
  if (!key) return;
  let value;
  if (el.type === "checkbox") value = el.checked;
  else if (el.type === "number") value = parseFloat(el.value);
  else value = el.value;
  if (key.startsWith("params.")) {
    node.params[key.slice(7)] = (typeof value === "number" && isNaN(value)) ? 0 : value;
  } else {
    node[key] = value;
  }
  save();
  renderNodes();
  renderEdges();
  renderGroups();
}

function renderEdgeInspector() {
  const edge = state.edges.find((e) => e.id === selectedEdgeId);
  if (!edge) return;
  inspector.innerHTML = `
    <p class="muted">関係線の編集</p>
    <div class="row"><label>ラベル</label><input type="text" id="i-edge-label" value="${escapeAttr(edge.label || "")}"></div>
    <div class="row"><label>スタイル</label>
      <select id="i-edge-style">
        <option value="single" ${edge.style==="single"?"selected":""}>→ 片方向</option>
        <option value="double" ${edge.style==="double"?"selected":""}>↔ 両方向</option>
        <option value="dotted" ${edge.style==="dotted"?"selected":""}>⋯ 点線</option>
        <option value="wavy"   ${edge.style==="wavy"?"selected":""}>∿ 波線</option>
      </select>
    </div>
    <p class="muted">線をクリックでもクイック編集できます</p>
    <button class="chip" id="i-edge-del">🗑 削除</button>
  `;
  document.getElementById("i-edge-label").addEventListener("input", (e) => setEdgeLabel(edge.id, e.target.value));
  document.getElementById("i-edge-style").addEventListener("change", (e) => setEdgeStyle(edge.id, e.target.value));
  document.getElementById("i-edge-del").addEventListener("click", () => deleteEdge(edge.id));
}

function renderGroupInspector() {
  const g = state.groups.find((x) => x.id === selectedGroupId);
  if (!g) return;
  let html = `
    <p class="muted">グループの編集</p>
    <div class="row"><label>名前</label><input type="text" id="i-g-name" value="${escapeAttr(g.name)}"></div>
    <div class="row"><label>色</label><input type="color" id="i-g-color" value="${g.color}"></div>
    <p class="muted">含まれるノード</p>
  `;
  state.nodes.forEach((n) => {
    html += `<div class="row"><label>${escapeHtml(KIND_DEFS[n.kind].icon + " " + n.name)}</label>
      <input type="checkbox" data-nid="${n.id}" ${g.nodeIds.includes(n.id) ? "checked" : ""}></div>`;
  });
  html += `<button class="chip" id="i-g-del">🗑 グループ削除</button>`;
  inspector.innerHTML = html;
  document.getElementById("i-g-name").addEventListener("input", (e) => { g.name = e.target.value; save(); renderGroups(); });
  document.getElementById("i-g-color").addEventListener("input", (e) => { g.color = e.target.value; save(); renderGroups(); });
  inspector.querySelectorAll("[data-nid]").forEach((cb) => {
    cb.addEventListener("change", () => toggleGroupNode(g.id, cb.dataset.nid));
  });
  document.getElementById("i-g-del").addEventListener("click", () => deleteGroup(g.id));
}

function renderNoteInspector() {
  const m = state.notes.find((x) => x.id === selectedNoteId);
  if (!m) return;
  let html = `
    <p class="muted">メモの編集</p>
    <div class="row"><label>角度</label><input type="number" step="1" id="i-m-rot" value="${m.rotate || 0}"></div>
    <div class="row"><label>色</label><input type="color" id="i-m-color" value="${m.color || "#fff8c8"}"></div>
    <div class="row"><label>結ぶ先</label>
      <select id="i-m-attach">
        <option value="">（なし）</option>
        ${state.nodes.map((n) => `<option value="${n.id}" ${m.attached===n.id?"selected":""}>${escapeHtml(KIND_DEFS[n.kind].icon + " " + n.name)}</option>`).join("")}
      </select>
    </div>
    <button class="chip" id="i-m-del">🗑 メモ削除</button>
  `;
  inspector.innerHTML = html;
  document.getElementById("i-m-rot").addEventListener("input", (e) => { m.rotate = parseFloat(e.target.value) || 0; save(); renderNotes(); });
  document.getElementById("i-m-color").addEventListener("input", (e) => { m.color = e.target.value; save(); renderNotes(); });
  document.getElementById("i-m-attach").addEventListener("change", (e) => { m.attached = e.target.value || null; save(); renderNotes(); });
  document.getElementById("i-m-del").addEventListener("click", () => deleteNote(m.id));
}

// =========================================================================
// ドラッグ
// =========================================================================
function onNodeMouseDown(e) {
  if (e.target.classList.contains("plus") ||
      e.target.classList.contains("del") ||
      e.target.classList.contains("uc-range")) return;
  const el = e.currentTarget;
  const id = el.dataset.id;
  selectedId = id; selectedEdgeId = selectedGroupId = selectedNoteId = null;
  edgePopup.hidden = true;
  const node = state.nodes.find((n) => n.id === id);
  dragState = {
    id, startX: e.clientX, startY: e.clientY,
    origX: node.x, origY: node.y, moved: false,
  };
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup",   onDragEnd);
  renderInspector();
  renderNodes();
}
function onDragMove(e) {
  if (!dragState) return;
  const node = state.nodes.find((n) => n.id === dragState.id);
  if (!node) return;
  if (!dragState.moved) { pushHistory(); dragState.moved = true; }
  const z = state.view.zoom;
  node.x = dragState.origX + (e.clientX - dragState.startX) / z;
  node.y = dragState.origY + (e.clientY - dragState.startY) / z;
  const el = canvas.querySelector(`.node[data-id="${node.id}"]`);
  if (el) { el.style.left = node.x + "px"; el.style.top = node.y + "px"; }
  renderEdges();
  renderGroups();
}
function onDragEnd() {
  if (dragState && dragState.moved) save();
  dragState = null;
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup",   onDragEnd);
}

function startConnect(fromId, e) {
  connectState = { from: fromId, cursor: relPoint(e) };
  document.addEventListener("mousemove", onConnectMove);
  document.addEventListener("mouseup",   onConnectEnd);
}
function onConnectMove(e) {
  if (!connectState) return;
  connectState.cursor = relPoint(e);
  renderEdges();
}
function onConnectEnd(e) {
  document.removeEventListener("mousemove", onConnectMove);
  document.removeEventListener("mouseup",   onConnectEnd);
  if (!connectState) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const nodeEl = target && target.closest && target.closest(".node");
  if (nodeEl && nodeEl.dataset.id !== connectState.from) {
    addEdge(connectState.from, nodeEl.dataset.id);
  }
  connectState = null;
  renderEdges();
}
function relPoint(e) {
  const r = canvasWrap.getBoundingClientRect();
  const v = state.view;
  return {
    x: (e.clientX - r.left - v.panX) / v.zoom,
    y: (e.clientY - r.top  - v.panY) / v.zoom,
  };
}

function startCurveDrag(edgeId, e) {
  e.stopPropagation();
  const edge = state.edges.find((x) => x.id === edgeId);
  if (!edge) return;
  pushHistory();
  curveDragState = { id: edgeId, startX: e.clientX, startY: e.clientY,
    origDx: (edge.ctrl ? edge.ctrl.dx : 0), origDy: (edge.ctrl ? edge.ctrl.dy : 0) };
  document.addEventListener("mousemove", onCurveMove);
  document.addEventListener("mouseup",   onCurveEnd);
}
function onCurveMove(e) {
  if (!curveDragState) return;
  const edge = state.edges.find((x) => x.id === curveDragState.id);
  if (!edge) return;
  const z = state.view.zoom;
  edge.ctrl = {
    dx: curveDragState.origDx + (e.clientX - curveDragState.startX) / z,
    dy: curveDragState.origDy + (e.clientY - curveDragState.startY) / z,
  };
  renderEdges();
}
function onCurveEnd() {
  if (curveDragState) save();
  curveDragState = null;
  document.removeEventListener("mousemove", onCurveMove);
  document.removeEventListener("mouseup",   onCurveEnd);
}

function onEdgeClick(edgeId, e) {
  e.stopPropagation();
  selectedEdgeId = edgeId;
  selectedId = selectedGroupId = selectedNoteId = null;
  // ポップアップ（ビューポート基準で配置）
  edgePopup.style.left = (e.clientX + 10) + "px";
  edgePopup.style.top  = (e.clientY + 10) + "px";
  edgePopup.hidden = false;
  renderInspector();
  renderEdges();
}

function onNoteMouseDown(noteId, e) {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.target.classList.contains("resize-h")) return;
  if (e.target.classList.contains("del")) return;
  selectedNoteId = noteId; selectedId = selectedEdgeId = selectedGroupId = null;
  const m = state.notes.find((n) => n.id === noteId);
  noteDragState = {
    id: noteId, startX: e.clientX, startY: e.clientY,
    origX: m.x, origY: m.y, moved: false,
  };
  document.addEventListener("mousemove", onNoteMove);
  document.addEventListener("mouseup",   onNoteEnd);
  renderInspector();
  renderNotes();
}
function onNoteMove(e) {
  if (!noteDragState) return;
  const m = state.notes.find((n) => n.id === noteDragState.id);
  if (!m) return;
  if (!noteDragState.moved) { pushHistory(); noteDragState.moved = true; }
  const z = state.view.zoom;
  m.x = noteDragState.origX + (e.clientX - noteDragState.startX) / z;
  m.y = noteDragState.origY + (e.clientY - noteDragState.startY) / z;
  renderNotes();
}
function onNoteEnd() {
  if (noteDragState && noteDragState.moved) save();
  noteDragState = null;
  document.removeEventListener("mousemove", onNoteMove);
  document.removeEventListener("mouseup",   onNoteEnd);
}

function startNoteResize(noteId, e) {
  const m = state.notes.find((n) => n.id === noteId);
  if (!m) return;
  pushHistory();
  noteResizeState = { id: noteId, startX: e.clientX, startY: e.clientY, origW: m.w, origH: m.h };
  document.addEventListener("mousemove", onNoteResize);
  document.addEventListener("mouseup",   onNoteResizeEnd);
}
function onNoteResize(e) {
  if (!noteResizeState) return;
  const m = state.notes.find((n) => n.id === noteResizeState.id);
  if (!m) return;
  const z = state.view.zoom;
  m.w = Math.max(80,  noteResizeState.origW + (e.clientX - noteResizeState.startX) / z);
  m.h = Math.max(40,  noteResizeState.origH + (e.clientY - noteResizeState.startY) / z);
  renderNotes();
}
function onNoteResizeEnd() {
  if (noteResizeState) save();
  noteResizeState = null;
  document.removeEventListener("mousemove", onNoteResize);
  document.removeEventListener("mouseup",   onNoteResizeEnd);
}

// =========================================================================
// 検索
// =========================================================================
function onSearch(e) {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".node").forEach((el) => {
    const node = state.nodes.find((n) => n.id === el.dataset.id);
    if (!node) return;
    const text = (node.name + " " + node.kind).toLowerCase();
    el.style.opacity = q && !text.includes(q) ? 0.2 : 1;
  });
}

// =========================================================================
// 保存 / 読込
// =========================================================================
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return migrate(data);
  } catch (_) { return null; }
}
function migrate(data) {
  const base = createEmptyState();
  return {
    ...base,
    ...data,
    groups: data.groups || [],
    notes:  data.notes  || [],
    edges:  (data.edges || []).map((e) => ({
      id: e.id, from: e.from, to: e.to,
      label: e.label || "",
      style: e.style || "single",
      ctrl:  e.ctrl  || null,
    })),
    view:   { ...base.view, ...(data.view || {}) },
    theme:  data.theme  || "pastel",
    learnMode: !!data.learnMode,
  };
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "graph.sankakukansu.json"; a.click();
  URL.revokeObjectURL(url);
}
function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.nodes || !data.edges) throw new Error("形式エラー");
      pushHistory();
      state = migrate(data);
      applyTheme(state.theme || "pastel");
      applyView();
      selectedId = selectedEdgeId = selectedGroupId = selectedNoteId = null;
      save(); renderAll();
    } catch (err) {
      alert("読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// =========================================================================
// サンプル
// =========================================================================
function loadSample(kind) {
  pushHistory();
  state = createEmptyState();
  applyTheme(state.theme || document.body.dataset.theme || "pastel");
  applyView();
  const cw = canvas.clientWidth || 700;
  const ch = canvas.clientHeight || 500;

  const at = (x, y) => ({ x, y });

  if (kind === "basic") {
    const a = mkNode("sin",     80, ch / 2 - 40);
    const o = mkNode("output", cw - 280, ch / 2 - 60);
    addEdgeRaw(a.id, o.id);
  } else if (kind === "sum") {
    const s   = mkNode("sin",   60, 60);
    const c   = mkNode("cos",   60, ch - 160);
    const add = mkNode("add",   cw / 2 - 60, ch / 2 - 30);
    const o   = mkNode("output", cw - 280, ch / 2 - 60);
    addEdgeRaw(s.id, add.id);
    addEdgeRaw(c.id, add.id);
    addEdgeRaw(add.id, o.id);
  } else if (kind === "beat") {
    const s1 = mkNode("sin",   60, 60,           { a: 1, b: 1.0 });
    const s2 = mkNode("sin",   60, ch - 160,      { a: 1, b: 1.1 });
    const add = mkNode("add",  cw / 2 - 60, ch / 2 - 30);
    const o   = mkNode("output", cw - 280, ch / 2 - 60);
    addEdgeRaw(s1.id, add.id); addEdgeRaw(s2.id, add.id); addEdgeRaw(add.id, o.id);
  } else if (kind === "fourier") {
    const harmonics = [1, 3, 5, 7, 9];
    const add = mkNode("add", cw / 2 - 60, ch / 2 - 30);
    harmonics.forEach((h, i) => {
      const n = mkNode("sin", 60, 30 + i * 70, { a: 1 / h, b: h, c: 0, d: 0 });
      addEdgeRaw(n.id, add.id);
    });
    const o = mkNode("output", cw - 280, ch / 2 - 60);
    addEdgeRaw(add.id, o.id);
  } else if (kind === "lissajous") {
    const sx = mkNode("sin", 60, 80,         { a: 1, b: 3 });
    const sy = mkNode("sin", 60, ch - 160,   { a: 1, b: 2, c: Math.PI / 2 });
    const o  = mkNode("output", cw - 280, ch / 2 - 60, { mode: "lissajous" });
    addEdgeRaw(sx.id, o.id); addEdgeRaw(sy.id, o.id);
  } else if (kind === "pendulum") {
    const c = mkNode("cos", 60, ch / 2 - 30, { a: 1, b: 1, c: 0, d: 0, useTime: true });
    const o = mkNode("output", cw - 280, ch / 2 - 60);
    addEdgeRaw(c.id, o.id);
    const m = state.notes.push({
      id: "m" + state.seq++,
      text: "θ(t) = cos(t)\n振り子の単振動🪀",
      x: cw / 2 - 80, y: 60, w: 160, h: 70, rotate: -3, color: "#fff8c8", attached: c.id,
    });
  }
  save(); renderAll();
}

function mkNode(kind, x, y, params) {
  const def = KIND_DEFS[kind];
  const node = {
    id: "n" + state.seq++,
    kind, name: def.label,
    x, y,
    params: { ...def.defaults, ...(params || {}) },
  };
  state.nodes.push(node);
  return node;
}
function addEdgeRaw(from, to) {
  state.edges.push({ id: "e" + state.seq++, from, to, label: "", style: "single", ctrl: null });
}

// =========================================================================
// アニメーション
// =========================================================================
function playAnimation() {
  if (animState.playing) return;
  animState.playing = true;
  const start = performance.now();
  const startT = animState.t;
  const loop = (now) => {
    if (!animState.playing) return;
    animState.t = startT + (now - start) / 1000;
    state.nodes.filter((n) => n.kind === "output").forEach(drawOutput);
    state.nodes.filter((n) => n.kind === "unitcircle" && n.params.autoRotate).forEach(drawUnitCircle);
    animState.raf = requestAnimationFrame(loop);
  };
  animState.raf = requestAnimationFrame(loop);
}
function stopAnimation() {
  animState.playing = false;
  if (animState.raf) cancelAnimationFrame(animState.raf);
  animState.raf = 0;
}

// =========================================================================
// 音再生
// =========================================================================
function playSound() {
  const out = state.nodes.find((n) => n.kind === "output");
  if (!out) { alert("出力ノードがありません"); return; }
  if (audioState.src) try { audioState.src.stop(); } catch (_) {}
  if (!audioState.ctx) audioState.ctx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = audioState.ctx;
  const dur = 1.5;
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate * dur, sampleRate);
  const ch = buffer.getChannelData(0);
  const freq = 220;
  let maxAbs = 0;
  for (let i = 0; i < ch.length; i++) {
    const t = i / sampleRate;
    const x = 2 * Math.PI * freq * t;
    const v = evaluate(out.id, x, t);
    ch[i] = isFinite(v) ? v : 0;
    if (Math.abs(ch[i]) > maxAbs) maxAbs = Math.abs(ch[i]);
  }
  // 正規化 + フェード
  const norm = maxAbs > 0 ? 0.4 / maxAbs : 0;
  for (let i = 0; i < ch.length; i++) {
    let env = 1;
    const fade = sampleRate * 0.05;
    if (i < fade) env = i / fade;
    else if (i > ch.length - fade) env = (ch.length - i) / fade;
    ch[i] = ch[i] * norm * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
  audioState.src = src;
}

// =========================================================================
// LaTeX コピー
// =========================================================================
function copyLatex() {
  const out = state.nodes.find((n) => n.kind === "output");
  if (!out) { alert("出力ノードがありません"); return; }
  const expr = formulaOf(out.id, true);
  const text = `y = ${expr}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast(`📋 LaTeX コピーしたよ\n${text}`),
      () => prompt("コピー用 LaTeX:", text)
    );
  } else {
    prompt("コピー用 LaTeX:", text);
  }
}

function toast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;left:50%;bottom:60px;transform:translateX(-50%);
    background:var(--paper);border:1px solid var(--pink-strong);color:var(--ink);
    padding:8px 16px;border-radius:999px;box-shadow:var(--shadow);
    white-space:pre-line;text-align:center;z-index:200;font-size:12px;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

// =========================================================================
// スクショ
// =========================================================================
function screenshot() {
  // UIを一時的に隠す
  edgePopup.hidden = true;
  hintTip.hidden = true;
  const wrap = document.getElementById("canvas-wrap");
  // パン/ズーム状態のままで撮る（見えている範囲を撮影）
  if (window.html2canvas && !window.__html2canvas_failed) {
    html2canvas(wrap, { backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg") || "#fff8fb" })
      .then((canv) => {
        canv.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "sankakukansu.png"; a.click();
          URL.revokeObjectURL(url);
          toast("📸 PNGとして保存したよ");
        });
      })
      .catch(() => screenshotSvgFallback());
  } else {
    screenshotSvgFallback();
  }
}
function screenshotSvgFallback() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:${getComputedStyle(document.body).getPropertyValue("--bg")};">
      ${overlaySvg.outerHTML}${canvas.outerHTML}${edgesSvg.outerHTML}
    </div>
  </foreignObject>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "sankakukansu.svg"; a.click();
  URL.revokeObjectURL(url);
  toast("📸 SVGとして保存（オフライン）");
}

// =========================================================================
// クイズ
// =========================================================================
let quizCurrent = null;
function openQuiz() { quizModal.hidden = false; nextQuiz(); }
function closeQuiz() { quizModal.hidden = true; }

function nextQuiz() {
  document.getElementById("quiz-result").textContent = "";
  const fns = ["sin", "cos"];
  const a = (Math.floor(Math.random() * 3) + 1);
  const b = (Math.floor(Math.random() * 3) + 1);
  const fn = fns[Math.floor(Math.random() * fns.length)];
  quizCurrent = { fn, a, b };

  // 候補3つ（正解 + 2偽）
  const choices = [{ fn, a, b, correct: true }];
  while (choices.length < 3) {
    const c = {
      fn: fns[Math.floor(Math.random() * fns.length)],
      a: Math.floor(Math.random() * 3) + 1,
      b: Math.floor(Math.random() * 3) + 1,
    };
    if (c.fn === fn && c.a === a && c.b === b) continue;
    if (choices.some((x) => x.fn === c.fn && x.a === c.a && x.b === c.b)) continue;
    c.correct = false;
    choices.push(c);
  }
  shuffle(choices);

  // グラフ描画
  const cv = document.getElementById("quiz-graph");
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const styles = getComputedStyle(document.body);
  const lineCol = styles.getPropertyValue("--line").trim() || "#f1c8d8";
  const edgeCol = styles.getPropertyValue("--edge").trim() || "#ff8fb5";
  drawAxes(ctx, cv.width, cv.height, lineCol);
  ctx.beginPath(); ctx.strokeStyle = edgeCol; ctx.lineWidth = 2;
  for (let px = 0; px <= cv.width; px++) {
    const x = -2 * Math.PI + (px / cv.width) * 4 * Math.PI;
    const y = a * (fn === "sin" ? Math.sin(b * x) : Math.cos(b * x));
    const py = cv.height / 2 - y * 22;
    if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  const wrap = document.getElementById("quiz-choices");
  wrap.innerHTML = "";
  choices.forEach((c) => {
    const btn = document.createElement("button");
    btn.textContent = `y = ${c.a} · ${c.fn}(${c.b}x)`;
    btn.addEventListener("click", () => {
      btn.className = c.correct ? "correct" : "wrong";
      const result = document.getElementById("quiz-result");
      if (c.correct) result.textContent = "🌸 正解！";
      else result.textContent = `😢 残念、正解は y = ${a} · ${fn}(${b}x)`;
    });
    wrap.appendChild(btn);
  });
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// =========================================================================
// ユーティリティ
// =========================================================================
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return "0";
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}
function fmtSigned(n) {
  if (!n) return "";
  const s = fmt(Math.abs(n));
  return (n >= 0 ? " + " : " - ") + s;
}
