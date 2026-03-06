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

  // スコア設定
  if (data.scoring) {
    const s = data.scoring;
    if (s.perfectPairs) PERFECT_PAIRS = new Set(s.perfectPairs.map(p => p.join(",")));
    SCORE_CONFIG = {
      baseMultiplier:      s.baseMultiplier      ?? SCORE_CONFIG.baseMultiplier,
      hasHeadOrTailBonus:  s.hasHeadOrTailBonus  ?? SCORE_CONFIG.hasHeadOrTailBonus,
      hasHeadAndTailBonus: s.hasHeadAndTailBonus ?? SCORE_CONFIG.hasHeadAndTailBonus,
      balancedBonus:       s.balancedBonus       ?? SCORE_CONFIG.balancedBonus,
      perfectJointBonus:   s.perfectJointBonus   ?? SCORE_CONFIG.perfectJointBonus,
    };
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
  bomb:     "#e53935",
};

// === Canvas ===
const canvas = document.getElementById("game-canvas");
let ctx = canvas.getContext("2d");
let canvasCssW = 0;
let canvasCssH = 0;

function resizeCanvas() {
  const containerW = window.innerWidth;
  const containerH = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  // セルが正方形になるようにcell sizeを決める
  const cellSize = Math.floor(Math.min(containerW / BOARD_COLS, containerH / BOARD_ROWS));

  canvasCssW = cellSize * BOARD_COLS;
  canvasCssH = cellSize * BOARD_ROWS;

  canvas.width = canvasCssW * dpr;
  canvas.height = canvasCssH * dpr;
  canvas.style.width = canvasCssW + "px";
  canvas.style.height = canvasCssH + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
  state: "title", // "title" | "playing" | "result"
  lastTime: 0,
  score: 0,
  board: createBoard(),
  current: null,     // { block, row, col } - 落下中のブロック
  nextQueue: [],     // 次のブロック配列
  fallTimer: 0,      // 落下タイマー
  fastDrop: false,   // 高速落下中フラグ
  completedCats: [], // 完成した猫の履歴
  catCount: 0,       // 完成した猫の数
  catPopups: [],     // 現在表示中のポップアップ（0か1つ）
  catPopupQueue: [], // 表示待ちポップアップ（順番待ち）
  bombEffect: null,  // 爆発エフェクト { cells, row, col, timer, duration }
  fallingAnim: null, // 落下アニメーション { cells, progress, duration, onComplete }
  pendingGravityCallback: null, // ポップアップ消化後に実行する落下コールバック（連鎖制御）
  comboCount: 0,     // 連鎖カウンター（ブロック着地ごとにリセット）
  comboPopups: [],   // コンボ表示 [ { count, timer, duration } ]
  simPopups: [],     // 同時消し表示 [ { count, timer, duration } ]
  sessionCats: [],   // 今セッションの完成猫（galleryレコード形式）
  resultCatIdx: 0,   // リザルト画面: 現在表示中の猫インデックス
  resultCatTimer: 0, // リザルト画面: 現在猫の表示タイマー
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

  // 出現位置がすでに塞がれていたらリザルト画面へ
  if (!canPlaceAt(SPAWN_ROW, SPAWN_COL)) {
    game.state = "result";
    game.resultCatIdx = 0;
    game.resultCatTimer = 0;
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
  game.current = null;
  game.comboCount = 0; // 新ブロック着地でコンボリセット

  if (block.type === "bomb") {
    explodeBomb(row, col);
    return;
  }

  game.board[row][col] = block;

  // 完成判定 → 消去 → 落下アニメーション → 連鎖チェック → 死にブロック判定
  processCompletions();
}

/** 爆弾が着地: 周辺ブロックをエフェクト後に消去 */
function explodeBomb(row, col) {
  const cells = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS && game.board[nr][nc] !== null) {
      cells.push({ nr, nc });
    }
  }
  game.bombEffect = { cells, row, col, timer: 0, duration: 0.45 };
}

/** 爆発エフェクト終了時に実際の消去処理を実行 */
function finishBombExplosion(row, col) {
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
      game.board[nr][nc] = null;
    }
  }
  game.comboCount = 0; // 爆弾後もコンボリセット
  applyGravityAnimated(() => {
    processCompletions();
  });
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

let PERFECT_PAIRS = new Set(['1,1', '2,3', '3,2', '4,4']);
let SCORE_CONFIG = {
  baseMultiplier: 10,
  hasHeadOrTailBonus: 0.5,
  hasHeadAndTailBonus: 0.5,
  balancedBonus: 0.5,
  perfectJointBonus: 15,
};

function calculateCatScore(cat) {
  const n = cat.blocks.length;
  const base = SCORE_CONFIG.baseMultiplier * n * n;

  // 頭/しっぽ倍率
  let heads = 0, tails = 0;
  for (const pos of cat.blocks) {
    const b = game.board[pos.row][pos.col];
    if (b.type === 'head') heads++;
    if (b.type === 'tail') tails++;
  }
  let mult = 1.0;
  if (heads > 0 || tails > 0) mult += SCORE_CONFIG.hasHeadOrTailBonus;
  if (heads > 0 && tails > 0) mult += SCORE_CONFIG.hasHeadAndTailBonus;
  if (heads > 0 && tails > 0 && heads === tails) mult += SCORE_CONFIG.balancedBonus;

  // 接合部ボーナス
  let perfectJoints = 0;
  const catSet = new Set(cat.blocks.map(pos => `${pos.row},${pos.col}`));
  for (const pos of cat.blocks) {
    const b = game.board[pos.row][pos.col];
    for (const [dr, dc, si, sj] of DIRECTIONS) {
      if (b.sides[si] === 0) continue;
      const nr = pos.row + dr;
      const nc = pos.col + dc;
      if (!catSet.has(`${nr},${nc}`)) continue;
      const nb = game.board[nr][nc];
      if (PERFECT_PAIRS.has(`${b.sides[si]},${nb.sides[sj]}`)) perfectJoints++;
    }
  }
  perfectJoints = Math.floor(perfectJoints / 2);

  return Math.round(base * mult) + perfectJoints * SCORE_CONFIG.perfectJointBonus;
}

/** 完成猫を探して消去。連鎖も処理する */
function processCompletions() {
  const cats = findCompletedCats();
  if (cats.length > 0) {
    const isSimultaneous = cats.length > 1;
    let comboMult;

    if (isSimultaneous) {
      // 同時消し: 連鎖カウントを増やさず、同時消しボーナスを適用
      comboMult = Math.max(1, game.comboCount);
      const simMult = 1 + (cats.length - 1) * 0.5; // 2匹=×1.5, 3匹=×2.0...
      game.simPopups.push({ count: cats.length, simMult, timer: 0, duration: 1.6 });
    } else {
      // 1匹消し: 連鎖カウント++
      game.comboCount++;
      comboMult = game.comboCount;
      game.comboPopups.push({ count: game.comboCount, timer: 0, duration: 1.6 });
    }

    const simultaneousMult = isSimultaneous ? 1 + (cats.length - 1) * 0.5 : 1;

    for (const cat of cats) {
      game.catCount++;
      const baseScore = calculateCatScore(cat);
      game.score += Math.round(baseScore * comboMult * simultaneousMult);

      // 演出用: 盤面から消す前にブロックデータをコピー
      const popupBlocks = cat.blocks.map(pos => ({
        row: pos.row,
        col: pos.col,
        block: { ...game.board[pos.row][pos.col] },
      }));
      game.catPopupQueue.push({ blocks: popupBlocks, timer: 0, duration: 2.5, baseScore }); // キューに追加
      saveCatRecord(popupBlocks, baseScore);

      // 盤面から消去
      for (const pos of cat.blocks) {
        game.board[pos.row][pos.col] = null;
      }
      game.completedCats.push(cat);
    }
    updateScoreDisplay();

    // ポップアップが全部消えるまで待ってから落下させる（連鎖演出）
    game.pendingGravityCallback = () => {
      applyGravityAnimated(() => {
        processCompletions();
      });
    };
  } else {
    // 猫なし → 死にブロック判定で終了
    markDeadBlocks();
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

/** 消去後にブロックを落下させる（即時） */
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

/** 落下アニメーション付きapplyGravity。完了後にonCompleteを呼ぶ */
function applyGravityAnimated(onComplete) {
  const movingCells = [];
  for (let c = 0; c < BOARD_COLS; c++) {
    let writeRow = BOARD_ROWS - 1;
    for (let r = BOARD_ROWS - 1; r >= 0; r--) {
      if (game.board[r][c] !== null) {
        if (r !== writeRow) {
          movingCells.push({ block: game.board[r][c], col: c, fromRow: r, toRow: writeRow });
        }
        writeRow--;
      }
    }
  }

  applyGravity(); // boardを即時更新

  if (movingCells.length === 0) {
    onComplete();
    return;
  }

  game.fallingAnim = { cells: movingCells, progress: 0, duration: 0.22, onComplete };
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
  // ポップアップタイマー更新（state問わず動かす）
  for (let i = game.catPopups.length - 1; i >= 0; i--) {
    game.catPopups[i].timer += dt;
    if (game.catPopups[i].timer >= game.catPopups[i].duration) {
      game.catPopups.splice(i, 1);
    }
  }
  // キューから次のポップアップを取り出す（現在表示中がなければ）
  if (game.catPopups.length === 0 && game.catPopupQueue.length > 0) {
    game.catPopups.push(game.catPopupQueue.shift());
  }

  // 同時消しポップアップタイマー更新
  for (let i = game.simPopups.length - 1; i >= 0; i--) {
    game.simPopups[i].timer += dt;
    if (game.simPopups[i].timer >= game.simPopups[i].duration) {
      game.simPopups.splice(i, 1);
    }
  }

  // コンボポップアップタイマー更新
  for (let i = game.comboPopups.length - 1; i >= 0; i--) {
    game.comboPopups[i].timer += dt;
    if (game.comboPopups[i].timer >= game.comboPopups[i].duration) {
      game.comboPopups.splice(i, 1);
    }
  }

  if (game.state === "gallery") {
    updateGallery(dt);
    return;
  }

  if (game.state === "result") {
    updateResult(dt);
    return;
  }

  if (game.state !== "playing") return;

  // 爆発エフェクト処理（エフェクト中は通常処理をスキップ）
  if (game.bombEffect) {
    game.bombEffect.timer += dt;
    if (game.bombEffect.timer >= game.bombEffect.duration) {
      const { row, col } = game.bombEffect;
      game.bombEffect = null;
      finishBombExplosion(row, col);
    }
    return;
  }

  // 落下アニメーション処理（アニメーション中は通常処理をスキップ）
  if (game.fallingAnim) {
    game.fallingAnim.progress += dt;
    if (game.fallingAnim.progress >= game.fallingAnim.duration) {
      const { onComplete } = game.fallingAnim;
      game.fallingAnim = null;
      onComplete();
    }
    return;
  }

  // ポップアップ消化待ち（全ポップアップが消えたら落下＆連鎖チェックを実行）
  if (game.pendingGravityCallback) {
    if (game.catPopups.length === 0 && game.catPopupQueue.length === 0) {
      const cb = game.pendingGravityCallback;
      game.pendingGravityCallback = null;
      cb();
    }
    return;
  }

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
  if (game.state === "gallery") {
    drawGallery();
    return;
  }
  if (game.state === "result") {
    drawResult();
    return;
  }
  ctx.clearRect(0, 0, canvasCssW, canvasCssH);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);

  drawGridLines();
  drawBoard();
  drawFallingAnim();
  if (game.bombEffect) drawBombEffect();
  drawCurrentBlock();
  drawNextBlocks();

  if (game.state === "title") {
    drawTitleScreen();
  }

  drawCatPopups();
  drawComboPopups();
  drawSimPopups();
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
    // 画像はセル全体に描画（paddingなし）でぴったり接続
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((block.rotation || 0) * Math.PI / 2);
    if (block.dead) ctx.globalAlpha *= 0.4;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  } else if (block.type === "bomb") {
    // 爆弾の描画
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(bw, bh) / 2;
    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // バツ印
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, r * 0.3);
    ctx.lineCap = "round";
    const d = r * 0.55;
    ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
    ctx.lineCap = "butt";
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
  // アニメーション中のセル（最終位置）はスキップ
  const animSet = new Set();
  if (game.fallingAnim) {
    for (const cell of game.fallingAnim.cells) {
      animSet.add(`${cell.toRow},${cell.col}`);
    }
  }
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (animSet.has(`${r},${c}`)) continue;
      const block = game.board[r][c];
      if (!block) continue;
      drawBlockAt(block, c * w, r * h, w, h, 2);
    }
  }
}

/** 落下アニメーション中のブロックを補間位置で描画 */
function drawFallingAnim() {
  if (!game.fallingAnim) return;
  const { cells, progress, duration } = game.fallingAnim;
  const { w, h } = getCellSize();
  const t = Math.min(progress / duration, 1.0);
  // ease-out quad: 最初速く→最後ゆっくり
  const eased = 1 - (1 - t) * (1 - t);
  for (const { block, col, fromRow, toRow } of cells) {
    const curRow = fromRow + (toRow - fromRow) * eased;
    drawBlockAt(block, col * w, curRow * h, w, h, 2);
  }
}

/** 爆発エフェクト: 消去対象ブロックを赤くフラッシュ */
function drawBombEffect() {
  const { cells, timer, duration } = game.bombEffect;
  const { w, h } = getCellSize();
  // sin波で明滅（高速点滅）
  const flash = 0.5 + 0.5 * Math.sin(timer * Math.PI * 12);
  ctx.fillStyle = `rgba(255, 60, 60, ${0.5 + 0.4 * flash})`;
  for (const { nr, nc } of cells) {
    ctx.fillRect(nc * w, nr * h, w, h);
  }
}

/** 落下中のブロック + ゴースト（着地予測）を描画 */
function drawCurrentBlock() {
  if (!game.current) return;
  const { w, h } = getCellSize();
  const { block, row, col } = game.current;

  // マス間の補間（線形落下アニメーション）
  // 次のマスに進めない場合（着地直前）はoffsetなし
  const interval = game.fastDrop ? FAST_FALL_INTERVAL : FALL_INTERVAL;
  const rowOffset = canPlaceAt(row + 1, col) ? Math.min(game.fallTimer / interval, 1.0) : 0;

  // ゴースト（着地位置のプレビュー）
  let ghostRow = row;
  while (canPlaceAt(ghostRow + 1, col)) ghostRow++;
  if (ghostRow !== row) {
    ctx.globalAlpha = 0.25;
    drawBlockAt(block, col * w, ghostRow * h, w, h, 2);
    ctx.globalAlpha = 1.0;
  }

  // 現在位置（補間で滑らかに落下）
  drawBlockAt(block, col * w, (row + rowOffset) * h, w, h, 2);
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

/** タイトル画面 */
function drawTitleScreen() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${canvasCssW * 0.1}px sans-serif`;
  ctx.fillText("ねこつなげる", canvasCssW / 2, canvasCssH * 0.38);

  ctx.font = `${canvasCssW * 0.038}px sans-serif`;
  ctx.fillStyle = "#ddd";
  ctx.fillText("猫パーツをつなげて猫を完成させよう", canvasCssW / 2, canvasCssH * 0.52);

  ctx.font = `bold ${canvasCssW * 0.046}px sans-serif`;
  ctx.fillStyle = "#ffe082";
  ctx.fillText("スペースキー / タップ でスタート", canvasCssW / 2, canvasCssH * 0.66);

  // ギャラリーボタン
  const gallBtn = getGalleryBtnRect("title");
  ctx.fillStyle = "rgba(200, 160, 100, 0.82)";
  roundRect(ctx, gallBtn.x, gallBtn.y, gallBtn.w, gallBtn.h, 10);
  ctx.fill();
  ctx.font = `bold ${Math.round(gallBtn.h * 0.42)}px sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.fillText("ギャラリーを見る", canvasCssW / 2, gallBtn.y + gallBtn.h / 2);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
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

  // ギャラリーボタン
  const gallBtn = getGalleryBtnRect("gameover");
  ctx.fillStyle = "rgba(200, 160, 100, 0.82)";
  roundRect(ctx, gallBtn.x, gallBtn.y, gallBtn.w, gallBtn.h, 10);
  ctx.fill();
  ctx.font = `bold ${Math.round(gallBtn.h * 0.42)}px sans-serif`;
  ctx.fillStyle = "#fff";
  ctx.fillText("ギャラリーを見る", canvasCssW / 2, gallBtn.y + gallBtn.h / 2);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

// === リザルト画面 ===

function getResultBtnRect(which) {
  const btnW = canvasCssW * 0.65;
  const btnH = Math.max(34, canvasCssH * 0.05);
  const btnX = (canvasCssW - btnW) / 2;
  if (which === "share")   return { x: btnX, y: canvasCssH * 0.800, w: btnW, h: btnH };
  if (which === "restart") return { x: btnX, y: canvasCssH * 0.868, w: btnW, h: btnH };
  if (which === "gallery") return { x: btnX, y: canvasCssH * 0.936, w: btnW, h: btnH };
}

function updateResult(dt) {
  game.resultCatTimer += dt;
  const AUTO_ADVANCE = 2.5;
  if (game.sessionCats.length > 0 && game.resultCatIdx < game.sessionCats.length - 1) {
    if (game.resultCatTimer >= AUTO_ADVANCE) {
      game.resultCatIdx++;
      game.resultCatTimer = 0;
    }
  }
}

function drawResult() {
  ctx.fillStyle = "#fff8f2";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // タイトル
  ctx.fillStyle = "#5d4037";
  ctx.font = `bold ${canvasCssW * 0.1}px sans-serif`;
  ctx.fillText("ねこづまり！", canvasCssW / 2, canvasCssH * 0.08);

  const cats = game.sessionCats;

  if (cats.length === 0) {
    // 猫なし
    ctx.fillStyle = "#a1887f";
    ctx.font = `${canvasCssW * 0.045}px sans-serif`;
    ctx.fillText("今回は猫が完成しませんでした", canvasCssW / 2, canvasCssH * 0.38);
  } else {
    // ズームアニメーション（新しい猫に切り替わったとき 0→1 でスケール）
    const ZOOM_DUR = 0.35;
    const t = Math.min(game.resultCatTimer / ZOOM_DUR, 1.0);
    const scale = 1 - Math.pow(1 - t, 3); // ease-out cubic

    const cat = cats[game.resultCatIdx];
    const catAreaX = canvasCssW * 0.05;
    const catAreaY = canvasCssH * 0.13;
    const catAreaW = canvasCssW * 0.90;
    const catAreaH = canvasCssH * 0.46;
    drawCatThumbnail(cat, catAreaX, catAreaY, catAreaW, catAreaH, scale);

    // ページネーション（複数猫のときのみ）
    if (cats.length > 1) {
      const dotR = Math.max(4, canvasCssW * 0.018);
      const dotSpacing = dotR * 3.2;
      const totalDotsW = (cats.length - 1) * dotSpacing;
      const dotY = canvasCssH * 0.617;
      for (let i = 0; i < cats.length; i++) {
        const dotX = canvasCssW / 2 - totalDotsW / 2 + i * dotSpacing;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = i === game.resultCatIdx ? "#a1887f" : "#d7ccc8";
        ctx.fill();
      }
    }

    // 猫番号テキスト
    ctx.fillStyle = "#a1887f";
    ctx.font = `${canvasCssW * 0.038}px sans-serif`;
    ctx.fillText(`${game.resultCatIdx + 1} / ${cats.length}`, canvasCssW / 2, canvasCssH * 0.617);
  }

  // 区切り線
  ctx.strokeStyle = "#d7ccc8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvasCssW * 0.1, canvasCssH * 0.645);
  ctx.lineTo(canvasCssW * 0.9, canvasCssH * 0.645);
  ctx.stroke();

  // スコア
  ctx.fillStyle = "#5d4037";
  ctx.font = `bold ${canvasCssW * 0.072}px sans-serif`;
  ctx.fillText(`${game.score}点`, canvasCssW / 2, canvasCssH * 0.698);

  ctx.font = `${canvasCssW * 0.045}px sans-serif`;
  ctx.fillStyle = "#6d4c41";
  ctx.fillText(`完成した猫: ${game.catCount}匹`, canvasCssW / 2, canvasCssH * 0.754);

  if (cats.length > 0) {
    const longest = Math.max(...cats.map(c => c.blocks.length));
    ctx.fillText(`最長の猫: ${longest}パーツ`, canvasCssW / 2, canvasCssH * 0.803);
  }

  // ボタン
  const shareBtn = getResultBtnRect("share");
  ctx.fillStyle = cats.length > 0 ? "#5b9bd5" : "#c0bbb8";
  roundRect(ctx, shareBtn.x, shareBtn.y, shareBtn.w, shareBtn.h, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(shareBtn.h * 0.45)}px sans-serif`;
  ctx.fillText(canShareFiles() ? "共有する 🐱" : "画像をダウンロード 🐱", canvasCssW / 2, shareBtn.y + shareBtn.h / 2);

  const restartBtn = getResultBtnRect("restart");
  ctx.fillStyle = "#a1887f";
  roundRect(ctx, restartBtn.x, restartBtn.y, restartBtn.w, restartBtn.h, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(restartBtn.h * 0.45)}px sans-serif`;
  ctx.fillText("もう一度遊ぶ", canvasCssW / 2, restartBtn.y + restartBtn.h / 2);

  const gallBtn = getResultBtnRect("gallery");
  ctx.fillStyle = "rgba(200, 160, 100, 0.82)";
  roundRect(ctx, gallBtn.x, gallBtn.y, gallBtn.w, gallBtn.h, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(gallBtn.h * 0.45)}px sans-serif`;
  ctx.fillText("ギャラリーを見る", canvasCssW / 2, gallBtn.y + gallBtn.h / 2);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

// === SNSシェア ===

/** シェア用画像（正方形）を生成して Blob を返す */
function generateShareImage(cat) {
  return new Promise(resolve => {
    const SIZE = 900;
    const offCanvas = document.createElement("canvas");
    offCanvas.width = SIZE;
    offCanvas.height = SIZE;

    // ctx を一時的にオフスクリーンに差し替え
    const origCtx = ctx;
    const origW = canvasCssW;
    const origH = canvasCssH;
    ctx = offCanvas.getContext("2d");
    canvasCssW = SIZE;
    canvasCssH = SIZE;

    // 背景
    ctx.fillStyle = "#fff8f2";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 枠線
    ctx.strokeStyle = "#d7b8a0";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, SIZE - 10, SIZE - 10);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // タイトル
    ctx.fillStyle = "#5d4037";
    ctx.font = `bold ${Math.round(SIZE * 0.072)}px sans-serif`;
    ctx.fillText("ねこつなげる", SIZE / 2, SIZE * 0.075);

    // 猫描画
    const catAreaSize = SIZE * 0.58;
    const catAreaX = (SIZE - catAreaSize) / 2;
    const catAreaY = SIZE * 0.115;
    drawCatThumbnail(cat, catAreaX, catAreaY, catAreaSize, catAreaSize, 1.0);

    // 区切り線
    ctx.strokeStyle = "#d7ccc8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SIZE * 0.1, SIZE * 0.755);
    ctx.lineTo(SIZE * 0.9, SIZE * 0.755);
    ctx.stroke();

    // スコア
    ctx.fillStyle = "#5d4037";
    ctx.font = `bold ${Math.round(SIZE * 0.072)}px sans-serif`;
    ctx.fillText(`${game.score}点`, SIZE / 2, SIZE * 0.815);

    // 完成数・最長
    ctx.fillStyle = "#8d6e63";
    ctx.font = `${Math.round(SIZE * 0.042)}px sans-serif`;
    ctx.fillText(`完成した猫: ${game.catCount}匹`, SIZE / 2, SIZE * 0.872);

    // 日付とハッシュタグ
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
    ctx.fillStyle = "#bcaaa4";
    ctx.font = `${Math.round(SIZE * 0.036)}px sans-serif`;
    ctx.fillText(`${dateStr}  #ねこつなげる`, SIZE / 2, SIZE * 0.94);

    // ctx を元に戻す
    ctx = origCtx;
    canvasCssW = origW;
    canvasCssH = origH;

    offCanvas.toBlob(resolve, "image/png");
  });
}

/** ファイル付き Web Share API が使えるか判定（モバイルのみ） */
function canShareFiles() {
  try {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    if (!isMobile) return false;
    const dummy = new File([""], "test.png", { type: "image/png" });
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [dummy] }));
  } catch {
    return false;
  }
}

/** 現在表示中の猫をシェア（モバイル: 共有シート / PC: ダウンロード） */
async function shareCurrentCat() {
  const cat = game.sessionCats[game.resultCatIdx];
  if (!cat) return;

  const blob = await generateShareImage(cat);
  const file = new File([blob], "nekotsunageru.png", { type: "image/png" });
  const tweetText = `ねこつなげる で ${game.score}点！${game.catCount}匹の猫を完成させました！\n#ねこつなげる`;

  if (canShareFiles()) {
    // モバイル: Web Share API でファイルごと共有
    try {
      await navigator.share({ files: [file], text: tweetText });
    } catch (e) {
      if (e.name !== "AbortError") throw e;
    }
  } else {
    // PC: 画像をダウンロードのみ
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nekotsunageru.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/** 完成ねこのポップアップ演出を描画 */
function drawCatPopups() {
  if (game.catPopups.length === 0) return;

  // 複数ある場合は最新のものだけ表示
  const popup = game.catPopups[game.catPopups.length - 1];
  const { blocks, timer, duration } = popup;

  // フェード計算: 0〜0.3秒でフェードイン、2.0〜2.5秒でフェードアウト
  let alpha;
  if (timer < 0.3) {
    alpha = timer / 0.3;
  } else if (timer > 2.0) {
    alpha = 1 - (timer - 2.0) / (duration - 2.0);
  } else {
    alpha = 1;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  // ブロック群の範囲を計算
  const rows = blocks.map(b => b.row);
  const cols = blocks.map(b => b.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const catW = maxCol - minCol + 1;
  const catH = maxRow - minRow + 1;

  // ポップアップのセルサイズ（盤面セルの1.8倍、ただし画面に収まるよう制限）
  const { w: cellW, h: cellH } = getCellSize();
  const scale = Math.min(
    (canvasCssW * 0.7) / (catW * cellW),
    (canvasCssH * 0.6) / (catH * cellH),
    1.8
  );
  const popCellW = cellW * scale;
  const popCellH = cellH * scale;

  const totalW = catW * popCellW;
  const totalH = catH * popCellH;
  const scoreFontSize = Math.round(Math.min(popCellW, popCellH) * 0.32);
  const scoreRowH = scoreFontSize + 10;
  const originX = (canvasCssW - totalW) / 2;
  const originY = (canvasCssH - totalH - scoreRowH) / 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  // 背景（角丸の薄い白）
  const pad = 16;
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  roundRect(ctx, originX - pad, originY - pad, totalW + pad * 2, totalH + pad * 2 + scoreRowH, 12);
  ctx.fill();

  // 枠線
  ctx.strokeStyle = "rgba(180, 160, 140, 0.7)";
  ctx.lineWidth = 2;
  roundRect(ctx, originX - pad, originY - pad, totalW + pad * 2, totalH + pad * 2 + scoreRowH, 12);
  ctx.stroke();

  // ブロック描画
  for (const { row, col, block } of blocks) {
    const x = originX + (col - minCol) * popCellW;
    const y = originY + (row - minRow) * popCellH;
    drawBlockAt(block, x, y, popCellW, popCellH, 2);
  }

  // スコア表示
  if (popup.baseScore != null) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scoreY = originY + totalH + pad + scoreRowH / 2;
    ctx.font = `bold ${scoreFontSize}px sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillText(`+${popup.baseScore} pt`, originX + totalW / 2 + 1, scoreY + 1);
    ctx.fillStyle = "#e65100";
    ctx.fillText(`+${popup.baseScore} pt`, originX + totalW / 2, scoreY);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();
}

/** コンボ表示（○COMBO!）をふわっと表示 */
function drawComboPopups() {
  if (game.comboPopups.length === 0) return;
  // 最新のコンボのみ表示
  const popup = game.comboPopups[game.comboPopups.length - 1];
  const { count, timer, duration } = popup;

  // フェード: 0〜0.15秒でイン、1.2〜1.6秒でアウト
  let alpha;
  if (timer < 0.15) {
    alpha = timer / 0.15;
  } else if (timer > 1.2) {
    alpha = 1 - (timer - 1.2) / (duration - 1.2);
  } else {
    alpha = 1;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  // 上方向にふわっとフロート
  const floatY = timer / duration * canvasCssH * 0.06;

  const cx = canvasCssW / 2;
  const cy = canvasCssH * 0.28 - floatY;
  const fontSize = Math.round(canvasCssW * 0.1);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const mainText = `${count} COMBO!`;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const mainW = ctx.measureText(mainText).width;
  const multFontSize = Math.round(fontSize * 0.42);
  const multText = `×${count}`;
  ctx.font = `bold ${multFontSize}px sans-serif`;
  const multW = ctx.measureText(multText).width;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const totalTextW = mainW + 6 + multW;
  const textLeft = cx - totalTextW / 2;

  // 影
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.textAlign = "left";
  ctx.fillText(mainText, textLeft + 2, cy + 2);

  // 本文（コンボ数で色を変える）
  const colors = ["#f9a825", "#ff7043", "#e91e63", "#9c27b0", "#3f51b5"];
  const color = colors[Math.min(count - 1, colors.length - 1)];
  ctx.fillStyle = color;
  ctx.fillText(mainText, textLeft, cy);

  // 倍率（小さく右横）
  ctx.font = `bold ${multFontSize}px sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillText(multText, textLeft + mainW + 6 + 1, cy + fontSize * 0.08 + 1);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(multText, textLeft + mainW + 6, cy + fontSize * 0.08);

  ctx.textAlign = "center";

  ctx.restore();
}

/** 同時消しボーナス表示（N匹いっぺん！）*/
function drawSimPopups() {
  if (game.simPopups.length === 0) return;
  const popup = game.simPopups[game.simPopups.length - 1];
  const { count, simMult, timer, duration } = popup;

  let alpha;
  if (timer < 0.15) {
    alpha = timer / 0.15;
  } else if (timer > 1.2) {
    alpha = 1 - (timer - 1.2) / (duration - 1.2);
  } else {
    alpha = 1;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  const floatY = timer / duration * canvasCssH * 0.06;
  const cx = canvasCssW / 2;
  const cy = canvasCssH * 0.28 - floatY;
  const fontSize = Math.round(canvasCssW * 0.085);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillText(`${count}匹いっぺん！`, cx + 2, cy + 2);

  ctx.fillStyle = "#43a047";
  ctx.fillText(`${count}匹いっぺん！`, cx, cy);

  // ボーナス倍率の小文字表示
  const subFontSize = Math.round(canvasCssW * 0.045);
  ctx.font = `${subFontSize}px sans-serif`;
  ctx.fillStyle = "rgba(67, 160, 71, 0.9)";
  ctx.fillText(`×${simMult.toFixed(1)} ボーナス！`, cx, cy + fontSize * 0.8);

  ctx.restore();
}

/** 角丸矩形パスを作成 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}


function updateScoreDisplay() {
  const el = document.getElementById("score-display");
  if (el) el.textContent = game.score;
}

// === ギャラリー画面 ===
const GALLERY_COLS = 3;
const GALLERY_HEADER_H = 52;

const galleryState = {
  cats: [],
  selectedIdx: -1,
  animTime: 0,
  squishes: {},       // idx → { t, dur }
  detailSquish: { t: 0, dur: 0.35, active: false },
  scrollY: 0,
  fromState: "title",
  touchStartY: 0,
  scrollStartY: 0,
  scrolled: false,
  detailBounds: null,
};

function openGallery(fromState) {
  galleryState.fromState = fromState;
  galleryState.cats = loadGallery().reverse(); // 新しい順
  galleryState.selectedIdx = -1;
  galleryState.scrollY = 0;
  galleryState.squishes = {};
  galleryState.detailSquish = { t: 0, dur: 0.35, active: false };
  galleryState.scrolled = false;
  game.state = "gallery";
}

function closeGallery() {
  game.state = galleryState.fromState;
}

function updateGallery(dt) {
  galleryState.animTime += dt;
  for (const idx in galleryState.squishes) {
    galleryState.squishes[idx].t += dt;
    if (galleryState.squishes[idx].t >= galleryState.squishes[idx].dur) {
      delete galleryState.squishes[idx];
    }
  }
  if (galleryState.detailSquish.active) {
    galleryState.detailSquish.t += dt;
    if (galleryState.detailSquish.t >= galleryState.detailSquish.dur) {
      galleryState.detailSquish.active = false;
    }
  }
}

function getGalleryBtnRect(state) {
  const btnW = canvasCssW * 0.55;
  const btnH = Math.max(36, canvasCssH * 0.052);
  const btnX = (canvasCssW - btnW) / 2;
  const btnY = state === "title" ? canvasCssH * 0.77 : canvasCssH * 0.78;
  return { x: btnX, y: btnY, w: btnW, h: btnH };
}

function touchToCanvas(touch) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) * (canvasCssW / rect.width),
    y: (touch.clientY - rect.top) * (canvasCssH / rect.height),
  };
}

function clickToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvasCssW / rect.width),
    y: (e.clientY - rect.top) * (canvasCssH / rect.height),
  };
}

function onGalleryTap(cx, cy) {
  // 拡大表示中
  if (galleryState.selectedIdx >= 0) {
    const db = galleryState.detailBounds;
    if (db && cx >= db.x && cx <= db.x + db.w && cy >= db.y && cy <= db.y + db.h) {
      // カードタップ → ぷにっ
      galleryState.detailSquish = { t: 0, dur: 0.35, active: true };
    } else {
      // 外タップ → 閉じる
      galleryState.selectedIdx = -1;
    }
    return;
  }
  // 戻るボタン
  if (cx >= 4 && cx <= 72 && cy >= 8 && cy <= 44) {
    closeGallery();
    return;
  }
  if (cy < GALLERY_HEADER_H) return;

  // サムネイルタップ
  const thumbSize = canvasCssW / GALLERY_COLS;
  const col = Math.floor(cx / thumbSize);
  const row = Math.floor((cy - GALLERY_HEADER_H + galleryState.scrollY) / thumbSize);
  if (col < 0 || col >= GALLERY_COLS || row < 0) return;
  const idx = row * GALLERY_COLS + col;
  if (idx < galleryState.cats.length) {
    galleryState.squishes[idx] = { t: 0, dur: 0.3 };
    galleryState.selectedIdx = idx;
  }
}

function drawGallery() {
  const thumbSize = canvasCssW / GALLERY_COLS;
  const PAD = 5;

  ctx.fillStyle = "#fdf6ee";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);

  // ヘッダー
  ctx.fillStyle = "#f0e0c8";
  ctx.fillRect(0, 0, canvasCssW, GALLERY_HEADER_H);
  ctx.strokeStyle = "#ddc8a0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GALLERY_HEADER_H);
  ctx.lineTo(canvasCssW, GALLERY_HEADER_H);
  ctx.stroke();

  // 戻るボタン
  ctx.fillStyle = "#c4956a";
  roundRect(ctx, 4, 8, 68, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("← 戻る", 38, 26);

  // タイトル
  ctx.fillStyle = "#5d4037";
  ctx.font = `bold ${Math.round(canvasCssW * 0.052)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("ねこギャラリー", canvasCssW / 2, GALLERY_HEADER_H / 2);

  // 件数
  ctx.font = `${Math.round(canvasCssW * 0.033)}px sans-serif`;
  ctx.fillStyle = "#a1887f";
  ctx.textAlign = "right";
  ctx.fillText(`${galleryState.cats.length}匹`, canvasCssW - 8, GALLERY_HEADER_H / 2);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  if (galleryState.cats.length === 0) {
    ctx.fillStyle = "#bcaaa4";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(canvasCssW * 0.048)}px sans-serif`;
    ctx.fillText("まだ猫がいません", canvasCssW / 2, canvasCssH * 0.5);
    ctx.font = `${Math.round(canvasCssW * 0.033)}px sans-serif`;
    ctx.fillText("猫を完成させると保存されます", canvasCssW / 2, canvasCssH * 0.58);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    return;
  }

  // グリッドをクリップして描画
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, GALLERY_HEADER_H, canvasCssW, canvasCssH - GALLERY_HEADER_H);
  ctx.clip();

  for (let i = 0; i < galleryState.cats.length; i++) {
    const row = Math.floor(i / GALLERY_COLS);
    const col = i % GALLERY_COLS;
    const x = col * thumbSize;
    const y = GALLERY_HEADER_H + row * thumbSize - galleryState.scrollY;
    if (y + thumbSize < GALLERY_HEADER_H || y > canvasCssH) continue;

    const isSelected = galleryState.selectedIdx === i;
    ctx.fillStyle = isSelected ? "#ffe0cc" : "#fff8f2";
    roundRect(ctx, x + PAD, y + PAD, thumbSize - PAD * 2, thumbSize - PAD * 2, 10);
    ctx.fill();
    ctx.strokeStyle = isSelected ? "#ff8a65" : "#e8d5bc";
    ctx.lineWidth = isSelected ? 2.5 : 1;
    roundRect(ctx, x + PAD, y + PAD, thumbSize - PAD * 2, thumbSize - PAD * 2, 10);
    ctx.stroke();

    const phase = i * 0.73;
    const breath = 1 + 0.025 * Math.sin(galleryState.animTime * Math.PI * 0.8 + phase);
    const sq = galleryState.squishes[i];
    const squish = sq ? (1 - 0.18 * Math.sin(Math.min(sq.t / sq.dur, 1) * Math.PI)) : 1;
    drawCatThumbnail(galleryState.cats[i], x, y, thumbSize, thumbSize, breath * squish);
  }

  ctx.restore();

  // 拡大表示
  if (galleryState.selectedIdx >= 0 && galleryState.selectedIdx < galleryState.cats.length) {
    drawGalleryDetail(galleryState.cats[galleryState.selectedIdx]);
  }
}

function drawCatThumbnail(cat, x, y, w, h, scale) {
  const rows = cat.blocks.map(b => b.relRow);
  const cols = cat.blocks.map(b => b.relCol);
  const maxRow = Math.max(...rows, 0);
  const maxCol = Math.max(...cols, 0);
  const catW = maxCol + 1;
  const catH = maxRow + 1;

  const cellSize = Math.min((w * 0.72) / catW, (h * 0.72) / catH);
  const totalW = catW * cellSize;
  const totalH = catH * cellSize;
  const originX = x + (w - totalW) / 2;
  const originY = y + (h - totalH) / 2;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(x + w / 2), -(y + h / 2));

  for (const blk of cat.blocks) {
    drawBlockAt(
      { type: blk.type, sides: blk.sides, rotation: blk.rotation, defId: blk.defId },
      originX + blk.relCol * cellSize, originY + blk.relRow * cellSize,
      cellSize, cellSize, 1
    );
  }
  ctx.restore();
}

function drawGalleryDetail(cat) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, 0, canvasCssW, canvasCssH);

  const rows = cat.blocks.map(b => b.relRow);
  const cols = cat.blocks.map(b => b.relCol);
  const catW = Math.max(...cols, 0) + 1;
  const catH = Math.max(...rows, 0) + 1;

  const cellSize = Math.min((canvasCssW * 0.78) / catW, (canvasCssH * 0.60) / catH);
  const totalW = catW * cellSize;
  const totalH = catH * cellSize;

  const pad = 20;
  const scoreFontSize = Math.round(canvasCssW * 0.055);
  const scoreRowH = scoreFontSize + 12;
  const bgW = totalW + pad * 2;
  const bgH = totalH + pad * 2 + scoreRowH;
  const bgX = (canvasCssW - bgW) / 2;
  const bgY = (canvasCssH - bgH) / 2 - 10;

  galleryState.detailBounds = { x: bgX, y: bgY, w: bgW, h: bgH };

  ctx.fillStyle = "rgba(255, 250, 240, 0.97)";
  roundRect(ctx, bgX, bgY, bgW, bgH, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 165, 110, 0.8)";
  ctx.lineWidth = 2.5;
  roundRect(ctx, bgX, bgY, bgW, bgH, 16);
  ctx.stroke();

  // 呼吸 + ぷにっスケール
  const breath = 1 + 0.03 * Math.sin(galleryState.animTime * Math.PI * 0.8);
  const ds = galleryState.detailSquish;
  const squish = ds.active ? (1 - 0.22 * Math.sin(Math.min(ds.t / ds.dur, 1) * Math.PI)) : 1;

  const catCx = bgX + pad + totalW / 2;
  const catCy = bgY + pad + totalH / 2;
  ctx.save();
  ctx.translate(catCx, catCy);
  ctx.scale(breath * squish, breath * squish);
  ctx.translate(-catCx, -catCy);

  for (const blk of cat.blocks) {
    drawBlockAt(
      { type: blk.type, sides: blk.sides, rotation: blk.rotation, defId: blk.defId },
      bgX + pad + blk.relCol * cellSize, bgY + pad + blk.relRow * cellSize,
      cellSize, cellSize, 2
    );
  }
  ctx.restore();

  // スコア
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${scoreFontSize}px sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillText(`${cat.score} pt`, bgX + bgW / 2 + 1, bgY + pad + totalH + scoreRowH / 2 + 1);
  ctx.fillStyle = "#e65100";
  ctx.fillText(`${cat.score} pt`, bgX + bgW / 2, bgY + pad + totalH + scoreRowH / 2);

  // ヒントテキスト
  ctx.font = `${Math.round(canvasCssW * 0.030)}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("タップでぷにっ  外をタップで閉じる", canvasCssW / 2, bgY + bgH + 22);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

// === ギャラリー（localStorageへの保存） ===
const GALLERY_STORAGE_KEY = "nekotsunageru_gallery";

function loadGallery() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

/** 完成猫の形状データをlocalStorageに追記保存 */
function saveCatRecord(popupBlocks, baseScore) {
  const rows = popupBlocks.map(b => b.row);
  const cols = popupBlocks.map(b => b.col);
  const minRow = Math.min(...rows);
  const minCol = Math.min(...cols);

  const record = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    savedAt: Date.now(),
    score: baseScore,
    blocks: popupBlocks.map(b => ({
      relRow: b.row - minRow,
      relCol: b.col - minCol,
      defId: b.block.defId ?? null,
      sides: [...b.block.sides],
      rotation: b.block.rotation ?? 0,
      type: b.block.type,
    })),
  };

  game.sessionCats.push(record);

  const gallery = loadGallery();
  gallery.push(record);
  try {
    localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(gallery));
  } catch (e) {
    console.warn("ギャラリー保存失敗:", e);
  }
}

// === 入力: PCキーボード ===
document.addEventListener("keydown", (e) => {
  if (game.state === "gallery") {
    if (e.key === "Escape") {
      if (galleryState.selectedIdx >= 0) {
        galleryState.selectedIdx = -1;
      } else {
        closeGallery();
      }
      e.preventDefault();
    }
    return;
  }
  if (game.state === "title") {
    if (e.key === " " || e.key === "Enter") {
      startGame();
      e.preventDefault();
    }
    return;
  }
  if (game.state === "result") {
    if (e.key === " " || e.key === "Enter") {
      restartGame();
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (game.sessionCats.length > 0) {
        game.resultCatIdx = (game.resultCatIdx + 1) % game.sessionCats.length;
        game.resultCatTimer = 0;
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (game.sessionCats.length > 0) {
        game.resultCatIdx = (game.resultCatIdx - 1 + game.sessionCats.length) % game.sessionCats.length;
        game.resultCatTimer = 0;
      }
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
      if (!game.fastDrop) {
        game.fastDrop = true;
        // タイマーをインターバル比でスケール → 視覚位置を保ったまま高速落下へ移行
        game.fallTimer = game.fallTimer * (FAST_FALL_INTERVAL / FALL_INTERVAL);
      }
      e.preventDefault();
      break;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowDown") {
    if (game.fastDrop) {
      // fastDrop中のfallTimerをFALL_INTERVALスケールに戻す（ビジュアル位置を保持）
      game.fallTimer = game.fallTimer * (FALL_INTERVAL / FAST_FALL_INTERVAL);
    }
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

  if (game.state === "title") {
    const pt = touchToCanvas(e.touches[0]);
    const btn = getGalleryBtnRect("title");
    if (pt.x >= btn.x && pt.x <= btn.x + btn.w && pt.y >= btn.y && pt.y <= btn.y + btn.h) {
      openGallery("title");
    } else {
      startGame();
    }
    return;
  }

  if (game.state === "result") {
    const pt = touchToCanvas(e.touches[0]);
    const shareBtn  = getResultBtnRect("share");
    const restartBtn = getResultBtnRect("restart");
    const gallBtn = getResultBtnRect("gallery");
    if (pt.x >= shareBtn.x && pt.x <= shareBtn.x + shareBtn.w &&
        pt.y >= shareBtn.y && pt.y <= shareBtn.y + shareBtn.h) {
      shareCurrentCat();
    } else if (pt.x >= restartBtn.x && pt.x <= restartBtn.x + restartBtn.w &&
        pt.y >= restartBtn.y && pt.y <= restartBtn.y + restartBtn.h) {
      restartGame();
    } else if (pt.x >= gallBtn.x && pt.x <= gallBtn.x + gallBtn.w &&
               pt.y >= gallBtn.y && pt.y <= gallBtn.y + gallBtn.h) {
      openGallery("result");
    } else if (game.sessionCats.length > 0) {
      game.resultCatIdx = (game.resultCatIdx + 1) % game.sessionCats.length;
      game.resultCatTimer = 0;
    }
    return;
  }

  if (game.state === "gallery") {
    galleryState.touchStartY = e.touches[0].clientY;
    galleryState.scrollStartY = galleryState.scrollY;
    galleryState.scrolled = false;
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
    game.fallTimer = 0;
  }, 300);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (game.state === "gallery") {
    if (galleryState.selectedIdx >= 0) return;
    const dy = e.touches[0].clientY - galleryState.touchStartY;
    if (Math.abs(dy) > 8) galleryState.scrolled = true;
    const thumbSize = canvasCssW / GALLERY_COLS;
    const totalRows = Math.ceil(galleryState.cats.length / GALLERY_COLS);
    const maxScroll = Math.max(0, totalRows * thumbSize - (canvasCssH - GALLERY_HEADER_H));
    galleryState.scrollY = Math.max(0, Math.min(maxScroll, galleryState.scrollStartY - dy));
    return;
  }
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
  if (game.state === "gallery") {
    if (!galleryState.scrolled) {
      const pt = touchToCanvas(e.changedTouches[0]);
      onGalleryTap(pt.x, pt.y);
    }
    return;
  }
  clearTimeout(longPressTimer);
  game.fastDrop = false;

  const elapsed = Date.now() - touchStartTime;
  // 短いタップ → 回転
  if (!touchMoved && elapsed < 250) {
    rotateCurrentBlock();
  }
}, { passive: false });

canvas.addEventListener("click", (e) => {
  const { x, y } = clickToCanvas(e);
  if (game.state === "title") {
    const btn = getGalleryBtnRect("title");
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      openGallery("title");
    }
    return;
  }
  if (game.state === "result") {
    const shareBtn  = getResultBtnRect("share");
    const restartBtn = getResultBtnRect("restart");
    const gallBtn = getResultBtnRect("gallery");
    if (x >= shareBtn.x && x <= shareBtn.x + shareBtn.w &&
        y >= shareBtn.y && y <= shareBtn.y + shareBtn.h) {
      shareCurrentCat();
    } else if (x >= restartBtn.x && x <= restartBtn.x + restartBtn.w &&
        y >= restartBtn.y && y <= restartBtn.y + restartBtn.h) {
      restartGame();
    } else if (x >= gallBtn.x && x <= gallBtn.x + gallBtn.w &&
               y >= gallBtn.y && y <= gallBtn.y + gallBtn.h) {
      openGallery("result");
    } else if (game.sessionCats.length > 0) {
      game.resultCatIdx = (game.resultCatIdx + 1) % game.sessionCats.length;
      game.resultCatTimer = 0;
    }
    return;
  }
  if (game.state === "gallery") {
    onGalleryTap(x, y);
    return;
  }
});

canvas.addEventListener("wheel", (e) => {
  if (game.state === "gallery" && galleryState.selectedIdx < 0) {
    const thumbSize = canvasCssW / GALLERY_COLS;
    const totalRows = Math.ceil(galleryState.cats.length / GALLERY_COLS);
    const maxScroll = Math.max(0, totalRows * thumbSize - (canvasCssH - GALLERY_HEADER_H));
    galleryState.scrollY = Math.max(0, Math.min(maxScroll, galleryState.scrollY + e.deltaY * 0.5));
    e.preventDefault();
  }
}, { passive: false });

// === スタート / リスタート ===
function startGame() {
  game.state = "playing";
}

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
  game.catPopups = [];
  game.catPopupQueue = [];
  game.bombEffect = null;
  game.fallingAnim = null;
  game.pendingGravityCallback = null;
  game.comboCount = 0;
  game.comboPopups = [];
  game.simPopups = [];
  game.sessionCats = [];
  game.resultCatIdx = 0;
  game.resultCatTimer = 0;
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
