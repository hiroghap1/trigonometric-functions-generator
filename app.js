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

let selectedId = null;        // ノードID（プライマリ）
let selectedIds = new Set();  // 複数選択
let selectedEdgeId = null;    // エッジID
let selectedGroupId = null;
let selectedNoteId = null;

let dragState = null;
let connectState = null;
let curveDragState = null;
let noteDragState = null;
let noteResizeState = null;
let rectSelectState = null;
let clipboard = null;

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

// -------- Tips データ（init より前に必要） --------
const TIPS = [
  "sin² θ + cos² θ = 1 — 単位円から導かれる魔法の式🌸",
  "sin と cos は π/2 ずれた波。位相をずらすだけで両者は入れ替わる",
  "周波数 b が大きいほど、波は細かく振動する",
  "音は sin 波の組み合わせ → フーリエ級数の基礎🎵",
  "微分: sin → cos → -sin → -cos → sin の4周期で戻る⚡",
  "tan = sin/cos なので cos = 0 (x = π/2) で発散",
  "リサジュー曲線は2方向の振動を合成する。比率を整数にすると閉じた形に🌀",
  "音の協和音は周波数比 2:3 などの整数比が綺麗な時に生まれる",
  "弦をはじくと整数倍音が出る → 自然界に潜むフーリエ級数🎼",
  "sin(x) ≈ x (x が小さいとき) — テイラー展開の最初の項",
  "和積公式: sin(A) + sin(B) = 2 sin((A+B)/2) cos((A-B)/2)",
  "倍角: sin(2x) = 2 sin(x) cos(x), cos(2x) = cos²(x) - sin²(x)",
  "オイラーの式: e^(iθ) = cos θ + i sin θ — 数学で最も美しい等式の1つ✨",
  "うなり: 周波数の近い2つの波を重ねると、ゆっくりした強弱が生まれる",
  "AM変調: cos(2πft) × cos(2πf_c t) で振幅変調📻",
  "FM変調: cos(2πft + sin(2πf_m t)) で位相が揺れて音色が変わる🎙",
  "矩形波 = 奇数倍音だけの正弦波の合計 (4/π × Σ sin((2k-1)x)/(2k-1))",
  "ノコギリ波 = 全倍音の合計 (Σ sin(kx)/k)",
  "三角波 = 奇数倍音 + 1/k² で減衰",
  "極座標 r = 1 + cos(θ) はカージオイド (ハート♡)",
];
let tipIndex = 0;

// -------- 三角関数の使われ方 (init より前に必要) --------
const USAGES = [
  "🎵 音楽 — あなたが聞いている音は、実は無数の sin 波の重ね合わせ。ピアノの音も人の声もぜんぶ分解すると sin/cos でできてる🎼 サンプル「フーリエ」を試してみて！",
  "📻 ラジオ・Wi-Fi — 電波は cos(2π·f·t) という巨大な sin 波。AM変調は ✖️積、FM変調は位相を揺らす。今このページが届くのも三角関数のおかげ",
  "🎮 ゲームのキャラ回転 — マリオが向きを変える式は x' = x·cosθ − y·sinθ, y' = x·sinθ + y·cosθ。1秒に60回この計算が走ってる",
  "🛰 GPS — スマホの位置情報は4つの衛星との距離を「三角測量」で解いて出している。三角関数なしでは Google Maps は動かない",
  "🏥 MRI・心電図 — 体内の磁気変化や心拍を超高速フーリエ変換で画像化・解析。三角関数は命を救う数学",
  "🌊 波・地震・津波 — 海の波も地震の揺れも光も、自然界のあらゆる波は sin 波の重ね合わせ。津波予測も地震波解析も三角関数あってこそ",
  "🎙 Siri・音声認識 — 「Hey Siri」と話す声を1秒に何百回もフーリエ変換して認識している。あなたの声を理解するのも sin/cos",
  "⚡ コンセントの電気 — 家庭のコンセントは 50/60Hz の正弦波交流。1秒に50回プラスマイナスが入れ替わる、まさに sin 波そのもの",
  "🤖 ロボットの関節 — アシモやペッパーが手を動かすとき、腕の先の位置から関節角度を逆算するのに arcsin/arccos（逆運動学）",
  "🌌 宇宙開発 — はやぶさの軌道計算、火星探査機の着陸、ブラックホール撮影。宇宙開発の計算は三角関数なしでは始まらない🚀",
  "🌈 虹のしくみ — 光が水滴の中で屈折・反射する角度から虹ができる。光は波長ごとに sin 波として干渉している",
  "🏗 スカイツリーの揺れ対策 — TMD（同調質量ダンパー）が地震の揺れと逆位相の sin 波を発生させて打ち消す。超高層建築は sin で守られている",
  "🎯 ボールが一番遠く飛ぶ角度 — 45°が最強なのは、水平距離 ∝ sin(2θ) が θ=45° で最大になるから。砲丸投げの角度にも理由がある",
  "🎢 ジェットコースター — ループや起伏の「曲率」は微分と三角関数で設計。安全に楽しめる裏には sin/cos の計算",
  "🌡 気温の季節変化 — 東京の年間気温データを描くと見事な sin 波。気象予報の長期トレンドもフーリエ分解で抽出している",
  "🧬 体内リズム — 心拍・呼吸・睡眠サイクル、生体リズムはぜんぶ周期信号。医学では三角関数を使ってモデル化される",
  "📷 カメラ — 魚眼レンズの歪み補正、画像の回転、iPhone の手ブレ補正、ぜんぶ sin/cos が裏で動いている",
  "🎨 アニメの動き — キャラが滑らかに振り向くイージングは cos 曲線。ピクサーもジブリも、なめらかな動きの裏には数式",
  "💡 ホログラム・レーザー — 光の干渉や回折は sin 波の重ね合わせそのもの。3Dホログラムも干渉現象を使っている",
  "🌍 球面三角法 — 地球は丸いので、東京〜ロサンゼルス間の距離は球面三角法で計算する。航空機の最短ルートも",
  "🎼 楽器の音色 — 同じドでもバイオリンとピアノが違って聞こえるのは、混じる倍音 (整数倍の sin 波) の比率が違うから🎻",
  "🚗 エンジン — クランクの回転をピストンの上下運動に変えるしくみ。ピストン位置 ≈ r·cos(ωt) で、まさに cos 波",
  "🌀 VR・ジャイロ — VR ゴーグルが頭の動きを追従できるのは、加速度センサとジャイロのデータから sin/cos で姿勢角を復元しているから",
  "🎚 シンセサイザ — 電子音楽のシンセは sin / 三角 / ノコギリ / 矩形波の組み合わせ。このアプリでやってる波形合成と同じ仕組み🎹",
  "💖 心電図の解析 — 心臓の電気信号を周波数別に分解（フーリエ）して、不整脈や心筋梗塞のサインを早期発見する",
];
let usageIndex = 0;

// -------- 練習モード問題セット --------
const PRACTICE_PROBLEMS = [
  { formula: "sin(x)",                fn: (x) => Math.sin(x),                                hint: "🌸 sin ノードをそのまま 📈 出力に繋ぐだけ" },
  { formula: "cos(x)",                fn: (x) => Math.cos(x),                                hint: "🍀 cos ノードを 📈 出力に繋ぐ" },
  { formula: "2 · sin(x)",            fn: (x) => 2 * Math.sin(x),                            hint: "sin の振幅 a を 2 にする" },
  { formula: "sin(2x)",               fn: (x) => Math.sin(2 * x),                            hint: "sin の周期 b を 2 にする（波が細かくなる）" },
  { formula: "sin(x) + 1",            fn: (x) => Math.sin(x) + 1,                            hint: "sin の上下 d を 1 にする（波が上に持ち上がる）" },
  { formula: "-sin(x)",               fn: (x) => -Math.sin(x),                               hint: "🪞 反転ノード or sin の振幅 a を -1 に" },
  { formula: "sin(x) + cos(x)",       fn: (x) => Math.sin(x) + Math.cos(x),                  hint: "sin と cos を ➕合計 ノードで繋ぐ" },
  { formula: "sin(x) - cos(x)",       fn: (x) => Math.sin(x) - Math.cos(x),                  hint: "➖差 ノード（最初が引かれる側）" },
  { formula: "sin(x) · cos(x)",       fn: (x) => Math.sin(x) * Math.cos(x),                  hint: "✖️積。実は sin(2x)/2 と等しい！" },
  { formula: "cos(x − π/2)",          fn: (x) => Math.cos(x - Math.PI / 2),                  hint: "cos の位相 c を −π/2 ≈ −1.57 に。すると sin と同じ波になる" },
  { formula: "sin²(x) + cos²(x) = 1", fn: (x) => Math.sin(x) ** 2 + Math.cos(x) ** 2,        hint: "ピタゴラスの恒等式。sin*sin と cos*cos を ➕合計" },
  { formula: "0.5·sin(x) + 0.5·sin(3x)", fn: (x) => 0.5*Math.sin(x) + 0.5*Math.sin(3 * x),   hint: "矩形波の最初の2項。フーリエ級数の入口🎵" },
  { formula: "sin(x + π/4)",          fn: (x) => Math.sin(x + Math.PI / 4),                  hint: "位相 c を π/4 ≈ 0.785 にずらす" },
  { formula: "2·cos(2x) + 1",         fn: (x) => 2 * Math.cos(2 * x) + 1,                    hint: "a=2, b=2, d=1。3つのパラメータをまとめて変える" },
  { formula: "sin(x) / 2",            fn: (x) => Math.sin(x) / 2,                            hint: "a を 0.5 にする（小さな波）" },
];
let practiceState = null;

// =========================================================================
// 初期化
// =========================================================================
init();

function init() {
  // 共有URL（#d=...）が付いていれば最優先で復元
  const fromHash = tryLoadFromHash();
  if (!fromHash && (!state.nodes || state.nodes.length === 0)) loadSample("basic");
  applyTheme(state.theme || "pastel");
  applyView();
  bindUi();
  renderAll();
  if (fromHash) save();
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
  document.getElementById("btn-practice").addEventListener("click", openPractice);
  document.getElementById("practice-close").addEventListener("click", closePractice);
  document.getElementById("practice-check").addEventListener("click", checkPractice);
  document.getElementById("practice-hint-btn").addEventListener("click", showPracticeHint);
  document.getElementById("practice-skip").addEventListener("click", nextPractice);
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
  document.getElementById("btn-css").addEventListener("click", openCssExport);
  document.getElementById("btn-css-close").addEventListener("click", closeCssExport);
  document.getElementById("btn-css-copy").addEventListener("click", copyCssExport);
  document.getElementById("btn-css-download").addEventListener("click", downloadCssExport);
  document.getElementById("css-modal").addEventListener("click", (e) => {
    if (e.target.id === "css-modal") closeCssExport();
  });

  // ファイル
  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("btn-share").addEventListener("click", shareUrl);
  document.getElementById("file-import").addEventListener("change", importJson);
  document.getElementById("btn-clear").addEventListener("click", clearAll);

  // 検索
  document.getElementById("search").addEventListener("input", onSearch);

  // キャンバスのパン / ズーム / 矩形選択
  canvasWrap.addEventListener("mousedown", onCanvasMouseDown);
  canvasWrap.addEventListener("wheel", onWheel, { passive: false });
  document.getElementById("btn-zoom-in").addEventListener("click",    () => zoomBy(1.2));
  document.getElementById("btn-zoom-out").addEventListener("click",   () => zoomBy(1 / 1.2));
  document.getElementById("btn-zoom-reset").addEventListener("click", resetView);

  // 数式パーサ / 自動整列
  document.getElementById("btn-formula").addEventListener("click", () => {
    applyFormula(document.getElementById("formula-input").value);
  });
  document.getElementById("formula-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyFormula(e.target.value);
  });
  document.getElementById("btn-auto-layout").addEventListener("click", autoLayoutAll);

  // Tips
  document.getElementById("btn-tip-next").addEventListener("click", showNextTip);
  showNextTip();
  document.getElementById("btn-usage-next").addEventListener("click", showNextUsage);
  showNextUsage();
  // 起動時に使われ方モーダルを表示
  const usageModal = document.getElementById("usage-modal");
  if (usageModal) {
    usageModal.hidden = false;
    document.getElementById("usage-close").addEventListener("click", () => {
      usageModal.hidden = true;
    });
    usageModal.addEventListener("click", (e) => {
      if (e.target === usageModal) usageModal.hidden = true;
    });
  }

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
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    else if ((ctrl && e.key.toLowerCase() === "y") ||
             (ctrl && e.shiftKey && e.key.toLowerCase() === "z")) { e.preventDefault(); redo(); }
    else if (ctrl && e.key.toLowerCase() === "c") { e.preventDefault(); copySelected(); }
    else if (ctrl && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClipboard(); }
    else if (ctrl && e.key.toLowerCase() === "a") { e.preventDefault(); selectAll(); }
    else if (ctrl && e.key.toLowerCase() === "d") { e.preventDefault(); copySelected(); pasteClipboard(); }
    else if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedIds.size > 0)       { deleteSelectedNodes(); }
      else if (selectedEdgeId)        { deleteEdge(selectedEdgeId); }
      else if (selectedNoteId)        { deleteNote(selectedNoteId); }
      else if (selectedGroupId)       { deleteGroup(selectedGroupId); }
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
  btn.textContent = state.learnMode ? "📘 解説 ON" : "📘 解説";
  // ON にしたときだけ使い方をキャンバス中央にトーストで表示
  if (state.learnMode) {
    const tip = document.getElementById("hint-tip");
    if (tip) {
      const r = canvasWrap.getBoundingClientRect();
      tip.textContent = "解説モード ON：ノードにマウスを乗せると説明が出るよ";
      tip.style.left = (r.width / 2 - 140) + "px";
      tip.style.top  = "16px";
      tip.hidden = false;
      setTimeout(() => { if (!state.learnMode) return; tip.hidden = true; }, 2200);
    }
  }
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
  // 空き地でのみ操作（ノード/メモ/エッジパス/単位円スライダー等は除外）
  const t = e.target;
  if (t !== canvasWrap && t !== canvasStage && t !== canvas &&
      t !== edgesSvg   && t !== overlaySvg) return;
  if (e.shiftKey) {
    startRectSelect(e);
  } else {
    panState = {
      startX: e.clientX, startY: e.clientY,
      origPanX: state.view.panX, origPanY: state.view.panY,
      moved: false,
    };
    canvasWrap.classList.add("panning");
    document.addEventListener("mousemove", onPanMove);
    document.addEventListener("mouseup",   onPanEnd);
  }
}

// 矩形選択（Shift+ドラッグ）
function startRectSelect(e) {
  const r = canvasWrap.getBoundingClientRect();
  rectSelectState = {
    startX: e.clientX - r.left,
    startY: e.clientY - r.top,
    additive: e.ctrlKey || e.metaKey,
  };
  const rect = document.getElementById("select-rect");
  rect.style.left = rectSelectState.startX + "px";
  rect.style.top  = rectSelectState.startY + "px";
  rect.style.width = "0";
  rect.style.height = "0";
  rect.hidden = false;
  document.addEventListener("mousemove", onRectSelectMove);
  document.addEventListener("mouseup",   onRectSelectEnd);
}
function onRectSelectMove(e) {
  if (!rectSelectState) return;
  const r = canvasWrap.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const left = Math.min(x, rectSelectState.startX);
  const top  = Math.min(y, rectSelectState.startY);
  const w = Math.abs(x - rectSelectState.startX);
  const h = Math.abs(y - rectSelectState.startY);
  const rect = document.getElementById("select-rect");
  rect.style.left = left + "px"; rect.style.top = top + "px";
  rect.style.width = w + "px";   rect.style.height = h + "px";
}
function onRectSelectEnd(e) {
  document.removeEventListener("mousemove", onRectSelectMove);
  document.removeEventListener("mouseup",   onRectSelectEnd);
  if (!rectSelectState) return;
  const r = canvasWrap.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const left = Math.min(x, rectSelectState.startX);
  const top  = Math.min(y, rectSelectState.startY);
  const right  = Math.max(x, rectSelectState.startX);
  const bottom = Math.max(y, rectSelectState.startY);
  const v = state.view;
  const lL = (left   - v.panX) / v.zoom, lT = (top    - v.panY) / v.zoom;
  const lR = (right  - v.panX) / v.zoom, lB = (bottom - v.panY) / v.zoom;

  if (!rectSelectState.additive) selectedIds.clear();
  state.nodes.forEach((n) => {
    const el = canvas.querySelector(`.node[data-id="${n.id}"]`);
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (n.x < lR && n.x + w > lL && n.y < lB && n.y + h > lT) {
      selectedIds.add(n.id);
    }
  });
  selectedId = selectedIds.size ? [...selectedIds][0] : null;
  selectedEdgeId = selectedGroupId = selectedNoteId = null;

  document.getElementById("select-rect").hidden = true;
  rectSelectState = null;
  renderNodes();
  renderInspector();
}

// ===== 複数選択 / コピー&ペースト =====
function selectAll() {
  selectedIds = new Set(state.nodes.map((n) => n.id));
  selectedId = state.nodes.length ? state.nodes[0].id : null;
  selectedEdgeId = selectedGroupId = selectedNoteId = null;
  renderNodes();
  renderInspector();
}
function copySelected() {
  if (selectedIds.size === 0) { toast("コピーするノードを選んでね"); return; }
  const nodes = state.nodes.filter((n) => selectedIds.has(n.id));
  if (!nodes.length) return;
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const ids = new Set(nodes.map((n) => n.id));
  clipboard = {
    nodes: nodes.map((n) => ({
      kind: n.kind, name: n.name,
      x: n.x - minX, y: n.y - minY,
      params: { ...n.params },
      _oldId: n.id,
    })),
    edges: state.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => ({
        from: e.from, to: e.to,
        label: e.label || "", style: e.style || "single",
        ctrl: e.ctrl ? { ...e.ctrl } : null,
      })),
  };
  toast(`📋 コピー (${nodes.length})`);
}
function pasteClipboard() {
  if (!clipboard || !clipboard.nodes.length) return;
  pushHistory();
  const idMap = {};
  selectedIds.clear();
  // 画面中心からクリップボードのbboxの中心がぴったり来るようにオフセット
  const xs = clipboard.nodes.map((n) => n.x);
  const ys = clipboard.nodes.map((n) => n.y);
  const bbW = Math.max(...xs) - Math.min(...xs);
  const bbH = Math.max(...ys) - Math.min(...ys);
  const c = visibleCenter();
  const ox = c.x - bbW / 2 - 50 + (Math.random() - 0.5) * 30;
  const oy = c.y - bbH / 2 - 30 + (Math.random() - 0.5) * 30;
  clipboard.nodes.forEach((n) => {
    const newId = "n" + state.seq++;
    idMap[n._oldId] = newId;
    state.nodes.push({
      id: newId, kind: n.kind, name: n.name,
      x: Math.round(n.x + ox), y: Math.round(n.y + oy),
      params: { ...n.params },
    });
    selectedIds.add(newId);
  });
  clipboard.edges.forEach((e) => {
    state.edges.push({
      id: "e" + state.seq++,
      from: idMap[e.from], to: idMap[e.to],
      label: e.label, style: e.style, ctrl: e.ctrl ? { ...e.ctrl } : null,
    });
  });
  selectedId = [...selectedIds][0] || null;
  save(); renderAll();
  toast(`✨ ペースト (${clipboard.nodes.length})`);
}
function deleteSelectedNodes() {
  if (selectedIds.size === 0) return;
  pushHistory();
  const ids = new Set(selectedIds);
  state.nodes = state.nodes.filter((n) => !ids.has(n.id));
  state.edges = state.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
  state.groups.forEach((g) => g.nodeIds = g.nodeIds.filter((nid) => !ids.has(nid)));
  state.notes.forEach((m) => { if (ids.has(m.attached)) m.attached = null; });
  selectedIds.clear();
  selectedId = null;
  save(); renderAll();
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
  // deltaY をゆるやかに反映（指数で連続的に変化）
  const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 200 : 1);
  const dy = Math.max(-60, Math.min(60, e.deltaY * unit));
  const factor = Math.exp(-dy * 0.0025);
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

// 現在見えている領域（論理座標）の中心とサイズ
function visibleCenter() {
  const r = canvasWrap.getBoundingClientRect();
  const v = state.view;
  return {
    x: (r.width  / 2 - v.panX) / v.zoom,
    y: (r.height / 2 - v.panY) / v.zoom,
  };
}
function visibleRect() {
  const r = canvasWrap.getBoundingClientRect();
  const v = state.view;
  return {
    x: -v.panX / v.zoom,
    y: -v.panY / v.zoom,
    w: r.width  / v.zoom,
    h: r.height / v.zoom,
  };
}

// =========================================================================
// ノード操作
// =========================================================================
function addNode(kind, x, y) {
  const def = KIND_DEFS[kind];
  if (!def) return;
  pushHistory();
  const c = visibleCenter();
  const node = {
    id: "n" + state.seq++,
    kind, name: def.label,
    x: x ?? Math.round(c.x - 50 + (Math.random() - 0.5) * 80),
    y: y ?? Math.round(c.y - 30 + (Math.random() - 0.5) * 80),
    params: { ...def.defaults },
  };
  state.nodes.push(node);
  selectedId = node.id;
  selectedIds = new Set([node.id]);
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
  selectedIds.delete(id);
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
  const c = visibleCenter();
  state.notes.push({
    id: "m" + state.seq++,
    text: "メモを書いてね📝",
    x: Math.round(c.x - 70 + (Math.random() - 0.5) * 60),
    y: Math.round(c.y - 35 + (Math.random() - 0.5) * 60),
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
  selectedIds.clear();
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
    el.className = `node kind-${node.kind}` + (selectedIds.has(node.id) ? " selected" : "");
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

    // 出力ノードのグラフはホバーで値表示
    if (node.kind === "output") {
      const cv = el.querySelector("canvas.graph");
      if (cv) attachGraphHover(cv, node);
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
const OVERLAY_COLORS = ["#ff8fb5", "#6fd3a3", "#9b8cff", "#ffae5a", "#5ab8e6", "#d97766"];

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
    const ins = outputInputs(node.id);
    if (ins.length === 0) {
      ctx.fillStyle = "#bbb";
      ctx.font = "11px sans-serif";
      ctx.fillText("入力を繋いでね", 8, h / 2);
    }
    ins.forEach((inputId, idx) => {
      const color = ins.length === 1 ? edgeCol : OVERLAY_COLORS[idx % OVERLAY_COLORS.length];
      ctx.beginPath();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      let started = false, lastY = null;
      for (let px = 0; px <= w; px++) {
        const x = xMin + (px / w) * (xMax - xMin);
        let y = evaluate(inputId, x, t);
        if (!isFinite(y)) { started = false; continue; }
        y = Math.max(-h, Math.min(h, y));
        const py = h / 2 - y * yScale;
        if (!started || (lastY !== null && Math.abs(py - lastY) > h * 0.7)) {
          ctx.moveTo(px, py); started = true;
        } else ctx.lineTo(px, py);
        lastY = py;
      }
      ctx.stroke();
    });
    // 再生中：sweeping playhead を描き、各曲線の現在値をドットで強調（単位円⇔波形の連動を可視化）
    if (animState.playing && ins.length > 0) {
      const period = xMax - xMin;
      const xCur = ((animState.t - xMin) % period + period) % period + xMin;
      const pxCur = ((xCur - xMin) / period) * w;
      ctx.strokeStyle = "#ff8fb5";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pxCur, 0); ctx.lineTo(pxCur, h); ctx.stroke();
      ctx.setLineDash([]);
      ins.forEach((inputId, idx) => {
        let yv = evaluate(inputId, xCur, t);
        if (!isFinite(yv)) return;
        yv = Math.max(-h, Math.min(h, yv));
        const py = h / 2 - yv * yScale;
        const color = ins.length === 1 ? edgeCol : OVERLAY_COLORS[idx % OVERLAY_COLORS.length];
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(pxCur, py, 4.5, 0, 2 * Math.PI); ctx.fill();
        // y値ガイド（左端まで点線）
        ctx.strokeStyle = color;
        ctx.setLineDash([2, 4]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(pxCur, py); ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.setLineDash([]);
      });
    }
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
    if (mode === "graph") {
      const ins = outputInputs(node.id);
      if (ins.length > 1) {
        formulaEl.innerHTML = ins.map((id, idx) => {
          const c = OVERLAY_COLORS[idx % OVERLAY_COLORS.length];
          return `<span style="color:${c}">y${idx + 1} = ${escapeHtml(formulaOf(id))}</span>`;
        }).join("<br>");
      } else {
        formulaEl.textContent = "y = " + (ins.length ? formulaOf(ins[0]) : "(未接続)");
      }
    } else if (mode === "polar") {
      formulaEl.textContent = "r = " + formulaOf(node.id);
    } else {
      formulaEl.textContent = "(x,y) = " + formulaOf(node.id);
    }
  }
}

// グラフ上をホバーすると (x, y) 値をツールチップ表示
function attachGraphHover(canvasEl, node) {
  canvasEl.addEventListener("mousemove", (e) => onGraphHover(e, canvasEl, node));
  canvasEl.addEventListener("mouseleave", () => { hintTip.hidden = true; });
}
function onGraphHover(e, cv, node) {
  const r = cv.getBoundingClientRect();
  const px = e.clientX - r.left;
  const xMin = -2 * Math.PI, xMax = 2 * Math.PI;
  const x = xMin + (Math.max(0, Math.min(cv.offsetWidth, px)) / cv.offsetWidth) * (xMax - xMin);
  const t = animState.t;
  const ins = outputInputs(node.id);
  let bodyHtml = `x = ${x.toFixed(3)}`;
  if (ins.length === 0) {
    bodyHtml += "<br><span style='color:#bbb'>(未接続)</span>";
  } else {
    ins.forEach((id, idx) => {
      const y = evaluate(id, x, t);
      const c = ins.length > 1 ? OVERLAY_COLORS[idx % OVERLAY_COLORS.length] : "var(--ink)";
      const label = ins.length > 1 ? `y${idx + 1}` : "y";
      bodyHtml += `<br><span style='color:${c}'>${label} = ${isFinite(y) ? y.toFixed(3) : "∞"}</span>`;
    });
  }
  const wrap = canvasWrap.getBoundingClientRect();
  hintTip.innerHTML = bodyHtml;
  hintTip.style.left = (e.clientX - wrap.left + 14) + "px";
  hintTip.style.top  = (e.clientY - wrap.top + 14) + "px";
  hintTip.hidden = false;
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

  // 選択を更新
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
      if (selectedId === id) selectedId = selectedIds.size ? [...selectedIds][0] : null;
    } else {
      selectedIds.add(id);
      selectedId = id;
    }
  } else {
    if (!selectedIds.has(id)) {
      selectedIds = new Set([id]);
      selectedId = id;
    } else {
      selectedId = id;
    }
  }
  selectedEdgeId = selectedGroupId = selectedNoteId = null;
  edgePopup.hidden = true;

  // 複数選択時は選択中の全ノードを一緒にドラッグ
  const ids = [...selectedIds].map((nid) => {
    const n = state.nodes.find((nn) => nn.id === nid);
    return n ? { id: nid, origX: n.x, origY: n.y } : null;
  }).filter(Boolean);

  dragState = {
    startX: e.clientX, startY: e.clientY,
    ids, moved: false,
  };
  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup",   onDragEnd);
  renderInspector();
  renderNodes();
}
function onDragMove(e) {
  if (!dragState) return;
  if (!dragState.moved) { pushHistory(); dragState.moved = true; }
  const z = state.view.zoom;
  const dx = (e.clientX - dragState.startX) / z;
  const dy = (e.clientY - dragState.startY) / z;
  dragState.ids.forEach(({ id, origX, origY }) => {
    const node = state.nodes.find((n) => n.id === id);
    if (!node) return;
    node.x = origX + dx;
    node.y = origY + dy;
    const el = canvas.querySelector(`.node[data-id="${id}"]`);
    if (el) { el.style.left = node.x + "px"; el.style.top = node.y + "px"; }
  });
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
  selectedIds.clear();
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
  selectedIds.clear();
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

// 共有URL（ハッシュに base64 で state を埋め込む）
function encodeShareState() {
  const minimal = {
    nodes: state.nodes, edges: state.edges,
    groups: state.groups, notes: state.notes,
    seq: state.seq, theme: state.theme, view: state.view,
  };
  const json = JSON.stringify(minimal);
  // UTF-8 → base64（unicode 対応）
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}
function decodeShareState(b64) {
  try {
    const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad  = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
    const json = decodeURIComponent(escape(atob(norm + pad)));
    return JSON.parse(json);
  } catch (_) { return null; }
}
function shareUrl() {
  const b64 = encodeShareState();
  const url = location.origin + location.pathname + "#d=" + b64;
  const msg = document.getElementById("formula-msg");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (msg) msg.textContent = "🔗 共有URLをコピーしました（" + url.length + "文字）";
    }, () => {
      prompt("このURLをコピーしてください", url);
    });
  } else {
    prompt("このURLをコピーしてください", url);
  }
  // URL自体もハッシュに反映（リロードで再現できるよう）
  history.replaceState(null, "", "#d=" + b64);
}
// =========================================================================
// CSS 書き出し（@property + CSS sin()/cos() で波形と円運動を再現）
// =========================================================================
function buildCssExport() {
  const outputs = state.nodes.filter((n) => n.kind === "output" && (!n.params || (n.params.mode || "graph") === "graph"));
  const circles = state.nodes.filter((n) => n.kind === "unitcircle");
  const PALETTE = ["#ff5d8a", "#39a883", "#e89826", "#3d72ff", "#a85cd6", "#c9a200"];
  const DURATION = 4;
  const W = 480, H = 240, AMP = 36;
  const orbitRadius = (i) => 50 + i * 18;

  // 出力もユニットサークルも無いときは、ある sin/cos を 1 本ずつ書き出す（旧挙動）
  const fallbackWaves = (outputs.length === 0)
    ? state.nodes.filter((n) => ["sin", "cos"].includes(n.kind))
    : [];

  if (outputs.length === 0 && circles.length === 0 && fallbackWaves.length === 0) {
    return {
      html: "",
      note: "sin / cos / 単位円 / 出力 ノードを置いてからもう一度試してください",
      legend: [],
    };
  }

  const propertyDecls = [];
  const ruleDecls = [];
  const keyframes = [];
  const htmlNodes = [];
  const legend = [];

  const svgPaths = [];
  const svgRings = [];

  // ---- 入力ノードを CSS calc 式に変換（sin/cos/const のみ。null = 不可） ----
  function inputToCssTerm(nodeId, tVar) {
    const n = state.nodes.find((x) => x.id === nodeId);
    if (!n) return null;
    const p = n.params || {};
    if (["sin", "cos"].includes(n.kind) && !p.useTime) {
      const a = +p.a || 0, b = +p.b || 1, c = +p.c || 0, d = +p.d || 0;
      const cDeg = (c * 180 / Math.PI).toFixed(3);
      const angleSpan = (b * 360).toFixed(3);
      const ampPx = (a * AMP).toFixed(2);
      const offsetPx = (d * AMP).toFixed(2);
      // 画面座標系は y が下向きなので、両項を負にして上下を合わせる
      return `calc(-1 * ${ampPx}px * ${n.kind}(calc(var(${tVar}) * ${angleSpan}deg + ${cDeg}deg)) - ${offsetPx}px)`;
    }
    if (n.kind === "const") {
      const v = +p.value || 0;
      return `${(-v * AMP).toFixed(2)}px`;
    }
    return null;
  }

  // ---- 出力ノードごとに 1 本の波形ドットを生成 ----
  outputs.forEach((out, i) => {
    const ins = outputInputs(out.id);
    const cls = "out-" + (i + 1);
    const varName = "--t-out" + (i + 1);
    const color = PALETTE[i % PALETTE.length];
    const labelText = `📈 ${out.name || "出力"}${outputs.length > 1 ? (i + 1) : ""}`;
    const formula = formulaOf(out.id);

    // (1) 入力すべてが sin/cos/const なら、CSS の calc(sum) で記号的に表現
    let yExpr = null;
    if (ins.length > 0) {
      const terms = ins.map((id) => inputToCssTerm(id, varName));
      if (terms.every((t) => t !== null)) {
        yExpr = `calc(${terms.join(" + ")})`;
      }
    }

    propertyDecls.push(
`@property ${varName} {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}`);

    if (yExpr) {
      // 記号的な @property + sin()/cos() 形式
      ruleDecls.push(
`.${cls} {
  ${varName}: 0;
  position: absolute;
  left: 0; top: 50%;
  width: 0; height: 0;
  animation: ${cls}-anim ${DURATION}s linear infinite;
  transform: translate(
    calc(var(${varName}) * ${W}px),
    ${yExpr}
  );
}`);
      keyframes.push(`@keyframes ${cls}-anim { to { ${varName}: 1; } }`);
    } else {
      // 入力に shift/scale/diff 等が含まれる場合は y(x) をサンプリングしてキーフレームに焼き込む
      const N = 60;
      const stops = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const x = -2 * Math.PI + t * 4 * Math.PI;
        let y = 0;
        for (const id of ins) {
          const v = evaluate(id, x, 0);
          if (isFinite(v)) y += v;
        }
        const px = (t * W).toFixed(1);
        const py = (-y * AMP).toFixed(1);
        const pct = (t * 100).toFixed(1);
        stops.push(`  ${pct}% { transform: translate(${px}px, ${py}px); }`);
      }
      ruleDecls.push(
`.${cls} {
  ${varName}: 0;
  position: absolute;
  left: 0; top: 50%;
  width: 0; height: 0;
  animation: ${cls}-anim ${DURATION}s linear infinite;
  transform: translate(0px, 0px);
}`);
      keyframes.push(`@keyframes ${cls}-anim {\n${stops.join("\n")}\n}`);
    }

    // ドット本体・ラベル・静的曲線（共通スタイル）
    ruleDecls.push(
`.${cls} > .dot {
  position: absolute;
  left: -8px; top: -8px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: ${color};
  box-shadow: 0 0 10px ${color}cc;
}
.${cls} > .lbl {
  position: absolute;
  left: 12px; top: -22px;
  white-space: nowrap;
  font-size: 11px;
  color: ${color};
  background: #fff;
  border: 1px solid ${color};
  border-radius: 6px;
  padding: 1px 6px;
  font-weight: 600;
}`);
    htmlNodes.push(
`  <div class="${cls}"><span class="dot"></span><span class="lbl">${labelText}</span></div>`);

    // 静的曲線：実際の y(x) をサンプリングして SVG パスに（評価結果と一致）
    const N2 = 200;
    const pts = [];
    let started = false;
    for (let k = 0; k <= N2; k++) {
      const t = k / N2;
      const x = -2 * Math.PI + t * 4 * Math.PI;
      let y = 0;
      let bad = false;
      for (const id of ins) {
        const v = evaluate(id, x, 0);
        if (!isFinite(v)) { bad = true; break; }
        y += v;
      }
      if (bad) { started = false; continue; }
      const px = (t * W).toFixed(2);
      const py = (H / 2 - y * AMP).toFixed(2);
      pts.push(`${started ? "L" : "M"}${px},${py}`);
      started = true;
    }
    svgPaths.push(`<path d="${pts.join(" ")}" stroke="${color}" stroke-width="1.5" fill="none" stroke-dasharray="3 3" opacity="0.5" />`);

    legend.push({
      color,
      label: labelText,
      desc: ins.length === 0 ? "（入力未接続）" : `y = ${formula}`,
      tip: yExpr
        ? "@property + CSS sin()/cos() で各成分を合算（記号的に表現）"
        : "サンプリングしたキーフレームでアニメ化（複雑な合成のため）",
    });
  });

  // ---- フォールバック：出力ノードが無いときは sin/cos 単独の波形を従来どおり 1 本ずつ ----
  fallbackWaves.forEach((n, i) => {
    const p = n.params || {};
    const a = +p.a || 1, b = +p.b || 1, c = +p.c || 0, d = +p.d || 0;
    const cls = "wave-" + (i + 1);
    const varName = "--t-w" + (i + 1);
    const color = PALETTE[i % PALETTE.length];
    const cDeg = (c * 180 / Math.PI).toFixed(2);
    const angleSpan = (b * 360).toFixed(2);
    const ampPx = (a * AMP).toFixed(2);
    const offsetPx = (d * AMP).toFixed(2);
    const fnIcon = n.kind === "sin" ? "🌸" : "🍀";
    const labelText = `${fnIcon} ${n.kind}${i + 1}`;
    propertyDecls.push(`@property ${varName} {\n  syntax: '<number>';\n  inherits: false;\n  initial-value: 0;\n}`);
    ruleDecls.push(
`.${cls} {
  ${varName}: 0;
  position: absolute;
  left: 0; top: 50%;
  width: 0; height: 0;
  animation: ${cls}-anim ${DURATION}s linear infinite;
  transform: translate(
    calc(var(${varName}) * ${W}px),
    calc(-1 * ${ampPx}px * ${n.kind}(calc(var(${varName}) * ${angleSpan}deg + ${cDeg}deg)) - ${offsetPx}px)
  );
}
.${cls} > .dot { position: absolute; left: -8px; top: -8px; width: 16px; height: 16px; border-radius: 50%; background: ${color}; box-shadow: 0 0 10px ${color}cc; }
.${cls} > .lbl { position: absolute; left: 12px; top: -22px; white-space: nowrap; font-size: 11px; color: ${color}; background: #fff; border: 1px solid ${color}; border-radius: 6px; padding: 1px 6px; font-weight: 600; }`);
    keyframes.push(`@keyframes ${cls}-anim { to { ${varName}: 1; } }`);
    htmlNodes.push(`  <div class="${cls}"><span class="dot"></span><span class="lbl">${labelText}</span></div>`);
    const N = 80;
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const angle = b * t * 2 * Math.PI + c;
      const yval = a * (n.kind === "sin" ? Math.sin(angle) : Math.cos(angle)) + d;
      pts.push(`${k === 0 ? "M" : "L"}${(t * W).toFixed(2)},${(H / 2 - yval * AMP).toFixed(2)}`);
    }
    svgPaths.push(`<path d="${pts.join(" ")}" stroke="${color}" stroke-width="1.5" fill="none" stroke-dasharray="3 3" opacity="0.45" />`);
    legend.push({
      color, label: labelText,
      desc: `y = ${a}·${n.kind}(${b}x${c >= 0 ? "+" : ""}${c.toFixed(2)})${d >= 0 ? "+" : ""}${d.toFixed(2)}`,
      tip: "出力ノードが無いので、この sin/cos 単独の波を表示しています",
    });
  });

  circles.forEach((n, i) => {
    const p = n.params || {};
    const startDeg = (((+p.angle || 0) * 180 / Math.PI) || 0).toFixed(2);
    const cls = "orbit-" + (i + 1);
    const varName = "--theta-" + (i + 1);
    const color = PALETTE[(waves.length + i) % PALETTE.length];
    const R = orbitRadius(i);
    const labelText = `⭕ θ${i + 1}`;

    propertyDecls.push(
`@property ${varName} {
  syntax: '<angle>';
  inherits: false;
  initial-value: ${startDeg}deg;
}`);
    ruleDecls.push(
`.${cls} {
  ${varName}: ${startDeg}deg;
  position: absolute;
  left: 50%; top: 50%;
  width: 0; height: 0;
  animation: ${cls}-anim ${DURATION}s linear infinite;
  transform: translate(
    calc(cos(var(${varName})) * ${R}px),
    calc(sin(var(${varName})) * -${R}px)
  );
}
.${cls} > .dot {
  position: absolute;
  left: -8px; top: -8px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: ${color};
  box-shadow: 0 0 10px ${color}cc;
}
.${cls} > .lbl {
  position: absolute;
  left: 12px; top: -22px;
  white-space: nowrap;
  font-size: 11px;
  color: ${color};
  background: #fff;
  border: 1px solid ${color};
  border-radius: 6px;
  padding: 1px 6px;
  font-weight: 600;
}`);
    keyframes.push(
`@keyframes ${cls}-anim {
  to { ${varName}: ${(parseFloat(startDeg) + 360).toFixed(2)}deg; }
}`);
    htmlNodes.push(
`  <div class="${cls}"><span class="dot"></span><span class="lbl">${labelText}</span></div>`);

    // SVG: 各円の軌道リング（ステージ中央起点）
    const cx = W / 2, cy = H / 2;
    svgRings.push(
`<circle cx="${cx}" cy="${cy}" r="${R}" stroke="${color}" stroke-width="1" fill="none" stroke-dasharray="4 4" opacity="0.55" />`);

    legend.push({
      color,
      label: labelText,
      desc: `半径 ${R}px の円周を一周（θ: ${startDeg}° → ${(parseFloat(startDeg) + 360).toFixed(0)}°）`,
      tip: "中心から見た角度 θ が 0 → 360° に補間。位置は (cos θ·R, sin θ·R)",
    });
  });

  // 中心点と X 軸 を SVG に描画
  const stageBackdrop =
`<svg class="bg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
  <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#f1c8d8" stroke-width="1" />
  ${circles.length > 0 ? `<circle cx="${W/2}" cy="${H/2}" r="3" fill="#f1c8d8" />` : ""}
  ${svgRings.join("\n  ")}
  ${svgPaths.join("\n  ")}
</svg>`;

  const stageStyle =
`body {
  margin: 0;
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: #fdf6fa;
  font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;
}
.stage {
  position: relative;
  width: ${W}px;
  height: ${H}px;
  border: 1px solid #f1c8d8;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 16px rgba(255, 143, 181, 0.2);
  overflow: hidden;
}
.stage > svg.bg {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}`;

  const css = [
    "/* ===== @property registrations ===== */",
    propertyDecls.join("\n\n"),
    "",
    "/* ===== Stage ===== */",
    stageStyle,
    "",
    "/* ===== Animated elements ===== */",
    ruleDecls.join("\n\n"),
    "",
    "/* ===== Keyframes ===== */",
    keyframes.join("\n\n"),
  ].join("\n");

  const html =
`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>三角関数アニメーション (CSS @property)</title>
<style>
${css}
</style>
</head>
<body>
<div class="stage">
  ${stageBackdrop}
${htmlNodes.join("\n")}
</div>
<!-- 注: @property と sin()/cos() は Chrome 111+ / Safari 15.4+ / Firefox 128+ -->
</body>
</html>
`;
  return { html, note: "", legend };
}

function openCssExport() {
  const { html, note, legend } = buildCssExport();
  const ta = document.getElementById("css-code");
  const iframe = document.getElementById("css-preview");
  const legendEl = document.getElementById("css-legend");
  if (note) {
    ta.value = "";
    iframe.srcdoc = `<div style="font-family:sans-serif;padding:12px;color:#888">${note}</div>`;
    legendEl.innerHTML = "";
  } else {
    ta.value = html;
    iframe.srcdoc = html;
    legendEl.innerHTML = (legend || []).map((it) =>
      `<span class="item" title="${escapeAttr(it.tip || "")}">
        <span class="swatch" style="background:${it.color}"></span>
        <b>${it.label}</b>
        <span class="muted">${escapeAttr(it.desc || "")}</span>
      </span>`
    ).join("");
  }
  document.getElementById("css-modal").hidden = false;
}
function closeCssExport() {
  document.getElementById("css-modal").hidden = true;
}
function copyCssExport() {
  const ta = document.getElementById("css-code");
  if (!ta.value) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).then(() => {
      const msg = document.getElementById("formula-msg");
      if (msg) msg.textContent = "🎨 CSS をコピーしました";
    }, () => { ta.select(); document.execCommand && document.execCommand("copy"); });
  } else {
    ta.select(); document.execCommand && document.execCommand("copy");
  }
}
function downloadCssExport() {
  const ta = document.getElementById("css-code");
  if (!ta.value) return;
  const blob = new Blob([ta.value], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "trig-animation.html"; a.click();
  URL.revokeObjectURL(url);
}

function tryLoadFromHash() {
  const h = location.hash || "";
  const m = h.match(/^#d=([A-Za-z0-9_\-]+)/);
  if (!m) return false;
  const data = decodeShareState(m[1]);
  if (!data || !data.nodes) return false;
  state = migrate(data);
  return true;
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
  const v = visibleRect();
  // 後方互換: 既存サンプルコードは「左上が(0,0), 右下が(cw,ch)」前提で書かれている
  // ので、見えている領域に対する仮想原点として visibleRect の左上を使う
  const ox = v.x, oy = v.y;
  const cw = v.w || 700;
  const ch = v.h || 500;
  const _x = (px) => Math.round(ox + px);
  const _y = (py) => Math.round(oy + py);

  if (kind === "basic") {
    const a = mkNode("sin",    _x(40),     _y(ch / 2 - 40));
    const o = mkNode("output", _x(cw - 280), _y(ch / 2 - 60));
    addEdgeRaw(a.id, o.id);
  } else if (kind === "sum") {
    const s   = mkNode("sin",    _x(40),       _y(40));
    const c   = mkNode("cos",    _x(40),       _y(ch - 160));
    const add = mkNode("add",    _x(cw / 2 - 60), _y(ch / 2 - 30));
    const o   = mkNode("output", _x(cw - 280),    _y(ch / 2 - 60));
    addEdgeRaw(s.id, add.id);
    addEdgeRaw(c.id, add.id);
    addEdgeRaw(add.id, o.id);
  } else if (kind === "beat") {
    const s1  = mkNode("sin",    _x(40),       _y(40),       { a: 1, b: 1.0 });
    const s2  = mkNode("sin",    _x(40),       _y(ch - 160), { a: 1, b: 1.1 });
    const add = mkNode("add",    _x(cw / 2 - 60), _y(ch / 2 - 30));
    const o   = mkNode("output", _x(cw - 280),    _y(ch / 2 - 60));
    addEdgeRaw(s1.id, add.id); addEdgeRaw(s2.id, add.id); addEdgeRaw(add.id, o.id);
  } else if (kind === "fourier") {
    const harmonics = [1, 3, 5, 7, 9];
    const add = mkNode("add", _x(cw / 2 - 60), _y(ch / 2 - 30));
    harmonics.forEach((h, i) => {
      const n = mkNode("sin", _x(40), _y(20 + i * 70), { a: 1 / h, b: h, c: 0, d: 0 });
      addEdgeRaw(n.id, add.id);
    });
    const o = mkNode("output", _x(cw - 280), _y(ch / 2 - 60));
    addEdgeRaw(add.id, o.id);
  } else if (kind === "lissajous") {
    const sx = mkNode("sin",    _x(40),       _y(60),       { a: 1, b: 3 });
    const sy = mkNode("sin",    _x(40),       _y(ch - 160), { a: 1, b: 2, c: Math.PI / 2 });
    const o  = mkNode("output", _x(cw - 280), _y(ch / 2 - 60), { mode: "lissajous" });
    addEdgeRaw(sx.id, o.id); addEdgeRaw(sy.id, o.id);
  } else if (kind === "pendulum") {
    const c = mkNode("cos",    _x(40),       _y(ch / 2 - 30), { a: 1, b: 1, c: 0, d: 0, useTime: true });
    const o = mkNode("output", _x(cw - 280), _y(ch / 2 - 60));
    addEdgeRaw(c.id, o.id);
    state.notes.push({
      id: "m" + state.seq++,
      text: "θ(t) = cos(t)\n振り子の単振動🪀",
      x: _x(cw / 2 - 80), y: _y(40),
      w: 160, h: 70, rotate: -3, color: "#fff8c8", attached: c.id,
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

// =========================================================================
// 数式パーサ (sin/cos/tan/cot/sec/csc + 四則演算 + π / 数値 / 括弧)
// =========================================================================
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "π") { out.push({ type: "IDENT", value: "pi" }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ type: "NUM", value: parseFloat(s.slice(i, j)) });
      i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      out.push({ type: "IDENT", value: s.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    if ("+-*/".includes(c)) { out.push({ type: "OP", value: c }); i++; continue; }
    if (c === "(") { out.push({ type: "LPAREN" }); i++; continue; }
    if (c === ")") { out.push({ type: "RPAREN" }); i++; continue; }
    throw new Error("不明な文字: " + c);
  }
  // 暗黙の積を挿入: NUM ( | NUM IDENT | RPAREN ( | IDENT ( -> only for non-func
  const inserted = [];
  for (let k = 0; k < out.length; k++) {
    const cur = out[k], next = out[k + 1];
    inserted.push(cur);
    if (!next) continue;
    const isFnCall = cur.type === "IDENT" && next.type === "LPAREN" &&
      ["sin", "cos", "tan", "cot", "sec", "csc"].includes(cur.value);
    if (
      (cur.type === "NUM"   && (next.type === "IDENT" || next.type === "LPAREN")) ||
      (cur.type === "RPAREN" && (next.type === "IDENT" || next.type === "LPAREN")) ||
      (cur.type === "IDENT" && next.type === "LPAREN" && !isFnCall) ||
      (cur.type === "IDENT" && next.type === "IDENT")
    ) {
      inserted.push({ type: "OP", value: "*" });
    }
  }
  inserted.push({ type: "EOF" });
  return inserted;
}

function parseFormula(input) {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (type, value) => {
    const t = tokens[pos];
    if (t.type !== type || (value !== undefined && t.value !== value))
      throw new Error("予期せぬトークン: " + (t.value ?? t.type));
    pos++; return t;
  };
  function expr() {
    let left = term();
    while (peek().type === "OP" && (peek().value === "+" || peek().value === "-")) {
      const op = eat("OP").value;
      left = { type: op === "+" ? "add" : "sub", left, right: term() };
    }
    return left;
  }
  function term() {
    let left = factor();
    while (peek().type === "OP" && (peek().value === "*" || peek().value === "/")) {
      const op = eat("OP").value;
      left = { type: op === "*" ? "mul" : "div", left, right: factor() };
    }
    return left;
  }
  function factor() {
    if (peek().type === "OP" && peek().value === "-") { eat("OP"); return { type: "neg", value: factor() }; }
    if (peek().type === "OP" && peek().value === "+") { eat("OP"); return factor(); }
    return atom();
  }
  function atom() {
    const t = peek();
    if (t.type === "NUM")    { eat("NUM");    return { type: "num", value: t.value }; }
    if (t.type === "LPAREN") { eat("LPAREN"); const e = expr(); eat("RPAREN"); return e; }
    if (t.type === "IDENT") {
      eat("IDENT");
      const name = t.value;
      if (peek().type === "LPAREN") {
        eat("LPAREN"); const arg = expr(); eat("RPAREN");
        return { type: "func", name, arg };
      }
      return { type: "ident", value: name };
    }
    throw new Error("予期せぬトークン: " + JSON.stringify(t));
  }
  const root = expr();
  if (peek().type !== "EOF") throw new Error("末尾に余分なトークン");
  return root;
}

// 線形 (Bx + C) として評価できれば返す
function tryLinear(ast) {
  function evalConst(a) {
    if (a.type === "num") return a.value;
    if (a.type === "ident") {
      if (a.value === "pi") return Math.PI;
      if (a.value === "e")  return Math.E;
      return null;
    }
    if (a.type === "neg") { const v = evalConst(a.value); return v === null ? null : -v; }
    if (["add", "sub", "mul", "div"].includes(a.type)) {
      const l = evalConst(a.left), r = evalConst(a.right);
      if (l === null || r === null) return null;
      switch (a.type) { case "add": return l+r; case "sub": return l-r; case "mul": return l*r; case "div": return l/r; }
    }
    return null;
  }
  function lin(a) {
    if (a.type === "num") return { b: 0, c: a.value };
    if (a.type === "ident") {
      if (a.value === "x") return { b: 1, c: 0 };
      if (a.value === "pi") return { b: 0, c: Math.PI };
      if (a.value === "e")  return { b: 0, c: Math.E };
      return null;
    }
    if (a.type === "neg") { const v = lin(a.value); return v ? { b: -v.b, c: -v.c } : null; }
    if (a.type === "add") { const l = lin(a.left), r = lin(a.right); return (l && r) ? { b: l.b + r.b, c: l.c + r.c } : null; }
    if (a.type === "sub") { const l = lin(a.left), r = lin(a.right); return (l && r) ? { b: l.b - r.b, c: l.c - r.c } : null; }
    if (a.type === "mul") {
      const cL = evalConst(a.left), cR = evalConst(a.right);
      if (cL !== null) { const r = lin(a.right); return r ? { b: cL * r.b, c: cL * r.c } : null; }
      if (cR !== null) { const l = lin(a.left);  return l ? { b: l.b * cR, c: l.c * cR } : null; }
      return null;
    }
    if (a.type === "div") {
      const cR = evalConst(a.right);
      if (cR !== null && cR !== 0) { const l = lin(a.left); return l ? { b: l.b / cR, c: l.c / cR } : null; }
      return null;
    }
    return null;
  }
  return lin(ast);
}

function buildFromAst(ast) {
  const FUNCS = ["sin", "cos", "tan", "cot", "sec", "csc"];
  switch (ast.type) {
    case "num":  return mkNode("const", 0, 0, { value: ast.value }).id;
    case "ident":
      if (ast.value === "pi") return mkNode("const", 0, 0, { value: Math.PI }).id;
      if (ast.value === "e")  return mkNode("const", 0, 0, { value: Math.E }).id;
      if (ast.value === "x")  throw new Error("x 単独の式は未対応です（関数の中で使ってね）");
      throw new Error("未知の名前: " + ast.value);
    case "func": {
      if (!FUNCS.includes(ast.name)) throw new Error("未対応の関数: " + ast.name);
      const lin = tryLinear(ast.arg);
      if (!lin) throw new Error(`${ast.name}() の引数は Bx+C の形にしてね`);
      return mkNode(ast.name, 0, 0, { a: 1, b: lin.b, c: lin.c, d: 0 }).id;
    }
    case "neg": {
      // 数値なら直接
      const lin = tryLinear({ type: "neg", value: ast.value });
      if (lin && lin.b === 0) return mkNode("const", 0, 0, { value: lin.c }).id;
      const inner = buildFromAst(ast.value);
      const flip = mkNode("flip", 0, 0, { axis: "y" });
      addEdgeRaw(inner, flip.id);
      return flip.id;
    }
    case "mul": {
      // (定数) × (関数 or 式) は a パラメータに畳み込む
      const cL = (function ec(a) { return tryLinear(a) && tryLinear(a).b === 0 ? tryLinear(a).c : null; })(ast.left);
      const cR = (function ec(a) { return tryLinear(a) && tryLinear(a).b === 0 ? tryLinear(a).c : null; })(ast.right);
      if (cL !== null && ast.right.type === "func" && FUNCS.includes(ast.right.name)) {
        const lin = tryLinear(ast.right.arg);
        if (lin) return mkNode(ast.right.name, 0, 0, { a: cL, b: lin.b, c: lin.c, d: 0 }).id;
      }
      if (cR !== null && ast.left.type === "func" && FUNCS.includes(ast.left.name)) {
        const lin = tryLinear(ast.left.arg);
        if (lin) return mkNode(ast.left.name, 0, 0, { a: cR, b: lin.b, c: lin.c, d: 0 }).id;
      }
      // 一般: mul ノード
      const op = mkNode("mul", 0, 0);
      addEdgeRaw(buildFromAst(ast.left), op.id);
      addEdgeRaw(buildFromAst(ast.right), op.id);
      return op.id;
    }
    case "add": case "sub": case "div": {
      const op = mkNode(ast.type, 0, 0);
      addEdgeRaw(buildFromAst(ast.left), op.id);
      addEdgeRaw(buildFromAst(ast.right), op.id);
      return op.id;
    }
  }
  throw new Error("内部エラー: " + ast.type);
}

function applyFormula(input) {
  const msg = document.getElementById("formula-msg");
  if (!input || !input.trim()) { msg.textContent = "式を入れてね"; return; }
  try {
    const ast = parseFormula(input);
    pushHistory();
    state = createEmptyState();
    applyTheme(state.theme || document.body.dataset.theme || "pastel");
    applyView();
    const rootId = buildFromAst(ast);
    const out = mkNode("output", 0, 0);
    addEdgeRaw(rootId, out.id);
    autoLayout(out.id);
    save(); renderAll();
    msg.textContent = "✨ 作ったよ";
  } catch (err) {
    msg.textContent = "❌ " + err.message;
  }
}

// =========================================================================
// 自動整列
// =========================================================================
function autoLayout(rootId) {
  const levels = {};
  const queue = [{ id: rootId, level: 0 }];
  while (queue.length) {
    const { id, level } = queue.shift();
    const cur = levels[id];
    if (cur !== undefined && cur >= level) continue;
    levels[id] = level;
    state.edges.filter((e) => e.to === id).forEach((e) => queue.push({ id: e.from, level: level + 1 }));
  }
  const byLevel = {};
  Object.entries(levels).forEach(([id, lv]) => {
    if (!byLevel[lv]) byLevel[lv] = [];
    byLevel[lv].push(id);
  });
  const xStep = 200, yStep = 110;
  const v = visibleRect();
  // 出力（lv=0）を見えている領域の右寄りに置く
  const rightX = Math.round(v.x + v.w - 260);
  Object.entries(byLevel).forEach(([lv, ids]) => {
    const x = rightX - parseInt(lv, 10) * xStep;
    const groupH = (ids.length - 1) * yStep;
    const startY = Math.round(v.y + v.h / 2 - groupH / 2);
    ids.forEach((id, i) => {
      const node = state.nodes.find((n) => n.id === id);
      if (!node) return;
      node.x = x;
      node.y = startY + i * yStep;
    });
  });
}

function autoLayoutAll() {
  pushHistory();
  const v = visibleRect();
  const outputs = state.nodes.filter((n) => n.kind === "output");
  if (outputs.length === 0) {
    // 出力ノードがない場合は見えている領域内で左から右へ単純整列
    const cols = 4;
    const xStep = Math.min(180, (v.w - 80) / cols);
    state.nodes.forEach((n, i) => {
      n.x = Math.round(v.x + 30 + (i % cols) * xStep);
      n.y = Math.round(v.y + 30 + Math.floor(i / cols) * 110);
    });
  } else {
    outputs.forEach((o) => autoLayout(o.id));
  }
  save(); renderAll();
}

// =========================================================================
// Tips
// =========================================================================
function showNextTip() {
  const el = document.getElementById("tip-text");
  if (!el) return;
  el.textContent = TIPS[tipIndex % TIPS.length];
  tipIndex++;
}
function showNextUsage() {
  const el = document.getElementById("usage-text");
  if (!el) return;
  el.textContent = USAGES[usageIndex % USAGES.length];
  usageIndex++;
}

// =========================================================================
// 練習モード
// =========================================================================
function openPractice() {
  practiceState = { index: 0, hintShown: false, problem: null };
  document.getElementById("practice-panel").hidden = false;
  loadPracticeProblem();
}
function closePractice() {
  document.getElementById("practice-panel").hidden = true;
  practiceState = null;
}
function loadPracticeProblem() {
  if (!practiceState) return;
  const p = PRACTICE_PROBLEMS[practiceState.index % PRACTICE_PROBLEMS.length];
  practiceState.problem = p;
  practiceState.hintShown = false;
  document.getElementById("practice-counter").textContent = `問題 ${(practiceState.index % PRACTICE_PROBLEMS.length) + 1}/${PRACTICE_PROBLEMS.length}`;
  drawPracticeTarget(p);
  const hint = document.getElementById("practice-hint");
  hint.hidden = true; hint.textContent = "";
  const result = document.getElementById("practice-result");
  result.textContent = ""; result.className = "muted";
}
function drawPracticeTarget(problem) {
  const cv = document.getElementById("practice-target");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const styles = getComputedStyle(document.body);
  const lineCol = styles.getPropertyValue("--line").trim() || "#f1c8d8";
  const edgeCol = styles.getPropertyValue("--edge").trim() || "#ff8fb5";
  drawAxes(ctx, w, h, lineCol);
  ctx.beginPath();
  ctx.strokeStyle = edgeCol; ctx.lineWidth = 2;
  const xMin = -2 * Math.PI, xMax = 2 * Math.PI;
  const yScale = 18;
  let started = false, lastY = null;
  for (let px = 0; px <= w; px++) {
    const x = xMin + (px / w) * (xMax - xMin);
    let y = problem.fn(x);
    if (!isFinite(y)) { started = false; continue; }
    y = Math.max(-h, Math.min(h, y));
    const py = h / 2 - y * yScale;
    if (!started || (lastY !== null && Math.abs(py - lastY) > h * 0.7)) {
      ctx.moveTo(px, py); started = true;
    } else ctx.lineTo(px, py);
    lastY = py;
  }
  ctx.stroke();
}
function checkPractice() {
  if (!practiceState || !practiceState.problem) return;
  const result = document.getElementById("practice-result");
  const out = state.nodes.find((n) => n.kind === "output");
  if (!out) {
    result.textContent = "📈 出力ノードを置いて、関数を繋いでね";
    result.className = "muted practice-result-wrong";
    return;
  }
  const ins = outputInputs(out.id);
  if (ins.length === 0) {
    result.textContent = "📈 出力ノードに関数を繋いでね";
    result.className = "muted practice-result-wrong";
    return;
  }
  const N = 200;
  const xMin = -2 * Math.PI, xMax = 2 * Math.PI;
  let sumSq = 0, sumT2 = 0, sumT = 0, valid = 0;
  // ユーザの出力 = 入力1本ならその値、複数あれば合計（出力が和を表示する仕様に合わせる）
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const yT = practiceState.problem.fn(x);
    let yU = 0;
    let bad = false;
    for (const id of ins) {
      const v = evaluate(id, x, 0);
      if (!isFinite(v) || Math.abs(v) > 1e3) { bad = true; break; }
      yU += v;
    }
    if (bad || !isFinite(yT)) continue;
    sumSq += (yU - yT) ** 2;
    sumT2 += yT * yT;
    sumT  += yT;
    valid++;
  }
  if (valid < N * 0.4) {
    result.textContent = "🌀 値が安定してないみたい… 接続を見直してね";
    result.className = "muted practice-result-wrong";
    return;
  }
  const rmse = Math.sqrt(sumSq / valid);
  // 相対誤差: 目標波形の RMS で正規化（定数や小振幅の問題は分母にフロアを設ける）
  const rmsT = Math.sqrt(sumT2 / valid);
  const meanT = sumT / valid;
  const scale = Math.max(rmsT, Math.abs(meanT), 0.5);
  const nrmse = rmse / scale;

  if (nrmse < 0.10) {
    result.innerHTML = `🎉 <span class="practice-result-correct">正解！</span> <span class="muted">(相対誤差 ${(nrmse*100).toFixed(1)}%)</span>`;
    celebrate();
    setTimeout(() => {
      if (practiceState) { practiceState.index++; loadPracticeProblem(); }
    }, 1800);
  } else if (nrmse < 0.25) {
    result.innerHTML = `<span class="practice-result-wrong">惜しい！</span> もう少しで正解 <span class="muted">(相対誤差 ${(nrmse*100).toFixed(0)}%)</span>`;
    result.className = "muted";
  } else {
    result.innerHTML = `<span class="practice-result-wrong">違うかな…</span> グラフをよく見てみて <span class="muted">(相対誤差 ${(nrmse*100).toFixed(0)}%)</span>`;
    result.className = "muted";
  }
}
function showPracticeHint() {
  if (!practiceState || !practiceState.problem) return;
  const hint = document.getElementById("practice-hint");
  hint.hidden = false;
  hint.textContent = "💡 答え: y = " + practiceState.problem.formula + " — " + practiceState.problem.hint;
  practiceState.hintShown = true;
}
function nextPractice() {
  if (!practiceState) return;
  practiceState.index++;
  loadPracticeProblem();
}
function celebrate() {
  const wrap = document.getElementById("canvas-wrap");
  const r = wrap.getBoundingClientRect();
  const emojis = ["🎉", "🌸", "✨", "🌟", "💖", "🎊", "🌈", "🍀", "🌷"];
  // バナー
  const banner = document.createElement("div");
  banner.className = "celebrate-banner";
  banner.textContent = "🌸 正解！";
  wrap.appendChild(banner);
  setTimeout(() => banner.remove(), 1500);
  // 紙吹雪
  for (let i = 0; i < 22; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const x = r.width / 2 + (Math.random() - 0.5) * 220;
    const y = r.height / 2;
    const dx = (Math.random() - 0.5) * 460;
    const dy = (Math.random() - 0.2) * 360 + 220;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", dx + "px");
    el.style.setProperty("--dy", dy + "px");
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }
}
