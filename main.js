// ねこつなげる - main.js

// === 定数 ===
const ASPECT_W = 9;
const ASPECT_H = 16;
const BOARD_COLS = 8;
const BOARD_ROWS = 16;
const SPAWN_COL = 3;
const SPAWN_ROW = 0;
const NEXT_COUNT = 2;
const FALL_INTERVAL = 1.0;       // 通常落下間隔（秒）
const FAST_FALL_INTERVAL = 0.05; // 高速落下間隔（秒）

// === 禁止ペア（接続不可の辺の値の組み合わせ） ===
let FORBIDDEN_PAIRS = new Set([
  // "3,4", "4,3", "1,1", "2,2", "1,3", "2,4", "4,1", "3,2" // きびしめモード
  // かんたんモードは、すべての非ゼロ接続を許可（互換・非互換の区別なし）
]);

/** 2つの辺の値が接続可能かどうか判定 */
function canConnect(sideA, sideB) {
  if (sideA === 0 || sideB === 0) return false;
  return !FORBIDDEN_PAIRS.has(`${sideA},${sideB}`);
}

// 方向定義: [dRow, dCol, 自分のside index, 隣のside index]
const DIRECTIONS = [
  [-1, 0, 0, 2], // 上: 自分の上辺 ↔ 隣の下辺
  [0, 1, 1, 3],  // 右: 自分の右辺 ↔ 隣の左辺
  [1, 0, 2, 0],  // 下: 自分の下辺 ↔ 隣の上辺
  [0, -1, 3, 1], // 左: 自分の左辺 ↔ 隣の右辺
];

// === ブロックデータ構造 ===
// sides: [上, 右, 下, 左] の各値は 0〜4
// 0=接続なし, 1=上下足なし, 2=上足なし下足あり, 3=上足あり下足なし, 4=上下足あり
// type: "head" | "tail" | "straight" | "elbow" | "tee" | "cross" | "isolated"

function createBlock(sides, type) {
  return {
    type: type || classifyBlock(sides),
    sides: [...sides],
    rotation: 0,
  };
}

function classifyBlock(sides) {
  const connected = sides.filter(s => s !== 0).length;
  if (connected === 0) return "isolated";
  if (connected === 1) return "end";
  if (connected === 2) {
    const [u, r, d, l] = sides;
    if ((u !== 0 && d !== 0) || (r !== 0 && l !== 0)) return "straight";
    return "elbow";
  }
  if (connected === 3) return "tee";
  return "cross";
}

function rotateSides(sides) {
  return [sides[3], sides[0], sides[1], sides[2]];
}

// === ブロック定義（blocks.json から読み込み） ===
let BLOCK_DEFS = [];           // blocks.json の blocks 配列
let BLOCK_PATTERNS = [];       // sides 配列のみ（互換用）
let BLOCK_IMAGES = {};         // id → Image オブジェクト
let BLOCK_CATEGORY_INDICES = {};
let SPAWN_WEIGHTS = {};
let SPAWN_WEIGHT_TOTAL = 0;

/** blocks.json を読み込んでブロック定義を初期化 */
async function loadBlockDefs() {
  const res = await fetch("blocks.json");
  const data = await res.json();

  // 禁止ペア
  if (data.forbiddenPairs && data.forbiddenPairs.length > 0) {
    FORBIDDEN_PAIRS = new Set(data.forbiddenPairs.map(p => p.join(",")));
  }

  // スポーン重み
  SPAWN_WEIGHTS = data.spawnWeights;
  SPAWN_WEIGHT_TOTAL = Object.values(SPAWN_WEIGHTS).reduce((a, b) => a + b, 0);

  // ブロック定義
  BLOCK_DEFS = data.blocks;
  BLOCK_PATTERNS = BLOCK_DEFS.map(b => b.sides);

  // カテゴリ別インデックスを自動構築
  BLOCK_CATEGORY_INDICES = {};
  BLOCK_DEFS.forEach((def, i) => {
    const cat = def.category;
    if (!BLOCK_CATEGORY_INDICES[cat]) BLOCK_CATEGORY_INDICES[cat] = [];
    BLOCK_CATEGORY_INDICES[cat].push(i);
  });

  // 画像プリロード
  const imagePromises = [];
  for (const def of BLOCK_DEFS) {
    if (def.image) {
      const img = new Image();
      const p = new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // 読み込み失敗でも止めない
      });
      img.src = def.image;
      BLOCK_IMAGES[def.id] = img;
      imagePromises.push(p);
    }
  }
  await Promise.all(imagePromises);
}

function generateBlock() {
  let roll = Math.random() * SPAWN_WEIGHT_TOTAL;
  let chosenCategory = "straight";
  for (const [category, weight] of Object.entries(SPAWN_WEIGHTS)) {
    roll -= weight;
    if (roll <= 0) {
      chosenCategory = category;
      break;
    }
  }

  const indices = BLOCK_CATEGORY_INDICES[chosenCategory];
  const patternIndex = indices[Math.floor(Math.random() * indices.length)];
  let sides = [...BLOCK_PATTERNS[patternIndex]];

  const rotations = Math.floor(Math.random() * 4);
  for (let i = 0; i < rotations; i++) {
    sides = rotateSides(sides);
  }

  return {
    type: chosenCategory,
    sides: sides,
    rotation: rotations,
    defId: BLOCK_DEFS[patternIndex].id,
  };
}

const TYPE_COLORS = {
  isolated: "#ddd",
  head:     "#f9a825",
  tail:     "#ff8a65",
  end:      "#f9a825",
  straight: "#66bb6a",
  elbow:    "#42a5f5",
  tee:      "#ab47bc",
  cross:    "#ef5350",
};

// === Canvas ===
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
let canvasCssW = 0;
let canvasCssH = 0;

function resizeCanvas() {
  const containerW = window.innerWidth;
  const containerH = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  let canvasW, canvasH;
  if (containerW / containerH < ASPECT_W / ASPECT_H) {
    canvasW = containerW;
    canvasH = containerW * (ASPECT_H / ASPECT_W);
  } else {
    canvasH = containerH;
    canvasW = containerH * (ASPECT_W / ASPECT_H);
  }

  canvasCssW = Math.floor(canvasW);
  canvasCssH = Math.floor(canvasH);

  canvas.width = canvasCssW * dpr;
  canvas.height = canvasCssH * dpr;
  canvas.style.width = canvasCssW + "px";
  canvas.style.height = canvasCssH + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// === 盤面 ===
function createBoard() {
  const board = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    board.push(new Array(BOARD_COLS).fill(null));
  }
  return board;
}

// === ゲーム状態 ===
const game = {
  running: true,
  state: "playing", // "playing" | "gameover"
  lastTime: 0,
  score: 0,
  board: createBoard(),
  current: null,     // { block, row, col } - 落下中のブロック
  nextQueue: [],     // 次のブロック配列
  fallTimer: 0,      // 落下タイマー
  fastDrop: false,   // 高速落下中フラグ
  completedCats: [], // 完成した猫の履歴
  catCount: 0,       // 完成した猫の数
};

// === ブロック操作 ===

/** 指定位置にブロックを配置できるか */
function canPlaceAt(row, col) {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS
    && game.board[row][col] === null;
}

/** 新しいブロックを出現させる */
function spawnBlock() {
  // ネクストキューを補充
  while (game.nextQueue.length < NEXT_COUNT + 1) {
    game.nextQueue.push(generateBlock());
  }

  const block = game.nextQueue.shift();
  game.nextQueue.push(generateBlock());

  // 出現位置がすでに塞がれていたらゲームオーバー
  if (!canPlaceAt(SPAWN_ROW, SPAWN_COL)) {
    game.state = "gameover";
    return;
  }

  game.current = { block, row: SPAWN_ROW, col: SPAWN_COL };
  game.fallTimer = 0;
  game.fastDrop = false;
}

/** ブロックを左右に移動 */
function moveCurrentBlock(dx) {
  if (!game.current || game.state !== "playing") return;
  const newCol = game.current.col + dx;
  if (canPlaceAt(game.current.row, newCol)) {
    game.current.col = newCol;
  }
}

/** ブロックを回転（時計回り） */
function rotateCurrentBlock() {
  if (!game.current || game.state !== "playing") return;
  game.current.block.sides = rotateSides(game.current.block.sides);
  game.current.block.rotation = (game.current.block.rotation + 1) % 4;
}

/** ブロックを固定して盤面に配置 */
function lockCurrentBlock() {
  const { block, row, col } = game.current;
  game.board[row][col] = block;
  game.current = null;

  // 完成判定 → 消去 → 落下 → 連鎖チェック
  processCompletions();

  // 死にブロック判定
  markDeadBlocks();
}

// === 死にブロック判定 ===

/** ブロックが壁接触で完全死かどうか判定
 *  非ゼロの接続面が壁（盤面外）に面していれば完全死 */
function isDeadBlock(row, col, block) {
  for (const [dr, dc, si] of DIRECTIONS) {
    if (block.sides[si] === 0) continue; // 接続なしはスキップ
    const nr = row + dr;
    const nc = col + dc;
    // 盤面外（壁）に面している → 完全死
    if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) {
      return true;
    }
  }
  return false;
}

/** 盤面全体の死にブロックを判定・マーク */
function markDeadBlocks() {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const block = game.board[r][c];
      if (!block) continue;
      block.dead = isDeadBlock(r, c, block);
    }
  }
}

// === 完成判定 ===

/** 完成猫を探して消去。連鎖も処理する */
function processCompletions() {
  const cats = findCompletedCats();
  if (cats.length > 0) {
    for (const cat of cats) {
      game.catCount++;
      game.score += cat.blocks.length * 10;
      // 盤面から消去
      for (const pos of cat.blocks) {
        game.board[pos.row][pos.col] = null;
      }
      game.completedCats.push(cat);
    }
    updateScoreDisplay();

    // 消去後に落下処理
    applyGravity();

    // 連鎖チェック（再帰）
    processCompletions();
  }
}

/** 盤面上の全完成猫を探索
 *  完成条件: 連結成分の全ブロックの非ゼロ接続面が
 *  空きマスにも壁（盤面外）にも面していないこと。
 *  つまり全ての接続面が他ブロック（互換・非互換問わず）で塞がれている状態。
 */
function findCompletedCats() {
  const cats = [];
  const globalUsed = new Set();

  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const block = game.board[r][c];
      if (!block) continue;
      if (globalUsed.has(`${r},${c}`)) continue;

      // BFS探索で連結成分を取得
      const visited = new Set();
      const queue = [{ row: r, col: c }];
      visited.add(`${r},${c}`);
      const blocks = [];

      while (queue.length > 0) {
        const pos = queue.shift();
        const b = game.board[pos.row][pos.col];
        blocks.push(pos);

        for (const [dr, dc, si, sj] of DIRECTIONS) {
          const nr = pos.row + dr;
          const nc = pos.col + dc;
          const key = `${nr},${nc}`;
          if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) continue;
          if (visited.has(key)) continue;
          const nb = game.board[nr][nc];
          if (!nb) continue;
          if (canConnect(b.sides[si], nb.sides[sj])) {
            visited.add(key);
            queue.push({ row: nr, col: nc });
          }
        }
      }

      // 完成判定: 全ブロックの非ゼロ接続面が互換な隣接ブロックで満たされているか
      let hasOpenSide = false;
      for (const pos of blocks) {
        const b = game.board[pos.row][pos.col];
        for (const [dr, dc, si, sj] of DIRECTIONS) {
          if (b.sides[si] === 0) continue; // 接続なしの辺はスキップ
          const nr = pos.row + dr;
          const nc = pos.col + dc;
          // 壁（盤面外）に面している → 開いている
          if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) {
            hasOpenSide = true;
            break;
          }
          // 空きマスに面している → 開いている
          if (game.board[nr][nc] === null) {
            hasOpenSide = true;
            break;
          }
          // 隣接ブロックと互換接続でない → 開いている（非互換は塞いだことにならない）
          const nb = game.board[nr][nc];
          if (!canConnect(b.sides[si], nb.sides[sj])) {
            hasOpenSide = true;
            break;
          }
        }
        if (hasOpenSide) break;
      }

      if (!hasOpenSide) {
        cats.push({ blocks });
        for (const pos of blocks) {
          globalUsed.add(`${pos.row},${pos.col}`);
        }
      }
    }
  }

  return cats;
}

/** 消去後にブロックを落下させる */
function applyGravity() {
  for (let c = 0; c < BOARD_COLS; c++) {
    let writeRow = BOARD_ROWS - 1;
    for (let r = BOARD_ROWS - 1; r >= 0; r--) {
      if (game.board[r][c] !== null) {
        if (r !== writeRow) {
          game.board[writeRow][c] = game.board[r][c];
          game.board[r][c] = null;
        }
        writeRow--;
      }
    }
  }
}

// === ゲームループ ===
function gameLoop(timestamp) {
  if (!game.lastTime) game.lastTime = timestamp;
  const dt = (timestamp - game.lastTime) / 1000;
  game.lastTime = timestamp;

  update(dt);
  draw();

  if (game.running) {
    requestAnimationFrame(gameLoop);
  }
}

function update(dt) {
  if (game.state !== "playing") return;

  // ブロックが無ければ新しく生成
  if (!game.current) {
    spawnBlock();
    return;
  }

  // 落下処理
  const interval = game.fastDrop ? FAST_FALL_INTERVAL : FALL_INTERVAL;
  game.fallTimer += dt;

  while (game.fallTimer >= interval) {
    game.fallTimer -= interval;
    if (canPlaceAt(game.current.row + 1, game.current.col)) {
      game.current.row++;
    } else {
      // 着地 → 固定
      lockCurrentBlock();
      return;
    }
  }
}

// === 描画 ===
function draw() {
  ctx.clearRect(0, 0, canvasCssW, canvasCssH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);

  drawGridLines();
  drawBoard();
  drawCurrentBlock();
  drawNextBlocks();
  drawDebugInfo();

  if (game.state === "gameover") {
    drawGameOver();
  }
}

function getCellSize() {
  return {
    w: canvasCssW / BOARD_COLS,
    h: canvasCssH / BOARD_ROWS,
  };
}

function drawGridLines() {
  const { w, h } = getCellSize();
  ctx.strokeStyle = "#e0d8cc";
  ctx.lineWidth = 1;

  for (let x = 0; x <= BOARD_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * w, 0);
    ctx.lineTo(x * w, canvasCssH);
    ctx.stroke();
  }
  for (let y = 0; y <= BOARD_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * h);
    ctx.lineTo(canvasCssW, y * h);
    ctx.stroke();
  }
}

/** 1つのブロックを指定位置に描画 */
function drawBlockAt(block, x, y, w, h, padding) {
  const bx = x + padding;
  const by = y + padding;
  const bw = w - padding * 2;
  const bh = h - padding * 2;

  // 画像があれば画像描画、なければ従来の色描画
  const img = (block.defId != null) ? BLOCK_IMAGES[block.defId] : null;

  if (img && img.complete && img.naturalWidth > 0) {
    // 回転を適用して画像を描画
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((block.rotation || 0) * Math.PI / 2);
    if (block.dead) ctx.globalAlpha *= 0.4;
    ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  } else {
    // フォールバック: 色ブロック描画
    ctx.fillStyle = block.dead ? "#b0b0b0" : (TYPE_COLORS[block.type] || "#ccc");
    ctx.fillRect(bx, by, bw, bh);

    // 接続面マーカー
    ctx.strokeStyle = block.dead ? "#888" : "#333";
    ctx.lineWidth = 2;
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (block.sides[0] !== 0) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, y + padding); ctx.stroke();
    }
    if (block.sides[1] !== 0) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x + w - padding, cy); ctx.stroke();
    }
    if (block.sides[2] !== 0) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, y + h - padding); ctx.stroke();
    }
    if (block.sides[3] !== 0) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x + padding, cy); ctx.stroke();
    }

    // 辺の値テキスト（デバッグ用）
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(8, w * 0.2)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (block.sides[0] !== 0) ctx.fillText(block.sides[0], cx, y + h * 0.15);
    if (block.sides[1] !== 0) ctx.fillText(block.sides[1], x + w * 0.85, cy);
    if (block.sides[2] !== 0) ctx.fillText(block.sides[2], cx, y + h * 0.85);
    if (block.sides[3] !== 0) ctx.fillText(block.sides[3], x + w * 0.15, cy);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
}

/** 盤面上のブロックを描画 */
function drawBoard() {
  const { w, h } = getCellSize();
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const block = game.board[r][c];
      if (!block) continue;
      drawBlockAt(block, c * w, r * h, w, h, 2);
    }
  }
}

/** 落下中のブロック + ゴースト（着地予測）を描画 */
function drawCurrentBlock() {
  if (!game.current) return;
  const { w, h } = getCellSize();
  const { block, row, col } = game.current;

  // ゴースト（着地位置のプレビュー）
  let ghostRow = row;
  while (canPlaceAt(ghostRow + 1, col)) ghostRow++;
  if (ghostRow !== row) {
    ctx.globalAlpha = 0.25;
    drawBlockAt(block, col * w, ghostRow * h, w, h, 2);
    ctx.globalAlpha = 1.0;
  }

  // 現在位置
  drawBlockAt(block, col * w, row * h, w, h, 2);
}

/** ネクスト表示（Canvas上にオーバーレイ） */
function drawNextBlocks() {
  const { w, h } = getCellSize();
  const previewSize = Math.min(w, h) * 0.8;
  const margin = 6;
  const startX = canvasCssW - previewSize - margin;
  const startY = margin;

  // 背景
  const bgH = 20 + (previewSize + margin) * NEXT_COUNT + margin;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(startX - margin, startY, previewSize + margin * 2, bgH);
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.strokeRect(startX - margin, startY, previewSize + margin * 2, bgH);

  // ラベル
  ctx.fillStyle = "#888";
  ctx.font = `bold ${Math.max(10, previewSize * 0.25)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("NEXT", startX + previewSize / 2, startY + 14);
  ctx.textAlign = "start";

  // ブロック描画
  for (let i = 0; i < Math.min(NEXT_COUNT, game.nextQueue.length); i++) {
    const block = game.nextQueue[i];
    const by = startY + 20 + i * (previewSize + margin);
    drawBlockAt(block, startX, by, previewSize, previewSize, 2);
  }
}

/** ゲームオーバー画面 */
function drawGameOver() {
  // 暗転オーバーレイ
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // タイトル
  ctx.font = `bold ${canvasCssW * 0.09}px sans-serif`;
  ctx.fillText("ねこづまり！", canvasCssW / 2, canvasCssH * 0.35);

  // スコア
  ctx.font = `${canvasCssW * 0.05}px sans-serif`;
  ctx.fillText(`スコア: ${game.score}`, canvasCssW / 2, canvasCssH * 0.48);
  ctx.fillText(`完成した猫: ${game.catCount}匹`, canvasCssW / 2, canvasCssH * 0.55);

  // リスタート案内
  ctx.font = `${canvasCssW * 0.035}px sans-serif`;
  ctx.fillStyle = "#ccc";
  ctx.fillText("スペースキー / タップ でもう一度", canvasCssW / 2, canvasCssH * 0.68);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawDebugInfo() {
  ctx.fillStyle = "#aaa";
  ctx.font = "12px monospace";
  ctx.fillText(`${canvasCssW}x${canvasCssH}  猫:${game.catCount}`, 4, canvasCssH - 4);
}

function updateScoreDisplay() {
  const el = document.getElementById("score-display");
  if (el) el.textContent = game.score;
}

// === 入力: PCキーボード ===
document.addEventListener("keydown", (e) => {
  if (game.state === "gameover") {
    if (e.key === " " || e.key === "Enter") {
      restartGame();
      e.preventDefault();
    }
    return;
  }
  if (game.state !== "playing") return;

  switch (e.key) {
    case "ArrowLeft":
      moveCurrentBlock(-1);
      e.preventDefault();
      break;
    case "ArrowRight":
      moveCurrentBlock(1);
      e.preventDefault();
      break;
    case "ArrowUp":
    case " ":
      rotateCurrentBlock();
      e.preventDefault();
      break;
    case "ArrowDown":
      game.fastDrop = true;
      e.preventDefault();
      break;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowDown") {
    game.fastDrop = false;
  }
});

// === 入力: スマホタッチ ===
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let touchMoved = false;
let longPressTimer = null;

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();

  if (game.state === "gameover") {
    restartGame();
    return;
  }

  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTime = Date.now();
  touchMoved = false;

  // 長押し判定 → 高速落下開始
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    game.fastDrop = true;
  }, 300);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;

  if (Math.abs(dx) > 20) {
    touchMoved = true;
    clearTimeout(longPressTimer);
  }

  // セル幅の60%以上スワイプしたら移動
  const rect = canvas.getBoundingClientRect();
  const cellPixelW = rect.width / BOARD_COLS;
  if (Math.abs(dx) > cellPixelW * 0.6) {
    moveCurrentBlock(dx > 0 ? 1 : -1);
    touchStartX = touch.clientX; // 連続スワイプ用にリセット
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  clearTimeout(longPressTimer);
  game.fastDrop = false;

  const elapsed = Date.now() - touchStartTime;
  // 短いタップ → 回転
  if (!touchMoved && elapsed < 250) {
    rotateCurrentBlock();
  }
}, { passive: false });

// === リスタート ===
function restartGame() {
  game.state = "playing";
  game.score = 0;
  game.catCount = 0;
  game.board = createBoard();
  game.current = null;
  game.nextQueue = [];
  game.fallTimer = 0;
  game.fastDrop = false;
  game.completedCats = [];
  updateScoreDisplay();
}

// === 初期化 ===
async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  await loadBlockDefs();
  requestAnimationFrame(gameLoop);
}

init();
