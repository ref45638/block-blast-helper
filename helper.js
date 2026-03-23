/* ============================================================
   Block Blast Helper — Main Logic
   ============================================================ */

(() => {
  'use strict';

  // ── Constants ──
  const BOARD_SIZE = 8;
  const COLORS = [
    { bg: 'var(--block-red)',    name: 'red',    hex: '#ff6b6b' },
    { bg: 'var(--block-orange)', name: 'orange', hex: '#ffa94d' },
    { bg: 'var(--block-yellow)', name: 'yellow', hex: '#ffe066' },
    { bg: 'var(--block-green)',  name: 'green',  hex: '#51cf66' },
    { bg: 'var(--block-cyan)',   name: 'cyan',   hex: '#66d9e8' },
    { bg: 'var(--block-blue)',   name: 'blue',   hex: '#74b9ff' },
    { bg: 'var(--block-purple)', name: 'purple', hex: '#b197fc' },
    { bg: 'var(--block-pink)',   name: 'pink',   hex: '#f783ac' },
  ];

  // ── State ──
  let currentMode = 'manual';       // 'manual' | 'screenshot'
  let selectedColorIdx = 0;         // palette index
  let editorBoard = createEmptyBoard();
  let editorCandidates = [null, null, null]; // [{shape, colorIdx}]

  // Play state
  let playBoard = null;             // 8x8 array during play
  let initialBoard = null;          // snapshot before placing
  let candidates = [null, null, null];
  let usedCandidates = [false, false, false];
  let stepRecords = [];             // [{candidateIdx, row, col, boardBefore, boardAfter, cleared}]
  let isGameOver = false;

  // Screenshot state
  let uploadedImg = null;
  let detectedBoard = null;          // board from auto-detection

  // Drag state
  let dragData = null;

  // ── DOM Refs ──
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const dom = {
    setupPhase: $('#setup-phase'),
    playPhase: $('#play-phase'),
    modeTabs: $$('.mode-tab'),
    manualMode: $('#manual-mode'),
    screenshotMode: $('#screenshot-mode'),
    palette: $('#color-palette'),
    editorBoard: $('#editor-board'),
    editorCandidates: $$('.editor-candidate-group'),
    startBtn: $('#start-btn'),
    // Screenshot
    uploadZone: $('#upload-zone'),
    ssInput: $('#screenshot-input'),
    uploadPlaceholder: $('#upload-placeholder'),
    analysisStatus: $('#analysis-status'),
    analysisText: $('#analysis-text'),
    detectedPreview: $('#detected-preview'),
    previewBoard: $('#preview-board'),
    applyDetectedBtn: $('#apply-detected-btn'),
    retryUploadBtn: $('#retry-upload-btn'),
    // Play
    board: $('#board'),
    boardWrapper: $('#board-wrapper'),
    candidatesEl: $('#candidates'),
    comboText: $('#combo-text'),
    resetCenterBtn: $('#reset-center-btn'),
    resetBtn: $('#reset-btn'),
    solveBtn: $('#solve-btn'),
    backSetupBtn: $('#back-setup-btn'),
    // Lightboxes
    replayLightbox: $('#replay-lightbox'),
    replaySteps: $('#replay-steps'),
    replayCloseBtn: $('#replay-close-btn'),
    solverLightbox: $('#solver-lightbox'),
    solverResult: $('#solver-result'),
    solverApplyBtn: $('#solver-apply-btn'),
    solverCloseBtn: $('#solver-close-btn'),
    solvingOverlay: $('#solving-overlay'),
  };

  // ══════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════

  function init() {
    buildPalette();
    buildEditorBoard();
    buildEditorCandidates();
    bindModeSwitch();
    bindScreenshotUpload();
    bindPlayControls();
    bindLightboxes();
    updateStartBtn();
  }

  // ══════════════════════════════════════════
  //  MODE SWITCH
  // ══════════════════════════════════════════

  function bindModeSwitch() {
    dom.modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        currentMode = mode;
        dom.modeTabs.forEach(t => t.classList.toggle('active', t === tab));
        dom.manualMode.classList.toggle('hidden', mode !== 'manual');
        dom.screenshotMode.classList.toggle('hidden', mode !== 'screenshot');
        updateStartBtn();
      });
    });
  }

  // ══════════════════════════════════════════
  //  PALETTE
  // ══════════════════════════════════════════

  function buildPalette() {
    COLORS.forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'palette-swatch' + (i === 0 ? ' active' : '');
      sw.style.background = c.bg;
      sw.dataset.idx = i;
      sw.addEventListener('click', () => selectColor(i));
      dom.palette.appendChild(sw);
    });
  }

  function selectColor(idx) {
    selectedColorIdx = idx;
    dom.palette.querySelectorAll('.palette-swatch').forEach(sw => {
      const swIdx = parseInt(sw.dataset.idx);
      sw.classList.toggle('active', swIdx === idx);
    });
  }

  // ══════════════════════════════════════════
  //  EDITOR BOARD (Manual Mode)
  // ══════════════════════════════════════════

  function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => -1)   // -1 = empty
    );
  }

  let editorPainting = false;       // drag-paint state
  let editorPaintValue = -1;         // value to paint while dragging

  function buildEditorBoard() {
    dom.editorBoard.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        dom.editorBoard.appendChild(cell);
      }
    }

    // Drag-to-paint: pointerdown starts, pointermove continues, pointerup ends
    dom.editorBoard.addEventListener('pointerdown', e => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      e.preventDefault();
      const r = +cell.dataset.r, c = +cell.dataset.c;
      // Toggle: if cell already has the selected color, erase it
      if (editorBoard[r][c] === selectedColorIdx) {
        editorPaintValue = -1;
      } else {
        editorPaintValue = selectedColorIdx;
      }
      editorPainting = true;
      applyEditorPaint(r, c);
      dom.editorBoard.setPointerCapture(e.pointerId);
    });

    dom.editorBoard.addEventListener('pointermove', e => {
      if (!editorPainting) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const cell = el.closest('.cell');
      if (!cell || !dom.editorBoard.contains(cell)) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      applyEditorPaint(r, c);
    });

    dom.editorBoard.addEventListener('pointerup', () => {
      editorPainting = false;
    });

    dom.editorBoard.addEventListener('pointercancel', () => {
      editorPainting = false;
    });
  }

  function applyEditorPaint(r, c) {
    if (editorBoard[r][c] === editorPaintValue) return; // no change
    editorBoard[r][c] = editorPaintValue;
    renderEditorBoard();
    updateStartBtn();
  }

  function renderEditorBoard() {
    const cells = dom.editorBoard.querySelectorAll('.cell');
    cells.forEach(cell => {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const val = editorBoard[r][c];
      if (val >= 0) {
        cell.classList.add('filled');
        cell.style.background = COLORS[val].bg;
      } else {
        cell.classList.remove('filled');
        cell.style.background = '';
      }
    });
  }

  // ══════════════════════════════════════════
  //  EDITOR CANDIDATES (Manual Mode)
  // ══════════════════════════════════════════

  function buildEditorCandidates() {
    dom.editorCandidates.forEach((group, idx) => {
      buildCandidateGrid(group, idx, 5, 5);
    });
  }

  function buildCandidateGrid(group, idx, rows, cols) {
    const grid = group.querySelector('.candidate-editor-grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 22px)`;

    // init shape data
    if (!editorCandidates[idx]) {
      editorCandidates[idx] = { cells: createEmpty2D(rows, cols), colorIdx: selectedColorIdx >= 0 ? selectedColorIdx : 5 };
    } else {
      editorCandidates[idx].cells = createEmpty2D(rows, cols);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('div');
        cell.className = 'mini-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        grid.appendChild(cell);
      }
    }

    // Drag-to-paint for candidate grid
    let candPainting = false;
    let candPaintOn = false; // true = fill, false = erase

    grid.addEventListener('pointerdown', e => {
      const cell = e.target.closest('.mini-cell');
      if (!cell) return;
      e.preventDefault();
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const data = editorCandidates[idx];
      // Toggle: if already active, erase; otherwise fill
      candPaintOn = !data.cells[r][c];
      candPainting = true;
      applyCandPaint(idx, r, c, candPaintOn);
      grid.setPointerCapture(e.pointerId);
    });

    grid.addEventListener('pointermove', e => {
      if (!candPainting) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const cell = el.closest('.mini-cell');
      if (!cell || !grid.contains(cell)) return;
      const r = +cell.dataset.r, c = +cell.dataset.c;
      applyCandPaint(idx, r, c, candPaintOn);
    });

    grid.addEventListener('pointerup', () => { candPainting = false; });
    grid.addEventListener('pointercancel', () => { candPainting = false; });
  }

  function applyCandPaint(idx, r, c, fillOn) {
    const data = editorCandidates[idx];
    const newVal = fillOn ? 1 : 0;
    if (data.cells[r][c] === newVal) return;
    data.cells[r][c] = newVal;
    if (fillOn) {
      const cIdx = selectedColorIdx >= 0 ? selectedColorIdx : 5;
      data.colorIdx = cIdx;
    }
    // Re-render this grid
    const group = [...document.querySelectorAll('.editor-candidate-group')][idx];
    const grid = group.querySelector('.candidate-editor-grid');
    const cells = grid.querySelectorAll('.mini-cell');
    cells.forEach(cell => {
      const cr = +cell.dataset.r, cc = +cell.dataset.c;
      if (data.cells[cr][cc]) {
        cell.classList.add('active');
        cell.style.background = COLORS[data.colorIdx].bg;
      } else {
        cell.classList.remove('active');
        cell.style.background = '';
      }
    });
    updateStartBtn();
  }

  function createEmpty2D(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  // ══════════════════════════════════════════
  //  SCREENSHOT MODE
  // ══════════════════════════════════════════

  function bindScreenshotUpload() {
    const zone = dom.uploadZone;
    zone.addEventListener('click', () => dom.ssInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleScreenshotFile(e.dataTransfer.files[0]);
    });
    dom.ssInput.addEventListener('change', e => {
      if (e.target.files.length) handleScreenshotFile(e.target.files[0]);
    });
    dom.applyDetectedBtn.addEventListener('click', applyDetectedBoard);
    dom.retryUploadBtn.addEventListener('click', resetScreenshotMode);
  }

  function handleScreenshotFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        uploadedImg = img;
        startAutoAnalysis(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function startAutoAnalysis(img) {
    // Show analysis UI
    dom.uploadPlaceholder.classList.add('hidden');
    dom.uploadZone.style.display = 'none';
    dom.analysisStatus.classList.remove('hidden');
    dom.detectedPreview.classList.add('hidden');
    dom.analysisText.textContent = '正在自動偵測棋盤...';

    // Use setTimeout to allow UI update before heavy computation
    setTimeout(() => {
      try {
        const board = autoDetectBoard(img);
        detectedBoard = board;
        dom.analysisStatus.classList.add('hidden');
        showDetectedPreview(board);
      } catch (err) {
        console.error('Auto-detect failed:', err);
        dom.analysisText.textContent = '⚠️ 自動偵測失敗，請確認截圖包含完整棋盤';
        // Hide spinner on error
        const spinner = dom.analysisStatus.querySelector('.mini-spinner');
        if (spinner) spinner.style.display = 'none';
      }
    }, 100);
  }

  /**
   * Auto-detect the 8×8 board from a screenshot.
   * Strategy:
   *  1. Sample the app background colour from image edges
   *  2. Build a per-row "content width" profile (non-background pixels)
   *  3. The board is the tallest continuous band of wide rows
   *  4. Crop to square, then detect grid gaps for precise cell alignment
   *  5. Sample centre of each cell and match colours
   */
  function autoDetectBoard(img) {
    const canvas = document.createElement('canvas');
    const maxW = 600;
    const scale = Math.min(maxW / img.width, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    const data = imgData.data;

    function px(x, y) {
      x = clamp(Math.round(x), 0, w - 1);
      y = clamp(Math.round(y), 0, h - 1);
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    }
    function luma(r, g, b) { return r * 0.299 + g * 0.587 + b * 0.114; }
    function colorDist(r1, g1, b1, r2, g2, b2) {
      return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    }

    /* ── 1. Sample app background from left & right edges ── */
    const edgePx = [];
    for (let y = 0; y < h; y += 2) {
      edgePx.push(px(0, y), px(1, y), px(w - 1, y), px(w - 2, y));
    }
    const chan = ch => edgePx.map(p => p[ch]).sort((a, b) => a - b);
    const median = arr => arr[arr.length >> 1];
    const bgR = median(chan(0)), bgG = median(chan(1)), bgB = median(chan(2));

    /* ── 2. Per-row content extent (non-background) ── */
    const BG_DIST = 35;
    const rowInfo = [];
    for (let y = 0; y < h; y++) {
      let left = w, right = 0;
      for (let x = 0; x < w; x++) {
        const [r, g, b] = px(x, y);
        if (colorDist(r, g, b, bgR, bgG, bgB) > BG_DIST) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
      rowInfo.push(left <= right
        ? { left, right, width: right - left + 1 }
        : { left: 0, right: 0, width: 0 });
    }

    /* ── 3. Find the board band (tallest continuous run of wide rows) ── */
    const widths = rowInfo.map(r => r.width).filter(v => v > 0);
    if (!widths.length) throw new Error('No content detected');
    widths.sort((a, b) => a - b);
    const wRef = widths[Math.floor(widths.length * 0.9)];
    const wMin = wRef * 0.7;

    let bestBand = null, bandY = -1;
    for (let y = 0; y <= h; y++) {
      const wide = y < h && rowInfo[y].width >= wMin;
      if (wide && bandY < 0) bandY = y;
      if (!wide && bandY >= 0) {
        const len = y - bandY;
        if (!bestBand || len > bestBand.len) bestBand = { top: bandY, bot: y, len };
        bandY = -1;
      }
    }
    if (!bestBand || bestBand.len < h * 0.08) throw new Error('Board band too small');

    let sL = 0, sR = 0, nR = 0;
    for (let y = bestBand.top; y < bestBand.bot; y++) {
      if (rowInfo[y].width >= wMin) { sL += rowInfo[y].left; sR += rowInfo[y].right; nR++; }
    }
    let bL = Math.round(sL / nR), bR = Math.round(sR / nR);
    let bT = bestBand.top, bB = bestBand.bot;

    /* ── 4. Crop to square ── */
    let bW = bR - bL, bH = bB - bT;
    const side = Math.min(bW, bH);
    // Centre horizontally
    const midX = (bL + bR) / 2;
    bL = Math.round(midX - side / 2);
    bR = bL + side;
    // If band is taller than wide, pick the vertical slice with the most content
    if (bH > side * 1.05) {
      let bestScore = -1, bestTop = bT;
      const step = Math.max(1, Math.round((bH - side) / 20));
      for (let t = bT; t + side <= bB; t += step) {
        let score = 0;
        for (let sy = t; sy < t + side; sy += Math.max(1, Math.round(side / 16))) {
          for (let sx = bL; sx < bR; sx += Math.max(1, Math.round(side / 16))) {
            const [r, g, b] = px(sx, sy);
            if (luma(r, g, b) > 70) score++;
          }
        }
        if (score > bestScore) { bestScore = score; bestTop = t; }
      }
      bT = bestTop;
      bB = bT + side;
    } else {
      const midY = (bT + bB) / 2;
      bT = Math.round(midY - side / 2);
      bB = bT + side;
    }

    /* ── 5. Detect grid gaps for precise cell alignment ── */
    function buildProfile(isCol) {
      const profile = new Float64Array(side);
      const sampleN = Math.min(side, 120);
      for (let i = 0; i < side; i++) {
        let sum = 0;
        for (let j = 0; j < sampleN; j++) {
          const jPos = Math.round(j * side / sampleN);
          const [r, g, b] = isCol ? px(bL + i, bT + jPos) : px(bL + jPos, bT + i);
          sum += luma(r, g, b);
        }
        profile[i] = sum / sampleN;
      }
      return profile;
    }

    function findCellCenters(profile) {
      const n = profile.length;
      // Smooth with kernel=3
      const sm = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0, c = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { s += profile[j]; c++; }
        sm[i] = s / c;
      }
      // Find local minima
      const minima = [];
      for (let i = 3; i < n - 3; i++) {
        if (sm[i] <= sm[i - 1] && sm[i] <= sm[i + 1] && sm[i] < sm[i - 2] && sm[i] < sm[i + 2]) {
          minima.push(i);
        }
      }
      if (minima.length < 5) return null;

      // Select best 7 roughly-evenly-spaced minima
      const expectedSpacing = n / 8;
      let bestGaps = null, bestErr = Infinity;
      for (let s = 0; s <= minima.length - 7; s++) {
        const gaps = minima.slice(s, s + 7);
        const spans = [gaps[0]];
        for (let i = 1; i < 7; i++) spans.push(gaps[i] - gaps[i - 1]);
        spans.push(n - gaps[6]);
        const err = spans.reduce((sum, sp) => sum + Math.abs(sp - expectedSpacing), 0);
        if (err < bestErr) { bestErr = err; bestGaps = gaps; }
      }
      if (!bestGaps || bestErr > n * 0.5) return null;

      const boundaries = [0, ...bestGaps, n];
      return Array.from({ length: 8 }, (_, i) => (boundaries[i] + boundaries[i + 1]) / 2);
    }

    const colCenters = findCellCenters(buildProfile(true));
    const rowCenters = findCellCenters(buildProfile(false));

    /* ── 6. Sample each cell ── */
    const cellSize = side / BOARD_SIZE;
    const sampleRadius = Math.max(1, Math.round(cellSize * 0.15));
    const board = createEmptyBoard();

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cx = bL + (colCenters ? colCenters[c] : (c + 0.5) * cellSize);
        const cy = bT + (rowCenters ? rowCenters[r] : (r + 0.5) * cellSize);

        let tR = 0, tG = 0, tB = 0, cnt = 0;
        for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
          for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
            const [pr, pg, pb] = px(cx + dx, cy + dy);
            tR += pr; tG += pg; tB += pb; cnt++;
          }
        }
        board[r][c] = matchColor(Math.round(tR / cnt), Math.round(tG / cnt), Math.round(tB / cnt));
      }
    }

    return board;
  }

  function showDetectedPreview(board) {
    dom.detectedPreview.classList.remove('hidden');
    dom.previewBoard.innerHTML = '';

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'preview-cell';
        const val = board[r][c];
        if (val >= 0) {
          cell.classList.add('filled');
          cell.style.background = COLORS[val].bg;
        }
        dom.previewBoard.appendChild(cell);
      }
    }
  }

  function applyDetectedBoard() {
    if (!detectedBoard) return;
    editorBoard = detectedBoard.map(row => [...row]);

    // Switch to manual mode for any touch-ups
    currentMode = 'manual';
    dom.modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === 'manual'));
    dom.manualMode.classList.remove('hidden');
    dom.screenshotMode.classList.add('hidden');
    renderEditorBoard();
    updateStartBtn();
  }

  function resetScreenshotMode() {
    dom.uploadZone.style.display = '';
    dom.uploadPlaceholder.classList.remove('hidden');
    dom.analysisStatus.classList.add('hidden');
    dom.detectedPreview.classList.add('hidden');
    dom.ssInput.value = '';
    detectedBoard = null;
    uploadedImg = null;
  }

  function matchColor(r, g, b) {
    // Brightness check — dark cells are empty
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    if (brightness < 65) return -1;

    // Match against known colors
    const targetColors = [
      { r: 255, g: 107, b: 107 }, // red
      { r: 255, g: 169, b: 77 },  // orange
      { r: 255, g: 224, b: 102 }, // yellow
      { r: 81,  g: 207, b: 102 }, // green
      { r: 102, g: 217, b: 232 }, // cyan
      { r: 116, g: 185, b: 255 }, // blue
      { r: 177, g: 151, b: 252 }, // purple
      { r: 247, g: 131, b: 172 }, // pink
    ];

    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < targetColors.length; i++) {
      const t = targetColors[i];
      const dist = Math.sqrt((r - t.r) ** 2 + (g - t.g) ** 2 + (b - t.b) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    return bestDist < 120 ? bestIdx : -1;
  }

  // ══════════════════════════════════════════
  //  START BUTTON VALIDATION
  // ══════════════════════════════════════════

  function updateStartBtn() {
    const hasCandidate = editorCandidates.some(c =>
      c && c.cells && c.cells.some(row => row.some(v => v))
    );
    dom.startBtn.disabled = !hasCandidate;
  }

  // ══════════════════════════════════════════
  //  TRANSITION TO PLAY
  // ══════════════════════════════════════════

  function startPlay() {
    // Build candidates from editor
    candidates = editorCandidates.map(c => {
      if (!c) return null;
      const shape = [];
      for (let r = 0; r < c.cells.length; r++) {
        for (let col = 0; col < c.cells[r].length; col++) {
          if (c.cells[r][col]) shape.push([r, col]);
        }
      }
      if (shape.length === 0) return null;
      // Normalize: shift so min row/col = 0
      const minR = Math.min(...shape.map(s => s[0]));
      const minC = Math.min(...shape.map(s => s[1]));
      const normalized = shape.map(([sr, sc]) => [sr - minR, sc - minC]);
      return { shape: normalized, colorIdx: c.colorIdx };
    });

    // Deep copy board
    playBoard = editorBoard.map(row => [...row]);
    initialBoard = editorBoard.map(row => [...row]);
    usedCandidates = [false, false, false];
    stepRecords = [];
    isGameOver = false;

    // Switch phases
    dom.setupPhase.classList.add('hidden');
    dom.playPhase.classList.remove('hidden');
    dom.boardWrapper.classList.remove('game-over');
    dom.resetCenterBtn.classList.add('hidden');

    buildPlayBoard();
    renderPlayBoard();
    renderPlayCandidates();
  }

  dom.startBtn.addEventListener('click', startPlay);

  // ══════════════════════════════════════════
  //  PLAY BOARD
  // ══════════════════════════════════════════

  function buildPlayBoard() {
    dom.board.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        dom.board.appendChild(cell);
      }
    }
  }

  function renderPlayBoard() {
    const cells = dom.board.querySelectorAll('.cell');
    cells.forEach(cell => {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      const val = playBoard[r][c];
      cell.classList.remove('preview-valid', 'preview-invalid', 'clearing');
      if (val >= 0) {
        cell.classList.add('filled');
        cell.style.background = COLORS[val].bg;
      } else {
        cell.classList.remove('filled');
        cell.style.background = '';
      }
    });
  }

  // ══════════════════════════════════════════
  //  PLAY CANDIDATES
  // ══════════════════════════════════════════

  function renderPlayCandidates() {
    dom.candidatesEl.innerHTML = '';
    candidates.forEach((cand, idx) => {
      if (!cand) {
        const empty = document.createElement('div');
        empty.className = 'candidate used';
        empty.style.width = '60px';
        empty.style.height = '60px';
        dom.candidatesEl.appendChild(empty);
        return;
      }

      const rows = Math.max(...cand.shape.map(s => s[0])) + 1;
      const cols = Math.max(...cand.shape.map(s => s[1])) + 1;
      const el = document.createElement('div');
      el.className = 'candidate' + (usedCandidates[idx] ? ' used' : '');
      el.style.gridTemplateColumns = `repeat(${cols}, 28px)`;
      el.style.gridTemplateRows = `repeat(${rows}, 28px)`;
      el.dataset.idx = idx;
      el.dataset.cols = cols;
      el.dataset.rows = rows;

      const filledSet = new Set(cand.shape.map(s => `${s[0]},${s[1]}`));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const mc = document.createElement('div');
          mc.className = 'mini-cell';
          if (filledSet.has(`${r},${c}`)) {
            mc.style.background = COLORS[cand.colorIdx].bg;
          } else {
            mc.classList.add('empty');
          }
          el.appendChild(mc);
        }
      }

      if (!usedCandidates[idx]) {
        el.addEventListener('pointerdown', e => startDrag(e, idx));
      }

      dom.candidatesEl.appendChild(el);
    });
  }

  // ══════════════════════════════════════════
  //  DRAG & DROP
  // ══════════════════════════════════════════

  function startDrag(e, candidateIdx) {
    if (isGameOver || usedCandidates[candidateIdx]) return;
    e.preventDefault();

    const cand = candidates[candidateIdx];
    if (!cand) return;

    // Create ghost
    const rows = Math.max(...cand.shape.map(s => s[0])) + 1;
    const cols = Math.max(...cand.shape.map(s => s[1])) + 1;
    // Anchor at shape center so cursor aligns with visual center
    const anchorR = Math.floor((rows - 1) / 2);
    const anchorC = Math.floor((cols - 1) / 2);
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.gridTemplateColumns = `repeat(${cols}, 28px)`;
    ghost.style.gridTemplateRows = `repeat(${rows}, 28px)`;

    const filledSet = new Set(cand.shape.map(s => `${s[0]},${s[1]}`));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mc = document.createElement('div');
        mc.className = 'mini-cell';
        if (filledSet.has(`${r},${c}`)) {
          mc.style.background = COLORS[cand.colorIdx].bg;
        } else {
          mc.style.background = 'transparent';
          mc.style.boxShadow = 'none';
        }
        ghost.appendChild(mc);
      }
    }

    document.body.appendChild(ghost);

    const halfW = (cols * 30) / 2;
    const halfH = (rows * 30) / 2;
    const moveGhost = (cx, cy) => {
      ghost.style.left = cx + 'px';
      ghost.style.top = (cy - 60) + 'px';
    };
    moveGhost(e.clientX, e.clientY);

    dragData = { candidateIdx, ghost, halfW, halfH, anchorR, anchorC };

    // Mark candidate
    const candEl = dom.candidatesEl.children[candidateIdx];
    if (candEl) candEl.style.opacity = '0.3';

    const onMove = ev => {
      ev.preventDefault();
      const cx = ev.clientX || (ev.touches && ev.touches[0].clientX);
      const cy = ev.clientY || (ev.touches && ev.touches[0].clientY);
      moveGhost(cx, cy);
      showPreview(cx, cy - 60);
    };

    const onUp = ev => {
      ev.preventDefault();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      ghost.remove();

      if (candEl) candEl.style.opacity = '';

      const cx = ev.clientX || (ev.changedTouches && ev.changedTouches[0].clientX);
      const cy = ev.clientY || (ev.changedTouches && ev.changedTouches[0].clientY);
      const pos = getBoardPos(cx, cy - 60);

      clearPreview();

      if (pos) {
        const placeR = pos.r - (dragData.anchorR || 0);
        const placeC = pos.c - (dragData.anchorC || 0);
        if (canPlace(playBoard, cand.shape, placeR, placeC)) {
          placePiece(candidateIdx, placeR, placeC);
        }
      }

      dragData = null;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function getBoardPos(cx, cy) {
    const boardRect = dom.board.getBoundingClientRect();
    const relX = cx - boardRect.left;
    const relY = cy - boardRect.top;
    const cellSize = boardRect.width / BOARD_SIZE;
    const col = Math.floor(relX / cellSize);
    const row = Math.floor(relY / cellSize);
    // Relaxed bounds: allow cursor slightly outside board for anchor-offset placements
    if (row < -3 || row >= BOARD_SIZE + 3 || col < -3 || col >= BOARD_SIZE + 3) return null;
    return { r: row, c: col };
  }

  function showPreview(cx, cy) {
    clearPreview();
    if (!dragData) return;
    const pos = getBoardPos(cx, cy);
    if (!pos) return;

    const cand = candidates[dragData.candidateIdx];
    const placeR = pos.r - (dragData.anchorR || 0);
    const placeC = pos.c - (dragData.anchorC || 0);
    const valid = canPlace(playBoard, cand.shape, placeR, placeC);

    cand.shape.forEach(([dr, dc]) => {
      const r = placeR + dr, c = placeC + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const cell = dom.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if (cell) cell.classList.add(valid ? 'preview-valid' : 'preview-invalid');
      }
    });
  }

  function clearPreview() {
    dom.board.querySelectorAll('.preview-valid, .preview-invalid').forEach(c => {
      c.classList.remove('preview-valid', 'preview-invalid');
    });
  }

  // ══════════════════════════════════════════
  //  BOARD LOGIC
  // ══════════════════════════════════════════

  function canPlace(board, shape, r, c) {
    return shape.every(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] < 0;
    });
  }

  function placePiece(candidateIdx, row, col) {
    const cand = candidates[candidateIdx];
    const boardBefore = playBoard.map(r => [...r]);

    // Place
    cand.shape.forEach(([dr, dc]) => {
      playBoard[row + dr][col + dc] = cand.colorIdx;
    });

    // Check lines
    const cleared = clearLines();

    const boardAfter = playBoard.map(r => [...r]);

    // Record step
    stepRecords.push({
      candidateIdx,
      row,
      col,
      boardBefore,
      boardAfter,
      cleared,
      shape: cand.shape,
      colorIdx: cand.colorIdx,
    });

    usedCandidates[candidateIdx] = true;
    renderPlayBoard();
    renderPlayCandidates();

    // Check all placed
    if (usedCandidates.every(u => u)) {
      // Success! Show replay
      setTimeout(() => showReplayLightbox(), 300);
      return;
    }

    // Check game over
    if (checkGameOver()) {
      isGameOver = true;
      dom.boardWrapper.classList.add('game-over');
      dom.resetCenterBtn.classList.remove('hidden');
    }
  }

  function clearLines() {
    const toClear = new Set();

    // Check rows
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (playBoard[r].every(v => v >= 0)) {
        for (let c = 0; c < BOARD_SIZE; c++) toClear.add(`${r},${c}`);
      }
    }

    // Check columns
    for (let c = 0; c < BOARD_SIZE; c++) {
      let full = true;
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (playBoard[r][c] < 0) { full = false; break; }
      }
      if (full) {
        for (let r = 0; r < BOARD_SIZE; r++) toClear.add(`${r},${c}`);
      }
    }

    if (toClear.size > 0) {
      // Flash animation
      toClear.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        const cell = dom.board.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
        if (cell) cell.classList.add('clearing');
      });

      // Clear board data immediately so game-over check sees correct state
      toClear.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        playBoard[r][c] = -1;
      });

      // Re-render after animation completes
      setTimeout(() => {
        renderPlayBoard();
      }, 350);
    }

    return toClear.size;
  }

  function checkGameOver() {
    for (let i = 0; i < candidates.length; i++) {
      if (usedCandidates[i] || !candidates[i]) continue;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (canPlace(playBoard, candidates[i].shape, r, c)) return false;
        }
      }
    }
    return true;
  }

  // ══════════════════════════════════════════
  //  PLAY CONTROLS
  // ══════════════════════════════════════════

  function bindPlayControls() {
    dom.resetCenterBtn.addEventListener('click', resetBoard);
    dom.resetBtn.addEventListener('click', resetBoard);
    dom.backSetupBtn.addEventListener('click', backToSetup);
    dom.solveBtn.addEventListener('click', solvePuzzle);
  }

  function resetBoard() {
    playBoard = initialBoard.map(r => [...r]);
    usedCandidates = [false, false, false];
    stepRecords = [];
    isGameOver = false;
    dom.boardWrapper.classList.remove('game-over');
    dom.resetCenterBtn.classList.add('hidden');
    renderPlayBoard();
    renderPlayCandidates();
  }

  function backToSetup() {
    dom.playPhase.classList.add('hidden');
    dom.setupPhase.classList.remove('hidden');
  }

  // ══════════════════════════════════════════
  //  REPLAY LIGHTBOX
  // ══════════════════════════════════════════

  function bindLightboxes() {
    dom.replayCloseBtn.addEventListener('click', () => {
      dom.replayLightbox.classList.add('hidden');
      // Reset for another attempt
      resetBoard();
    });
    dom.solverCloseBtn.addEventListener('click', () => {
      dom.solverLightbox.classList.add('hidden');
    });
    dom.solverApplyBtn.addEventListener('click', applySolverResult);
  }

  function showReplayLightbox() {
    dom.replaySteps.innerHTML = '';

    stepRecords.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'replay-step';

      const header = document.createElement('div');
      header.className = 'replay-step-header';
      header.textContent = `步驟 ${i + 1}：方塊 ${step.candidateIdx + 1}`;

      const info = document.createElement('div');
      info.className = 'replay-step-info';
      info.textContent = `放置於 (${step.row}, ${step.col})` + (step.cleared > 0 ? `  — 消除 ${step.cleared} 格` : '');

      const miniBoard = renderMiniBoard(step.boardAfter, step.shape, step.row, step.col);

      div.appendChild(header);
      div.appendChild(info);
      div.appendChild(miniBoard);
      dom.replaySteps.appendChild(div);
    });

    dom.replayLightbox.classList.remove('hidden');
  }

  function renderMiniBoard(board, shape, placeRow, placeCol) {
    const grid = document.createElement('div');
    grid.className = 'replay-mini-board';

    const placedSet = shape ? new Set(shape.map(([dr, dc]) => `${placeRow + dr},${placeCol + dc}`)) : new Set();

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'mini-board-cell';
        const val = board[r][c];
        if (val >= 0) {
          cell.classList.add('filled');
          cell.style.background = COLORS[val].bg;
        }
        if (placedSet.has(`${r},${c}`)) {
          cell.classList.add('just-placed');
        }
        grid.appendChild(cell);
      }
    }
    return grid;
  }

  // ══════════════════════════════════════════
  //  SOLVER
  // ══════════════════════════════════════════

  let solverResult = null;

  function solvePuzzle() {
    dom.solvingOverlay.classList.remove('hidden');

    // Use setTimeout to allow UI update
    setTimeout(() => {
      const activeCandidates = [];
      for (let i = 0; i < 3; i++) {
        if (!usedCandidates[i] && candidates[i]) {
          activeCandidates.push({ idx: i, ...candidates[i] });
        }
      }

      solverResult = solve(playBoard, activeCandidates);
      dom.solvingOverlay.classList.add('hidden');

      if (solverResult) {
        showSolverLightbox(solverResult);
      } else {
        showSolverNoResult();
      }
    }, 50);
  }

  function solve(board, activeCandidates) {
    const perms = permutations(activeCandidates);
    let bestResult = null;
    let bestScore = -1;

    for (const perm of perms) {
      const result = tryPlaceSequenceDFS(board, perm, 0, [], 0);
      if (result && result.totalCleared > bestScore) {
        bestScore = result.totalCleared;
        bestResult = result;
      }
    }
    return bestResult;
  }

  /**
   * Backtracking DFS: try every valid position for each candidate.
   * Returns the best { steps, totalCleared } found, or null if impossible.
   */
  function tryPlaceSequenceDFS(board, sequence, idx, stepsSoFar, clearedSoFar) {
    if (idx >= sequence.length) {
      return { steps: stepsSoFar, totalCleared: clearedSoFar };
    }

    const cand = sequence[idx];
    let bestResult = null;
    let bestScore = -1;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!canPlace(board, cand.shape, r, c)) continue;

        // Place piece on a copy
        const testBoard = board.map(row => [...row]);
        cand.shape.forEach(([dr, dc]) => {
          testBoard[r + dr][c + dc] = cand.colorIdx;
        });

        const clearedCount = countClears(testBoard);
        const boardAfterPlace = testBoard.map(row => [...row]); // snapshot before clear
        applyClears(testBoard);

        const step = {
          candidateIdx: cand.idx,
          row: r,
          col: c,
          shape: cand.shape,
          colorIdx: cand.colorIdx,
          boardAfter: testBoard.map(row => [...row]),
          cleared: clearedCount,
        };

        // Recurse for remaining candidates
        const sub = tryPlaceSequenceDFS(
          testBoard, sequence, idx + 1,
          [...stepsSoFar, step],
          clearedSoFar + clearedCount
        );

        if (sub) {
          const score = sub.totalCleared;
          if (score > bestScore) {
            bestScore = score;
            bestResult = sub;
          }
        }
      }
    }

    return bestResult;
  }

  function countClears(board) {
    let count = 0;
    const toClear = new Set();

    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r].every(v => v >= 0)) {
        for (let c = 0; c < BOARD_SIZE; c++) toClear.add(`${r},${c}`);
      }
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      let full = true;
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (board[r][c] < 0) { full = false; break; }
      }
      if (full) {
        for (let r = 0; r < BOARD_SIZE; r++) toClear.add(`${r},${c}`);
      }
    }
    return toClear.size;
  }

  function applyClears(board) {
    const toClear = new Set();
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r].every(v => v >= 0)) {
        for (let c = 0; c < BOARD_SIZE; c++) toClear.add(`${r},${c}`);
      }
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      let full = true;
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (board[r][c] < 0) { full = false; break; }
      }
      if (full) {
        for (let r = 0; r < BOARD_SIZE; r++) toClear.add(`${r},${c}`);
      }
    }
    toClear.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      board[r][c] = -1;
    });
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of permutations(rest)) {
        result.push([arr[i], ...perm]);
      }
    }
    return result;
  }

  function showSolverLightbox(result) {
    dom.solverResult.innerHTML = '';

    result.steps.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'replay-step';

      const header = document.createElement('div');
      header.className = 'replay-step-header';
      header.textContent = `步驟 ${i + 1}：方塊 ${step.candidateIdx + 1}`;

      const info = document.createElement('div');
      info.className = 'replay-step-info';
      info.textContent = `放置於 (${step.row}, ${step.col})` + (step.cleared > 0 ? `  — 消除 ${step.cleared} 格` : '');

      const miniBoard = renderMiniBoard(step.boardAfter, step.shape, step.row, step.col);

      div.appendChild(header);
      div.appendChild(info);
      div.appendChild(miniBoard);
      dom.solverResult.appendChild(div);
    });

    dom.solverLightbox.classList.remove('hidden');
  }

  function showSolverNoResult() {
    dom.solverResult.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">找不到可行的放置方案 😢</p>';
    dom.solverApplyBtn.classList.add('hidden');
    dom.solverLightbox.classList.remove('hidden');
  }

  function applySolverResult() {
    if (!solverResult) return;
    dom.solverLightbox.classList.add('hidden');

    // Reset first
    resetBoard();

    // Apply steps with animation
    let i = 0;
    function applyNext() {
      if (i >= solverResult.steps.length) {
        // All placed — show replay
        setTimeout(() => showReplayLightbox(), 300);
        return;
      }
      const step = solverResult.steps[i];
      placePiece(step.candidateIdx, step.row, step.col);
      i++;
      setTimeout(applyNext, 500);
    }
    setTimeout(applyNext, 200);
  }

  // ══════════════════════════════════════════
  //  UTILS
  // ══════════════════════════════════════════

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ── Boot ──
  init();

})();
