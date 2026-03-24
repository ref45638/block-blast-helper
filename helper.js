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
  let detectedCandidates = null;     // [{cells, colorIdx}] from auto-detection

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
        const result = autoDetectBoard(img);
        detectedBoard = result.board;

        // Try to detect candidates below the board
        try {
          detectedCandidates = autoDetectCandidates(result.region);
        } catch (candErr) {
          console.warn('Candidate detection failed:', candErr);
          detectedCandidates = null;
        }

        dom.analysisStatus.classList.add('hidden');
        showDetectedPreview(result.board, detectedCandidates);
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
   * Strategy (position-first approach):
   *  1. Find board region via background detection + band analysis
   *  2. Divide into 8×8 grid, extract each cell's centre pixel patch
   *  3. Use Otsu's method on brightness to classify empty vs filled
   *  4. Assign nearest colour to filled cells (best-effort)
   */
  function autoDetectBoard(img) {
    const canvas = document.createElement('canvas');
    const maxW = 800;
    const scale = Math.min(maxW / img.width, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    const pxData = imgData.data;

    function px(x, y) {
      x = clamp(Math.round(x), 0, w - 1);
      y = clamp(Math.round(y), 0, h - 1);
      const i = (y * w + x) * 4;
      return [pxData[i], pxData[i + 1], pxData[i + 2]];
    }
    function lumaVal(r, g, b) { return r * 0.299 + g * 0.587 + b * 0.114; }
    function cDist(r1, g1, b1, r2, g2, b2) {
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
        if (cDist(r, g, b, bgR, bgG, bgB) > BG_DIST) {
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
    const midX = (bL + bR) / 2;
    bL = Math.round(midX - side / 2);
    bR = bL + side;
    if (bH > side * 1.05) {
      let bestScore = -1, bestTop = bT;
      const step = Math.max(1, Math.round((bH - side) / 20));
      for (let t = bT; t + side <= bB; t += step) {
        let score = 0;
        for (let sy = t; sy < t + side; sy += Math.max(1, Math.round(side / 16))) {
          for (let sx = bL; sx < bR; sx += Math.max(1, Math.round(side / 16))) {
            const [r, g, b] = px(sx, sy);
            if (lumaVal(r, g, b) > 70) score++;
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

    /* ── 5. Shrink inward to exclude board border ── */
    const borderPad = Math.round(side * 0.02);
    bL += borderPad; bR -= borderPad; bT += borderPad; bB -= borderPad;
    const innerSide = bR - bL;

    /* ── 6. Extract 64 cell pixel arrays (raw pixels, no averaging) ── */
    const cellSize = innerSide / BOARD_SIZE;
    const cellInset = cellSize * 0.25; // skip 25% per edge to avoid grid lines
    const cells64 = []; // [{row, col, pixels: [[r,g,b], ...]}]

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const x0 = bL + c * cellSize + cellInset;
        const x1 = bL + (c + 1) * cellSize - cellInset;
        const y0 = bT + r * cellSize + cellInset;
        const y1 = bT + (r + 1) * cellSize - cellInset;

        const pixels = [];
        const sampStep = Math.max(1, Math.round((x1 - x0) / 5));
        for (let sy = Math.round(y0); sy <= Math.round(y1); sy += sampStep) {
          for (let sx = Math.round(x0); sx <= Math.round(x1); sx += sampStep) {
            pixels.push(px(sx, sy));
          }
        }
        cells64.push({ row: r, col: c, pixels });
      }
    }

    /* ── 7. Find the "empty cell" reference ──
     * The darkest cell is almost certainly empty. Collect its raw pixels
     * as the reference template. Then also gather a few of the darkest
     * cells to form a robust empty-pixel pool.
     */
    // Compute median luma per cell (median is robust to outlier pixels)
    for (const cell of cells64) {
      const lumas = cell.pixels.map(([r, g, b]) => lumaVal(r, g, b));
      lumas.sort((a, b) => a - b);
      cell.medianLuma = lumas[lumas.length >> 1];
    }

    // Sort by median luma to find darkest cells
    const byLuma = [...cells64].sort((a, b) => a.medianLuma - b.medianLuma);

    // Use the darkest ~25% of cells (at least 8) as "empty" reference pool
    const emptyPoolSize = Math.max(8, Math.round(cells64.length * 0.25));
    const emptyPool = byLuma.slice(0, emptyPoolSize);

    // Build the average empty-pixel colour from the pool
    let eR = 0, eG = 0, eB = 0, eCnt = 0;
    for (const cell of emptyPool) {
      for (const [r, g, b] of cell.pixels) {
        eR += r; eG += g; eB += b; eCnt++;
      }
    }
    eCnt = Math.max(eCnt, 1);
    const emptyRefR = eR / eCnt, emptyRefG = eG / eCnt, emptyRefB = eB / eCnt;

    /* ── 8. Compare each cell's pixels against empty reference ──
     * For each cell, compute the average colour distance of its pixels
     * from the empty reference colour. A filled cell's pixels will be
     * very different from the dark empty colour — even dark reds.
     */
    const cellDists = cells64.map(cell => {
      let totalDist = 0;
      for (const [r, g, b] of cell.pixels) {
        totalDist += cDist(r, g, b, emptyRefR, emptyRefG, emptyRefB);
      }
      return { ...cell, avgDist: totalDist / cell.pixels.length };
    });

    // Use Otsu on the distance values to find the best threshold
    const distValues = cellDists.map(c => c.avgDist).sort((a, b) => a - b);
    const n = distValues.length;
    let bestVariance = 0, distThresh = distValues[n >> 1];
    const sumAll = distValues.reduce((s, v) => s + v, 0);
    let w1 = 0, sum1 = 0;
    for (let i = 0; i < n - 1; i++) {
      w1++;
      sum1 += distValues[i];
      const w2 = n - w1;
      const m1 = sum1 / w1;
      const m2 = (sumAll - sum1) / w2;
      const variance = w1 * w2 * (m1 - m2) ** 2;
      if (variance > bestVariance) {
        bestVariance = variance;
        distThresh = (distValues[i] + distValues[i + 1]) / 2;
      }
    }

    /* ── 9. Build board: filled if pixel distance from empty > threshold ── */
    const board = createEmptyBoard();
    for (const cell of cellDists) {
      if (cell.avgDist > distThresh) {
        // Filled — find dominant colour from pixel median
        const rs = cell.pixels.map(p => p[0]).sort((a, b) => a - b);
        const gs = cell.pixels.map(p => p[1]).sort((a, b) => a - b);
        const bs = cell.pixels.map(p => p[2]).sort((a, b) => a - b);
        const mr = rs[rs.length >> 1], mg = gs[gs.length >> 1], mb = bs[bs.length >> 1];
        board[cell.row][cell.col] = matchColor(mr, mg, mb);
      }
    }

    return { board, region: { left: bL, top: bT, right: bR, bottom: bB, side: innerSide, canvas, pxData: imgData.data, w, h } };
  }

  // ══════════════════════════════════════════
  //  AUTO-DETECT CANDIDATES (below the board)
  // ══════════════════════════════════════════

  function autoDetectCandidates(region) {
    const { left: bL, top: bT, right: bR, bottom: bB, side, canvas, pxData, w, h } = region;

    const boardWidth = bR - bL;
    const boardHeight = bB - bT;
    const cellSize = side / 8;   // side is the FULL board side; divide by 8 for per-cell size

    console.log('[CandDetect] region:', { bL, bT, bR, bB, side, w, h, boardWidth, boardHeight, cellSize });

    // Helper: get pixel at (x,y)
    function px(x, y) {
      x = clamp(Math.round(x), 0, w - 1);
      y = clamp(Math.round(y), 0, h - 1);
      const i = (y * w + x) * 4;
      return [pxData[i], pxData[i + 1], pxData[i + 2]];
    }
    function brightness(rgb) { return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114; }
    function colorDist(a, b) { return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2); }

    /* ── 1. Define search area below the board ── */
    const searchTop = Math.round(bB + cellSize * 0.3);
    const searchBottom = Math.min(h - 5, Math.round(bB + boardHeight * 1.5));
    console.log('[CandDetect] search range:', { searchTop, searchBottom, rangeH: searchBottom - searchTop });
    if (searchTop >= searchBottom || searchBottom - searchTop < cellSize) {
      console.log('[CandDetect] BAIL: search range too small');
      return null;
    }

    /* ── 2. Get background colour from areas certain to be background ── */
    // Use the gap strip right below the board (first few rows below bB)
    const bgSamples = [];
    // Sample from image edges far from centre (almost certainly bg)
    for (let y = searchTop; y < searchBottom; y += Math.max(1, Math.round((searchBottom - searchTop) / 30))) {
      for (let dx = 0; dx < 8; dx++) {
        bgSamples.push(px(dx + 1, y));
        bgSamples.push(px(w - 2 - dx, y));
      }
    }
    // Also sample the narrow gap between board bottom and candidate area
    for (let x = bL; x < bR; x += 3) {
      bgSamples.push(px(x, bB + 2));
      bgSamples.push(px(x, bB + 5));
    }
    bgSamples.sort((a, b) => brightness(a) - brightness(b));
    const bgColor = bgSamples[bgSamples.length >> 1];
    console.log('[CandDetect] bgColor:', bgColor, 'brightness:', brightness(bgColor));

    /* ── 3. Row scan: use LOCAL variance within a sliding window ── */
    // For each row, instead of comparing to bg, compute the variance of
    // brightness across the row. Rows that cross block edges will have
    // higher variance than pure background rows.
    const scanLeft = Math.round(Math.max(0, bL - cellSize * 0.5));
    const scanRight = Math.round(Math.min(w - 1, bR + cellSize * 0.5));

    const rowScores = [];
    for (let y = searchTop; y < searchBottom; y++) {
      // Collect brightness values and colour distances along this row
      const brs = [];
      const dists = [];
      for (let x = scanLeft; x <= scanRight; x += 2) {
        const p = px(x, y);
        brs.push(brightness(p));
        dists.push(colorDist(p, bgColor));
      }

      // Gradient score: count significant brightness jumps
      let jumps = 0;
      for (let i = 1; i < brs.length; i++) {
        if (Math.abs(brs[i] - brs[i-1]) > 12) jumps++;
      }
      const jumpRatio = brs.length > 1 ? jumps / (brs.length - 1) : 0;

      // Colour distance score: fraction of pixels noticeably different from bg
      const distCount = dists.filter(d => d > 20).length;
      const distRatio = dists.length > 0 ? distCount / dists.length : 0;

      // Variance score
      const meanBr = brs.reduce((a,b) => a+b, 0) / brs.length;
      const variance = brs.reduce((s,b) => s + (b-meanBr)**2, 0) / brs.length;
      const varScore = Math.min(1, variance / 500);

      // Combined score
      const score = Math.max(jumpRatio, distRatio * 0.5, varScore);
      rowScores.push({ y, score, jumpRatio, distRatio, varScore });
    }

    const maxScore = Math.max(...rowScores.map(r => r.score));
    console.log('[CandDetect] maxRowScore:', maxScore.toFixed(4),
      'sample scores:', rowScores.filter((_,i) => i % 30 === 0).map(r => `y${r.y}:${r.score.toFixed(3)}`).join(' '));

    if (maxScore < 0.02) {
      console.log('[CandDetect] BAIL: maxRowScore too low');
      return null;
    }

    // Adaptive threshold: find bands where activity is significantly above background level
    // Calculate background noise level (bottom 25% of scores)
    const sortedScores = rowScores.map(r => r.score).sort((a,b) => a - b);
    const noiseLevel = sortedScores[Math.floor(sortedScores.length * 0.25)];
    const rowThresh = Math.max(0.02, noiseLevel + (maxScore - noiseLevel) * 0.15);
    console.log('[CandDetect] noiseLevel:', noiseLevel.toFixed(4), 'rowThresh:', rowThresh.toFixed(4));

    // Find continuous bands of activity
    const bands = [];
    let curBand = null;
    let gapRows = 0;
    const maxRowGap = Math.round(cellSize * 0.3);  // allow small gaps in activity

    for (const rs of rowScores) {
      if (rs.score > rowThresh) {
        if (!curBand) curBand = { top: rs.y, bottom: rs.y, maxScore: rs.score, totalScore: rs.score };
        else {
          curBand.bottom = rs.y;
          curBand.maxScore = Math.max(curBand.maxScore, rs.score);
          curBand.totalScore += rs.score;
        }
        gapRows = 0;
      } else {
        if (curBand) {
          gapRows++;
          if (gapRows > maxRowGap) {
            if (curBand.bottom - curBand.top > cellSize * 0.15) bands.push(curBand);
            curBand = null;
            gapRows = 0;
          }
        }
      }
    }
    if (curBand && curBand.bottom - curBand.top > cellSize * 0.15) bands.push(curBand);

    console.log('[CandDetect] activity bands:', bands.length,
      bands.map(b => ({ top: b.top, bottom: b.bottom, h: b.bottom - b.top, maxScore: b.maxScore.toFixed(3) })));

    if (bands.length === 0) {
      console.log('[CandDetect] BAIL: no activity bands found');
      return null;
    }

    // Filter out any band that is clearly the ad banner (usually at the very bottom and very wide/tall)
    // Also filter bands that are too far from the board (likely UI elements)
    const candBands = bands.filter(b => {
      const distFromBoard = b.top - bB;
      return distFromBoard < boardHeight * 1.0 && (b.bottom - b.top) < boardHeight * 0.8;
    });

    if (candBands.length === 0) {
      console.log('[CandDetect] BAIL: no candidate bands after filtering');
      return null;
    }

    // Pick the band closest to the board (candidates are right below)
    candBands.sort((a, b) => a.top - b.top);
    const mainBand = candBands[0];
    const candTop = mainBand.top;
    const candBottom = mainBand.bottom;
    const candHeight = candBottom - candTop;
    console.log('[CandDetect] main band:', { candTop, candBottom, candHeight });

    /* ── 4. Estimate candidate cell size ── */
    const possibleCellSizes = [
      Math.round(candHeight / 1),
      Math.round(candHeight / 2),
      Math.round(candHeight / 3),
      Math.round(candHeight / 4),
    ].filter(s => s >= 6 && s <= cellSize * 1.5);
    const targetCandSize = cellSize * 0.55;
    possibleCellSizes.sort((a, b) => Math.abs(a - targetCandSize) - Math.abs(b - targetCandSize));
    const candCellSize = possibleCellSizes[0] || Math.round(cellSize * 0.55);
    const candGap = Math.max(1, Math.round(candCellSize * 0.12));
    console.log('[CandDetect] candCellSize:', candCellSize, 'boardCellSize:', cellSize);

    /* ── 5. Column scan: find piece blobs ── */
    // For each x column in the candidate band, compute activity
    const colActivity = [];
    for (let x = scanLeft; x <= scanRight; x++) {
      let activity = 0, total = 0;
      for (let y = candTop; y <= candBottom; y += 2) {
        const p = px(x, y);
        const dist = colorDist(p, bgColor);

        // Check local contrast with nearby pixels
        const pAbove = px(x, y - 3);
        const pBelow = px(x, y + 3);
        const vGrad = Math.abs(brightness(pAbove) - brightness(pBelow));

        const pLeft = px(x - 3, y);
        const pRight = px(x + 3, y);
        const hGrad = Math.abs(brightness(pLeft) - brightness(pRight));

        // A pixel is "active" if it differs from bg OR has local gradient
        if (dist > 15 || vGrad > 12 || hGrad > 12) activity++;
        total++;
      }
      colActivity.push({ x, ratio: total > 0 ? activity / total : 0 });
    }

    // Log column activity for debugging
    console.log('[CandDetect] col activity sample:',
      colActivity.filter((_,i) => i % 10 === 0).map(c => `x${c.x}:${c.ratio.toFixed(2)}`).join(' '));

    // Find background noise level in columns
    const colRatios = colActivity.map(c => c.ratio).sort((a,b) => a - b);
    const colNoise = colRatios[Math.floor(colRatios.length * 0.2)];
    const colThresh = Math.max(0.08, colNoise + (colRatios[colRatios.length - 1] - colNoise) * 0.2);
    console.log('[CandDetect] colNoise:', colNoise.toFixed(3), 'colThresh:', colThresh.toFixed(3));

    // Group active columns into blobs
    const blobs = [];
    let curBlob = null;
    let gapCount = 0;
    const maxColGap = Math.max(3, Math.round(candCellSize * 0.4));

    for (const cs of colActivity) {
      if (cs.ratio > colThresh) {
        if (!curBlob) curBlob = { minX: cs.x, maxX: cs.x, peakRatio: cs.ratio };
        else { curBlob.maxX = cs.x; curBlob.peakRatio = Math.max(curBlob.peakRatio, cs.ratio); }
        gapCount = 0;
      } else {
        if (curBlob) {
          gapCount++;
          if (gapCount > maxColGap) {
            blobs.push(curBlob);
            curBlob = null;
            gapCount = 0;
          }
        }
      }
    }
    if (curBlob) blobs.push(curBlob);

    console.log('[CandDetect] col blobs:', blobs.length,
      blobs.map(b => ({ minX: b.minX, maxX: b.maxX, w: b.maxX - b.minX, peak: b.peakRatio.toFixed(2) })));

    // Filter blobs: must be at least half a cell wide
    const minBlobW = Math.max(4, candCellSize * 0.3);
    const maxBlobW = candCellSize * 8;
    const validBlobs = blobs.filter(b => {
      const bw = b.maxX - b.minX;
      return bw >= minBlobW && bw <= maxBlobW;
    });
    console.log('[CandDetect] validBlobs:', validBlobs.length);

    if (validBlobs.length === 0) {
      console.log('[CandDetect] BAIL: no valid column blobs');
      return null;
    }

    /* ── 6. For each blob, detect shape on a 5×5 grid ── */
    const results = [];

    for (const blob of validBlobs) {
      if (results.length >= 3) break;

      const blobCenterX = (blob.minX + blob.maxX) / 2;
      const blobW = blob.maxX - blob.minX;

      // Determine grid dimensions
      const gridCols = Math.max(1, Math.min(5, Math.round((blobW + candGap) / (candCellSize + candGap))));
      const gridRows = Math.max(1, Math.min(5, Math.round((candHeight + candGap) / (candCellSize + candGap))));

      // Centre the grid within the blob
      const gridW = gridCols * candCellSize + (gridCols - 1) * candGap;
      const gridH = gridRows * candCellSize + (gridRows - 1) * candGap;
      const gridLeft = blobCenterX - gridW / 2;
      const gridTop2 = candTop + (candHeight - gridH) / 2;

      const cells = createEmpty2D(5, 5);
      let matchedColor = -1;
      let filledCount = 0;

      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const cx = gridLeft + c * (candCellSize + candGap) + candCellSize / 2;
          const cy = gridTop2 + r * (candCellSize + candGap) + candCellSize / 2;

          // Sample a small area around the centre
          const sampleRadius = Math.max(2, Math.round(candCellSize * 0.3));
          const pixels = [];
          const sStep = Math.max(1, Math.round(sampleRadius / 3));
          for (let dy = -sampleRadius; dy <= sampleRadius; dy += sStep) {
            for (let dx = -sampleRadius; dx <= sampleRadius; dx += sStep) {
              pixels.push(px(cx + dx, cy + dy));
            }
          }

          // Check if these pixels are different from background
          const dists = pixels.map(p => colorDist(p, bgColor));
          const avgDist = dists.reduce((a, b) => a + b, 0) / dists.length;

          // Also check brightness variance (filled cells have 3D highlights)
          const brs = pixels.map(p => brightness(p));
          const meanBr = brs.reduce((a, b) => a + b, 0) / brs.length;
          const brVariance = brs.reduce((s, b) => s + (b - meanBr) ** 2, 0) / brs.length;

          // A filled cell: either clearly different from bg, or has high internal variance (3D shading)
          const isFilled = avgDist > 25 || (avgDist > 15 && brVariance > 50);

          if (isFilled) {
            cells[r][c] = 1;
            filledCount++;
            // Determine colour from median
            const rs2 = pixels.map(p => p[0]).sort((a, b) => a - b);
            const gs2 = pixels.map(p => p[1]).sort((a, b) => a - b);
            const bs2 = pixels.map(p => p[2]).sort((a, b) => a - b);
            const mr = rs2[rs2.length >> 1], mg = gs2[gs2.length >> 1], mb = bs2[bs2.length >> 1];
            matchedColor = matchColor(mr, mg, mb);
          }
        }
      }

      console.log('[CandDetect] blob result:', { filledCount, matchedColor, gridCols, gridRows, blobW });
      if (filledCount > 0 && matchedColor >= 0) {
        results.push({ cells, colorIdx: matchedColor });
      }
    }

    console.log('[CandDetect] final results:', results.length);
    return results.length > 0 ? results : null;
  }

  // ── Re-render all editor candidate grids with current data ──
  function renderAllEditorCandidates() {
    dom.editorCandidates.forEach((group, idx) => {
      const data = editorCandidates[idx];
      if (!data) return;
      let grid = group.querySelector('.candidate-editor-grid');
      if (!grid) return;
      // Clone grid to remove ALL old event listeners (prevents old/new handler conflicts)
      const freshGrid = grid.cloneNode(false);
      grid.parentNode.replaceChild(freshGrid, grid);
      grid = freshGrid;
      // Rebuild grid to match data dimensions
      const rows = data.cells.length;
      const cols = data.cells[0].length;
      grid.innerHTML = '';
      grid.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
      grid.style.gridTemplateRows = `repeat(${rows}, 22px)`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.className = 'mini-cell';
          cell.dataset.r = r;
          cell.dataset.c = c;
          if (data.cells[r][c]) {
            cell.classList.add('active');
            cell.style.background = COLORS[data.colorIdx].bg;
          }
          grid.appendChild(cell);
        }
      }

      // Re-bind paint events
      let candPainting = false;
      let candPaintOn = false;

      grid.addEventListener('pointerdown', e => {
        const cell = e.target.closest('.mini-cell');
        if (!cell) return;
        e.preventDefault();
        const r = +cell.dataset.r, c = +cell.dataset.c;
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
    });
  }

  function showDetectedPreview(board, cands) {
    dom.detectedPreview.classList.remove('hidden');
    dom.previewBoard.innerHTML = '';

    // Update hint text based on candidate detection
    const hint = dom.detectedPreview.querySelector('.mode-hint');
    if (hint) {
      if (cands && cands.length > 0) {
        hint.textContent = `✅ 偵測到棋盤 + ${cands.length} 個候選方塊！可點「套用到編輯器」修正`;
      } else {
        hint.textContent = '✅ 棋盤偵測完成（未偵測到候選方塊，需手動編輯）';
      }
    }

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

    // Show detected candidates preview
    const previewCands = document.getElementById('preview-candidates');
    if (previewCands) {
      previewCands.innerHTML = '';
      if (cands && cands.length > 0) {
        previewCands.classList.remove('hidden');
        cands.forEach((cand, i) => {
          if (!cand) return;
          const group = document.createElement('div');
          group.className = 'preview-cand-group';

          // Find bounding box of the filled cells
          let minR = cand.cells.length, maxR = 0, minC = cand.cells[0].length, maxC = 0;
          let hasFill = false;
          for (let r = 0; r < cand.cells.length; r++) {
            for (let c = 0; c < cand.cells[r].length; c++) {
              if (cand.cells[r][c]) {
                hasFill = true;
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
                if (c < minC) minC = c;
                if (c > maxC) maxC = c;
              }
            }
          }
          if (!hasFill) return;

          const rows = maxR - minR + 1;
          const cols = maxC - minC + 1;
          const grid = document.createElement('div');
          grid.className = 'preview-cand-grid';
          grid.style.gridTemplateColumns = `repeat(${cols}, 18px)`;
          grid.style.gridTemplateRows = `repeat(${rows}, 18px)`;

          for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
              const cell = document.createElement('div');
              cell.className = 'preview-cand-cell';
              if (cand.cells[r][c]) {
                cell.classList.add('filled');
                cell.style.background = COLORS[cand.colorIdx].bg;
              }
              grid.appendChild(cell);
            }
          }

          group.appendChild(grid);
          previewCands.appendChild(group);
        });
      } else {
        previewCands.classList.add('hidden');
      }
    }
  }

  function applyDetectedBoard() {
    if (!detectedBoard) return;
    editorBoard = detectedBoard.map(row => [...row]);

    // Apply detected candidates if available
    if (detectedCandidates) {
      detectedCandidates.forEach((cand, idx) => {
        if (idx >= 3) return;
        if (cand) {
          editorCandidates[idx] = {
            cells: cand.cells.map(row => [...row]),
            colorIdx: cand.colorIdx
          };
        }
      });
    }

    // Switch to manual mode for any touch-ups
    currentMode = 'manual';
    dom.modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === 'manual'));
    dom.manualMode.classList.remove('hidden');
    dom.screenshotMode.classList.add('hidden');
    renderEditorBoard();
    // Re-render candidate grids with detected data
    renderAllEditorCandidates();
    updateStartBtn();
  }

  function resetScreenshotMode() {
    dom.uploadZone.style.display = '';
    dom.uploadPlaceholder.classList.remove('hidden');
    dom.analysisStatus.classList.add('hidden');
    dom.detectedPreview.classList.add('hidden');
    dom.ssInput.value = '';
    detectedBoard = null;
    detectedCandidates = null;
    uploadedImg = null;
  }

  function matchColor(r, g, b) {
    // Simple nearest-colour match for filled cells.
    // Empty/filled decision is handled by autoDetectBoard, not here.
    const targetColors = [
      { r: 255, g: 107, b: 107 }, // 0 red
      { r: 255, g: 169, b: 77 },  // 1 orange
      { r: 255, g: 224, b: 102 }, // 2 yellow
      { r: 81,  g: 207, b: 102 }, // 3 green
      { r: 102, g: 217, b: 232 }, // 4 cyan
      { r: 116, g: 185, b: 255 }, // 5 blue
      { r: 177, g: 151, b: 252 }, // 6 purple
      { r: 247, g: 131, b: 172 }, // 7 pink
    ];

    let bestIdx = 1, bestDist = Infinity; // default orange
    for (let i = 0; i < targetColors.length; i++) {
      const t = targetColors[i];
      const dist = Math.sqrt((r - t.r) ** 2 + (g - t.g) ** 2 + (b - t.b) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
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

    // Snapshot after placing, before clearing — used for mini-board display
    const boardAfterPlace = playBoard.map(r => [...r]);

    // Render the placed piece BEFORE clearing so the user sees it land,
    // and so that clearLines() can overlay the clearing animation on top.
    renderPlayBoard();

    // Check lines — this adds the CSS 'clearing' animation and modifies
    // playBoard data; the setTimeout inside will re-render after 350 ms.
    const clearedSet = clearLines();
    const cleared = clearedSet.size;

    const boardAfter = playBoard.map(r => [...r]);

    // Record step
    stepRecords.push({
      candidateIdx,
      row,
      col,
      boardBefore,
      boardAfterPlace,
      boardAfter,
      cleared,
      clearedCells: clearedSet,
      shape: cand.shape,
      colorIdx: cand.colorIdx,
    });

    usedCandidates[candidateIdx] = true;
    // Don't call renderPlayBoard() here — the clearing animation is playing.
    // clearLines()'s setTimeout will re-render when the animation finishes.
    renderPlayCandidates();

    // Check all placed
    if (usedCandidates.every(u => u)) {
      // Success! Show replay (wait for clearing animation if any)
      setTimeout(() => showReplayLightbox(), cleared > 0 ? 500 : 300);
      return;
    }

    // Check game over (board data is already correct — cleared synchronously)
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

    return toClear;
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

      // Show board after placing (before clearing) so cleared cells are visible with markers
      const displayBoard = step.clearedCells && step.clearedCells.size > 0 ? step.boardAfterPlace : step.boardAfter;
      const miniBoard = renderMiniBoard(displayBoard, step.shape, step.row, step.col, step.clearedCells);

      div.appendChild(header);
      div.appendChild(info);
      div.appendChild(miniBoard);
      dom.replaySteps.appendChild(div);
    });

    dom.replayLightbox.classList.remove('hidden');
  }

  function renderMiniBoard(board, shape, placeRow, placeCol, clearedCells) {
    const grid = document.createElement('div');
    grid.className = 'replay-mini-board';

    const placedSet = shape ? new Set(shape.map(([dr, dc]) => `${placeRow + dr},${placeCol + dc}`)) : new Set();
    const clearSet = clearedCells || new Set();

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
        if (clearSet.has(`${r},${c}`)) {
          cell.classList.add('cleared');
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

        const boardAfterPlace = testBoard.map(row => [...row]); // snapshot before clear
        const clearedSet = applyClears(testBoard);
        const clearedCount = clearedSet.size;

        const step = {
          candidateIdx: cand.idx,
          row: r,
          col: c,
          shape: cand.shape,
          colorIdx: cand.colorIdx,
          boardAfterPlace,
          boardAfter: testBoard.map(row => [...row]),
          cleared: clearedCount,
          clearedCells: clearedSet,
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
    return toClear;
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

      // Show board after placing (before clearing) so cleared cells are visible with markers
      const displayBoard = step.clearedCells && step.clearedCells.size > 0 ? step.boardAfterPlace : step.boardAfter;
      const miniBoard = renderMiniBoard(displayBoard, step.shape, step.row, step.col, step.clearedCells);

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
