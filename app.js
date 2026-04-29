"use strict";

const STORAGE_KEY = "sankakukansu.v1";

const KIND_DEFS = {
  sin:    { icon: "🌸", label: "sin", defaults: { a: 1, b: 1, c: 0, d: 0 } },
  cos:    { icon: "🍀", label: "cos", defaults: { a: 1, b: 1, c: 0, d: 0 } },
  tan:    { icon: "🔥", label: "tan", defaults: { a: 1, b: 1, c: 0, d: 0 } },
  const:  { icon: "🍡", label: "定数", defaults: { value: 1 } },
  add:    { icon: "➕", label: "合成(+)", defaults: {} },
  mul:    { icon: "✖️", label: "合成(×)", defaults: {} },
  output: { icon: "📈", label: "出力",   defaults: {} },
};

/** @type {{nodes: Array, edges: Array, seq: number}} */
const state = load() || { nodes: [], edges: [], seq: 1 };

const canvas = document.getElementById("canvas");
const edgesSvg = document.getElementById("edges");
const inspector = document.getElementById("inspector");

let selectedId = null;
let dragState = null;     // ノード移動中
let connectState = null;  // ＋からドラッグして接続中

// ---------- 初期化 ----------
init();

function init() {
  if (state.nodes.length === 0) loadSample("basic");
  renderAll();
  bindUi();
  window.addEventListener("resize", renderEdges);
}

function bindUi() {
  document.getElementById("btn-add-node").addEventListener("click", () => addNode("sin"));
  document.getElementById("btn-screenshot").addEventListener("click", screenshot);
  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!confirm("すべて消しますか？")) return;
    state.nodes = []; state.edges = []; selectedId = null;
    save(); renderAll();
  });
  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("file-import").addEventListener("change", importJson);
  document.getElementById("sample-basic").addEventListener("click", () => loadSample("basic"));
  document.getElementById("sample-sum").addEventListener("click", () => loadSample("sum"));
  document.getElementById("sample-beat").addEventListener("click", () => loadSample("beat"));

  document.querySelectorAll(".palette .chip[data-kind]").forEach((el) => {
    el.addEventListener("click", () => addNode(el.dataset.kind));
  });

  document.getElementById("search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll(".node").forEach((el) => {
      const node = state.nodes.find((n) => n.id === el.dataset.id);
      if (!node) return;
      const text = (node.name + " " + node.kind).toLowerCase();
      el.style.opacity = q && !text.includes(q) ? 0.2 : 1;
    });
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.target === canvas) {
      selectedId = null;
      renderInspector();
      renderAll();
    }
  });
}

// ---------- ノード操作 ----------
function addNode(kind, x, y) {
  const def = KIND_DEFS[kind];
  if (!def) return;
  const rect = canvas.getBoundingClientRect();
  const node = {
    id: "n" + state.seq++,
    kind,
    name: def.label,
    x: x ?? Math.round(rect.width / 2 - 50 + Math.random() * 80 - 40),
    y: y ?? Math.round(rect.height / 2 - 30 + Math.random() * 80 - 40),
    params: { ...def.defaults },
  };
  state.nodes.push(node);
  selectedId = node.id;
  save();
  renderAll();
}

function deleteNode(id) {
  state.nodes = state.nodes.filter((n) => n.id !== id);
  state.edges = state.edges.filter((e) => e.from !== id && e.to !== id);
  if (selectedId === id) selectedId = null;
  save();
  renderAll();
}

function addEdge(from, to) {
  if (from === to) return;
  if (state.edges.some((e) => e.from === from && e.to === to)) return;
  state.edges.push({ id: "e" + state.seq++, from, to });
  save();
  renderAll();
}

// ---------- レンダリング ----------
function renderAll() {
  renderNodes();
  renderEdges();
  renderInspector();
}

function renderNodes() {
  canvas.innerHTML = "";
  state.nodes.forEach((node) => {
    const el = document.createElement("div");
    el.className = `node kind-${node.kind}` + (node.id === selectedId ? " selected" : "");
    el.dataset.id = node.id;
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";

    const def = KIND_DEFS[node.kind];
    el.innerHTML = `
      <button class="del" title="削除">×</button>
      <div class="icon">${def.icon}</div>
      <div class="label">${escapeHtml(node.name)}</div>
      <div class="sub">${subtitleFor(node)}</div>
      ${node.kind === "output" ? `<canvas class="graph" width="200" height="80"></canvas><div class="formula"></div>` : ""}
      <div class="plus" title="ドラッグして接続">＋</div>
    `;
    canvas.appendChild(el);

    el.addEventListener("mousedown", onNodeMouseDown);
    el.querySelector(".del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteNode(node.id);
    });
    el.querySelector(".plus").addEventListener("mousedown", (e) => {
      e.stopPropagation();
      startConnect(node.id, e);
    });
  });

  state.nodes.filter((n) => n.kind === "output").forEach(drawOutput);
}

function renderEdges() {
  edgesSvg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  // 矢印マーカー
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 Z" fill="#ff8fb5"/>
    </marker>`;
  edgesSvg.appendChild(defs);

  state.edges.forEach((edge) => {
    const a = nodeCenter(edge.from);
    const b = nodeCenter(edge.to);
    if (!a || !b) return;
    const path = document.createElementNS(ns, "path");
    const dx = (b.x - a.x) * 0.4;
    const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#ff8fb5");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("marker-end", "url(#arrow)");
    edgesSvg.appendChild(path);
  });

  if (connectState && connectState.cursor) {
    const a = nodeCenter(connectState.from);
    if (a) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${a.x} ${a.y} L ${connectState.cursor.x} ${connectState.cursor.y}`);
      path.setAttribute("stroke", "#ff8fb5");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-dasharray", "6 4");
      path.setAttribute("fill", "none");
      edgesSvg.appendChild(path);
    }
  }
}

function nodeCenter(id) {
  const el = canvas.querySelector(`.node[data-id="${id}"]`);
  if (!el) return null;
  return {
    x: el.offsetLeft + el.offsetWidth / 2,
    y: el.offsetTop + el.offsetHeight / 2,
  };
}

function subtitleFor(node) {
  const p = node.params || {};
  switch (node.kind) {
    case "sin":
    case "cos":
    case "tan":
      return `${fmt(p.a)}·${node.kind}(${fmt(p.b)}x${fmtSigned(p.c)})${fmtSigned(p.d)}`;
    case "const":
      return `= ${fmt(p.value)}`;
    case "add": return "入力を合計";
    case "mul": return "入力を掛け算";
    case "output": return "結果プレビュー";
    default: return "";
  }
}

// ---------- インスペクタ ----------
function renderInspector() {
  if (!selectedId) {
    inspector.innerHTML = `<p class="muted">ノードをクリックすると編集できます</p>`;
    return;
  }
  const node = state.nodes.find((n) => n.id === selectedId);
  if (!node) return;
  const p = node.params || {};
  let html = `
    <div class="row"><label>名前</label><input type="text" data-key="name" value="${escapeAttr(node.name)}"></div>
  `;
  if (["sin", "cos", "tan"].includes(node.kind)) {
    html += `
      <p class="muted">y = a · ${node.kind}(b·x + c) + d</p>
      <div class="row"><label>a 振幅</label><input type="number" step="0.1" data-key="params.a" value="${p.a}"></div>
      <div class="row"><label>b 周期</label><input type="number" step="0.1" data-key="params.b" value="${p.b}"></div>
      <div class="row"><label>c 位相</label><input type="number" step="0.1" data-key="params.c" value="${p.c}"></div>
      <div class="row"><label>d 上下</label><input type="number" step="0.1" data-key="params.d" value="${p.d}"></div>
    `;
  } else if (node.kind === "const") {
    html += `<div class="row"><label>値</label><input type="number" step="0.1" data-key="params.value" value="${p.value}"></div>`;
  } else {
    html += `<p class="muted">このノードに編集項目はありません</p>`;
  }
  inspector.innerHTML = html;
  inspector.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.key;
      const value = input.type === "number" ? parseFloat(input.value) : input.value;
      if (key.startsWith("params.")) {
        node.params[key.slice(7)] = isNaN(value) ? 0 : value;
      } else {
        node[key] = value;
      }
      save();
      renderNodes();
      renderEdges();
    });
  });
}

// ---------- ドラッグ ----------
function onNodeMouseDown(e) {
  if (e.target.classList.contains("plus") || e.target.classList.contains("del")) return;
  const el = e.currentTarget;
  const id = el.dataset.id;
  selectedId = id;
  const node = state.nodes.find((n) => n.id === id);
  const startX = e.clientX, startY = e.clientY;
  const origX = node.x, origY = node.y;
  dragState = { id, startX, startY, origX, origY };
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
  renderInspector();
  renderNodes();
}
function onDragMove(e) {
  if (!dragState) return;
  const node = state.nodes.find((n) => n.id === dragState.id);
  node.x = dragState.origX + (e.clientX - dragState.startX);
  node.y = dragState.origY + (e.clientY - dragState.startY);
  const el = canvas.querySelector(`.node[data-id="${node.id}"]`);
  if (el) {
    el.style.left = node.x + "px";
    el.style.top = node.y + "px";
  }
  renderEdges();
}
function onDragEnd() {
  if (dragState) save();
  dragState = null;
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
}

// ---------- 接続ドラッグ ----------
function startConnect(fromId, e) {
  connectState = { from: fromId, cursor: relPoint(e) };
  document.addEventListener("mousemove", onConnectMove);
  document.addEventListener("mouseup", onConnectEnd);
}
function onConnectMove(e) {
  if (!connectState) return;
  connectState.cursor = relPoint(e);
  renderEdges();
}
function onConnectEnd(e) {
  document.removeEventListener("mousemove", onConnectMove);
  document.removeEventListener("mouseup", onConnectEnd);
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
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ---------- 計算 / グラフ ----------
function evaluate(nodeId, x, visited = new Set()) {
  if (visited.has(nodeId)) return 0;
  visited.add(nodeId);
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return 0;
  const incoming = state.edges.filter((e) => e.to === nodeId).map((e) => e.from);
  const p = node.params || {};
  switch (node.kind) {
    case "sin": return p.a * Math.sin(p.b * x + p.c) + p.d;
    case "cos": return p.a * Math.cos(p.b * x + p.c) + p.d;
    case "tan": return p.a * Math.tan(p.b * x + p.c) + p.d;
    case "const": return p.value;
    case "add":
      return incoming.reduce((s, id) => s + evaluate(id, x, new Set(visited)), 0);
    case "mul":
      return incoming.reduce((s, id) => s * evaluate(id, x, new Set(visited)), 1);
    case "output":
      if (incoming.length === 0) return 0;
      return evaluate(incoming[0], x, new Set(visited));
    default: return 0;
  }
}

function formulaOf(nodeId, visited = new Set()) {
  if (visited.has(nodeId)) return "…";
  visited.add(nodeId);
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return "";
  const incoming = state.edges.filter((e) => e.to === nodeId).map((e) => e.from);
  const p = node.params || {};
  switch (node.kind) {
    case "sin":
    case "cos":
    case "tan":
      return `${fmt(p.a)}·${node.kind}(${fmt(p.b)}x${fmtSigned(p.c)})${fmtSigned(p.d)}`;
    case "const": return `${fmt(p.value)}`;
    case "add":
      return incoming.length ? incoming.map((id) => formulaOf(id, new Set(visited))).join(" + ") : "0";
    case "mul":
      return incoming.length ? incoming.map((id) => "(" + formulaOf(id, new Set(visited)) + ")").join(" · ") : "1";
    case "output":
      return incoming[0] ? formulaOf(incoming[0], new Set(visited)) : "(未接続)";
    default: return "";
  }
}

function drawOutput(node) {
  const el = canvas.querySelector(`.node[data-id="${node.id}"]`);
  if (!el) return;
  const cv = el.querySelector("canvas.graph");
  const formulaEl = el.querySelector(".formula");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);

  // 軸
  ctx.strokeStyle = "#f1c8d8";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();

  // グラフ: x ∈ [-2π, 2π]
  const xMin = -2 * Math.PI, xMax = 2 * Math.PI;
  const yScale = 18;
  ctx.beginPath();
  ctx.strokeStyle = "#ff8fb5";
  ctx.lineWidth = 2;
  let started = false;
  for (let px = 0; px <= w; px++) {
    const x = xMin + (px / w) * (xMax - xMin);
    let y = evaluate(node.id, x);
    if (!isFinite(y)) { started = false; continue; }
    y = Math.max(-h, Math.min(h, y));
    const py = h / 2 - y * yScale;
    if (!started) { ctx.moveTo(px, py); started = true; }
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  if (formulaEl) formulaEl.textContent = "y = " + formulaOf(node.id);
}

// ---------- 保存 / 読込 ----------
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.sankakukansu.json";
  a.click();
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
      state.nodes = data.nodes;
      state.edges = data.edges;
      state.seq = data.seq || (state.nodes.length + state.edges.length + 1);
      selectedId = null;
      save();
      renderAll();
    } catch (err) {
      alert("読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

// ---------- サンプル ----------
function loadSample(kind) {
  state.nodes = []; state.edges = []; state.seq = 1; selectedId = null;
  const cw = canvas.clientWidth || 700;
  const ch = canvas.clientHeight || 500;
  if (kind === "basic") {
    const a = mkNode("sin", 80, ch / 2 - 40);
    const o = mkNode("output", cw - 280, ch / 2 - 60);
    state.edges.push({ id: "e" + state.seq++, from: a.id, to: o.id });
  } else if (kind === "sum") {
    const s = mkNode("sin", 60, 80);
    const c = mkNode("cos", 60, ch - 160);
    const add = mkNode("add", cw / 2 - 50, ch / 2 - 30);
    const o = mkNode("output", cw - 280, ch / 2 - 60);
    state.edges.push({ id: "e" + state.seq++, from: s.id, to: add.id });
    state.edges.push({ id: "e" + state.seq++, from: c.id, to: add.id });
    state.edges.push({ id: "e" + state.seq++, from: add.id, to: o.id });
  } else if (kind === "beat") {
    const s1 = mkNode("sin", 60, 80, { a: 1, b: 1.0, c: 0, d: 0 });
    const s2 = mkNode("sin", 60, ch - 160, { a: 1, b: 1.1, c: 0, d: 0 });
    const add = mkNode("add", cw / 2 - 50, ch / 2 - 30);
    const o = mkNode("output", cw - 280, ch / 2 - 60);
    state.edges.push({ id: "e" + state.seq++, from: s1.id, to: add.id });
    state.edges.push({ id: "e" + state.seq++, from: s2.id, to: add.id });
    state.edges.push({ id: "e" + state.seq++, from: add.id, to: o.id });
  }
  save();
  renderAll();
}
function mkNode(kind, x, y, params) {
  const def = KIND_DEFS[kind];
  const node = {
    id: "n" + state.seq++,
    kind,
    name: def.label,
    x, y,
    params: { ...def.defaults, ...(params || {}) },
  };
  state.nodes.push(node);
  return node;
}

// ---------- スクショ ----------
function screenshot() {
  // UIを隠してSVG+canvasをまとめて画像化（最小実装: SVG出力）
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const svg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;background:#fff8fb;">
      ${canvas.outerHTML}${edgesSvg.outerHTML}
    </div>
  </foreignObject>
</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sankakukansu.svg";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- ユーティリティ ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return "0";
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}
function fmtSigned(n) {
  if (!n) return "";
  const s = fmt(Math.abs(n));
  return (n >= 0 ? " + " : " − ") + s;
}
