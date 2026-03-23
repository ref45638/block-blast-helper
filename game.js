/* ============================================================
   Block Blast — Game Engine
   ============================================================ */

(() => {
  'use strict';

  // --- Constants ---
  const BOARD_SIZE = 8;
  const CANDIDATES_COUNT = 3;

  // Block colour classes (CSS gradient vars)
  const COLORS = [
    { bg: 'var(--block-red)',    name: 'red'    },
    { bg: 'var(--block-orange)', name: 'orange' },
    { bg: 'var(--block-yellow)', name: 'yellow' },
    { bg: 'var(--block-green)',  name: 'green'  },
    { bg: 'var(--block-cyan)',   name: 'cyan'   },
    { bg: 'var(--block-blue)',   name: 'blue'   },
    { bg: 'var(--block-purple)', name: 'purple' },
    { bg: 'var(--block-pink)',   name: 'pink'   },
  ];

  // Shape definitions: arrays of [row, col] offsets
  const SHAPES = [
    // Single
    [[0,0]],
    // Dominos
    [[0,0],[0,1]],
    [[0,0],[1,0]],
    // Tri
    [[0,0],[0,1],[0,2]],
    [[0,0],[1,0],[2,0]],
    [[0,0],[0,1],[1,0]],
    [[0,0],[0,1],[1,1]],
    [[0,0],[1,0],[1,1]],
    [[0,0],[1,0],[1,-1]],
    // Tetrominos
    [[0,0],[0,1],[0,2],[0,3]],           // I horiz
    [[0,0],[1,0],[2,0],[3,0]],           // I vert
    [[0,0],[0,1],[1,0],[1,1]],           // O
    [[0,0],[1,0],[1,1],[2,1]],           // S vert
    [[0,0],[0,1],[1,-1],[1,0]],          // S horiz
    [[0,0],[1,0],[1,-1],[2,-1]],         // Z vert
    [[0,0],[0,1],[1,1],[1,2]],           // Z horiz
    [[0,0],[0,1],[0,2],[1,0]],           // L
    [[0,0],[0,1],[0,2],[1,2]],           // J
    [[0,0],[1,0],[2,0],[2,1]],           // L vert
    [[0,0],[0,1],[1,0],[2,0]],           // J vert
    [[0,0],[0,1],[0,2],[1,1]],           // T
    [[0,0],[1,0],[1,1],[2,0]],           // T vert
    // Pentominos (select)
    [[0,0],[0,1],[0,2],[0,3],[0,4]],     // I-5
    [[0,0],[1,0],[2,0],[3,0],[4,0]],     // I-5 vert
    [[0,0],[0,1],[0,2],[1,0],[1,1]],     // P
    [[0,0],[0,1],[1,0],[1,1],[2,0]],     // P vert
    // Big square
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], // 3x3
  ];

  // --- State ---
  let board = [];        // 2D: null or colour name
  let score = 0;
  let bestScore = 0;
  let candidates = [];   // { shape, color, used }
  let dragging = null;   // { candidateIdx, color, shape, ghost, offsetX, offsetY }

  // --- DOM refs ---
  const boardEl      = document.getElementById('board');
  const candidatesEl = document.getElementById('candidates');
  const scoreEl      = document.getElementById('score');
  const bestScoreEl  = document.getElementById('best-score');
  const comboEl      = document.getElementById('combo-text');
  const gameOverEl   = document.getElementById('game-over');
  const finalScoreEl = document.getElementById('final-score');
  const restartBtn   = document.getElementById('restart-btn');

  // --- Helpers ---
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }

  function normalizeShape(shape) {
    const minR = Math.min(...shape.map(s => s[0]));
    const minC = Math.min(...shape.map(s => s[1]));
    return shape.map(([r, c]) => [r - minR, c - minC]);
  }

  function shapeBounds(shape) {
    const rows = shape.map(s => s[0]);
    const cols = shape.map(s => s[1]);
    return {
      rows: Math.max(...rows) + 1,
      cols: Math.max(...cols) + 1,
    };
  }

  // --- Board ---
  function initBoard() {
    board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        if (board[r][c]) {
          cell.classList.add('filled');
          const colorObj = COLORS.find(co => co.name === board[r][c]);
          cell.style.background = colorObj ? colorObj.bg : 'var(--block-blue)';
        }
        boardEl.appendChild(cell);
      }
    }
  }

  // --- Candidates ---
  function generateCandidates() {
    candidates = [];
    for (let i = 0; i < CANDIDATES_COUNT; i++) {
      const rawShape = pick(SHAPES);
      const shape = normalizeShape(rawShape);
      const color = pick(COLORS);
      candidates.push({ shape, color, used: false });
    }
    renderCandidates();
  }

  function renderCandidates() {
    candidatesEl.innerHTML = '';
    candidates.forEach((cand, idx) => {
      const { rows, cols } = shapeBounds(cand.shape);
      const el = document.createElement('div');
      el.className = 'candidate' + (cand.used ? ' used' : '');
      el.dataset.idx = idx;
      el.dataset.cols = cols;
      el.dataset.rows = rows;

      // Build grid with empties
      const occupied = new Set(cand.shape.map(([r, c]) => `${r},${c}`));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const mini = document.createElement('div');
          mini.className = 'mini-cell';
          if (occupied.has(`${r},${c}`)) {
            mini.style.background = cand.color.bg;
          } else {
            mini.classList.add('empty');
          }
          el.appendChild(mini);
        }
      }

      // Drag events
      el.addEventListener('mousedown', (e) => startDrag(e, idx));
      el.addEventListener('touchstart', (e) => startDrag(e, idx), { passive: false });

      candidatesEl.appendChild(el);
    });

    // Responsive mini-cell size
    updateCandidateSizes();
  }

  function updateCandidateSizes() {
    const w = window.innerWidth;
    let size = 28;
    if (w <= 440) size = 24;
    if (w <= 360) size = 20;
    document.querySelectorAll('.candidate').forEach(el => {
      const cols = parseInt(el.dataset.cols) || 1;
      const rows = parseInt(el.dataset.rows) || 1;
      el.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
      el.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;
    });
    document.querySelectorAll('.candidate .mini-cell').forEach(el => {
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
    });
  }

  // --- Placement Logic ---
  function canPlace(shape, startRow, startCol) {
    for (const [dr, dc] of shape) {
      const r = startRow + dr;
      const c = startCol + dc;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
      if (board[r][c]) return false;
    }
    return true;
  }

  function canPlaceAnywhere(shape) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (canPlace(shape, r, c)) return true;
      }
    }
    return false;
  }

  function placeShape(shape, startRow, startCol, colorName) {
    for (const [dr, dc] of shape) {
      board[startRow + dr][startCol + dc] = colorName;
    }
  }

  // --- Clear Lines ---
  function clearLines() {
    const rowsToClear = [];
    const colsToClear = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r].every(cell => cell !== null)) rowsToClear.push(r);
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board.every(row => row[c] !== null)) colsToClear.push(c);
    }

    const totalLines = rowsToClear.length + colsToClear.length;
    if (totalLines === 0) return 0;

    // Collect cells to clear
    const cellsToClear = new Set();
    for (const r of rowsToClear) {
      for (let c = 0; c < BOARD_SIZE; c++) cellsToClear.add(`${r},${c}`);
    }
    for (const c of colsToClear) {
      for (let r = 0; r < BOARD_SIZE; r++) cellsToClear.add(`${r},${c}`);
    }

    // Animate
    const cellEls = boardEl.querySelectorAll('.cell');
    cellsToClear.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const el = cellEls[r * BOARD_SIZE + c];
      if (el) el.classList.add('clearing');
    });

    // After animation, clear board
    setTimeout(() => {
      cellsToClear.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        board[r][c] = null;
      });
      renderBoard();
    }, 350);

    // Score: 10 per line, bonus for combos
    const points = totalLines * BOARD_SIZE * 10 + (totalLines > 1 ? totalLines * 20 : 0);

    // Show combo
    if (totalLines > 1) {
      showCombo(`${totalLines}x COMBO!`);
    }

    return points;
  }

  function showCombo(text) {
    comboEl.textContent = text;
    comboEl.classList.remove('hidden', 'show');
    void comboEl.offsetWidth; // reflow
    comboEl.classList.add('show');
    setTimeout(() => {
      comboEl.classList.remove('show');
      comboEl.classList.add('hidden');
    }, 900);
  }

  // --- Score ---
  function addScore(points) {
    score += points;
    scoreEl.textContent = score;
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = bestScore;
      try { localStorage.setItem('bb-best', bestScore); } catch(e) {}
    }
  }

  function loadBest() {
    try {
      bestScore = parseInt(localStorage.getItem('bb-best') || '0', 10);
    } catch(e) { bestScore = 0; }
    bestScoreEl.textContent = bestScore;
  }

  // --- Game Over Check ---
  function checkGameOver() {
    const remaining = candidates.filter(c => !c.used);
    if (remaining.length === 0) {
      generateCandidates();
      // Check again after new candidates
      const newRemaining = candidates.filter(c => !c.used);
      const anyCanFit = newRemaining.some(c => canPlaceAnywhere(c.shape));
      if (!anyCanFit) {
        endGame();
      }
      return;
    }
    const anyCanFit = remaining.some(c => canPlaceAnywhere(c.shape));
    if (!anyCanFit) {
      endGame();
    }
  }

  function endGame() {
    finalScoreEl.textContent = score;
    gameOverEl.classList.remove('hidden');
  }

  // --- Drag & Drop ---
  function getCellSize() {
    const firstCell = boardEl.querySelector('.cell');
    if (!firstCell) return 40;
    return firstCell.getBoundingClientRect().width;
  }

  function startDrag(e, idx) {
    const cand = candidates[idx];
    if (cand.used) return;
    e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    const cellSize = getCellSize();

    // Create ghost
    const { rows, cols } = shapeBounds(cand.shape);
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    ghost.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    ghost.style.gap = '3px';

    const occupied = new Set(cand.shape.map(([r, c]) => `${r},${c}`));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const mini = document.createElement('div');
        mini.className = 'mini-cell';
        if (occupied.has(`${r},${c}`)) {
          mini.style.background = cand.color.bg;
          mini.style.width = `${cellSize}px`;
          mini.style.height = `${cellSize}px`;
        } else {
          mini.style.width = `${cellSize}px`;
          mini.style.height = `${cellSize}px`;
          mini.style.background = 'transparent';
          mini.style.boxShadow = 'none';
        }
        ghost.appendChild(mini);
      }
    }

    // Position ghost above finger
    const offsetY = -cellSize * rows / 2 - 60; // Lift above touch point
    ghost.style.left = `${touch.clientX}px`;
    ghost.style.top = `${touch.clientY + offsetY}px`;
    document.body.appendChild(ghost);

    dragging = { candidateIdx: idx, color: cand.color, shape: cand.shape, ghost, offsetY };

    // Dim candidate
    const candEl = candidatesEl.children[idx];
    if (candEl) candEl.style.opacity = '0.3';

    // Bind move/end
    if (e.touches) {
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend', onDragEnd);
      document.addEventListener('touchcancel', onDragEnd);
    } else {
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    }
  }

  function onDragMove(e) {
    if (!dragging) return;
    e.preventDefault();

    const touch = e.touches ? e.touches[0] : e;
    dragging.ghost.style.left = `${touch.clientX}px`;
    dragging.ghost.style.top = `${touch.clientY + dragging.offsetY}px`;

    // Board preview
    clearPreviews();
    const pos = getBoardPosition(touch.clientX, touch.clientY + dragging.offsetY);
    if (pos) {
      const valid = canPlace(dragging.shape, pos.row, pos.col);
      showPreview(dragging.shape, pos.row, pos.col, valid);
    }
  }

  function onDragEnd(e) {
    if (!dragging) return;

    const touch = e.changedTouches ? e.changedTouches[0] : e;
    const pos = getBoardPosition(touch.clientX, touch.clientY + dragging.offsetY);

    let placed = false;
    if (pos && canPlace(dragging.shape, pos.row, pos.col)) {
      placeShape(dragging.shape, pos.row, pos.col, dragging.color.name);
      candidates[dragging.candidateIdx].used = true;

      // Score for placing
      addScore(dragging.shape.length);

      renderBoard();
      renderCandidates();

      // Clear lines
      const linePoints = clearLines();
      if (linePoints > 0) {
        addScore(linePoints);
      }

      placed = true;
    }

    // Clean up
    clearPreviews();
    if (dragging.ghost.parentNode) dragging.ghost.remove();

    // Restore candidate opacity
    if (!placed) {
      const candEl = candidatesEl.children[dragging.candidateIdx];
      if (candEl) candEl.style.opacity = '1';
    }

    dragging = null;

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
    document.removeEventListener('touchcancel', onDragEnd);

    if (placed) {
      // Check if all candidates used → generate new ones
      // Check game over
      setTimeout(() => checkGameOver(), 400);
    }
  }

  function getBoardPosition(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    const gap = 3; // gap size
    const padding = gap; // board padding
    const cellSize = (rect.width - padding * 2 - gap * (BOARD_SIZE - 1)) / BOARD_SIZE;

    // Ghost center to top-left of shape at board
    const { rows, cols } = shapeBounds(dragging.shape);
    const ghostW = cols * cellSize + (cols - 1) * gap;
    const ghostH = rows * cellSize + (rows - 1) * gap;

    const x = clientX - ghostW / 2 - rect.left - padding;
    const y = clientY - ghostH / 2 - rect.top - padding;

    const col = Math.round(x / (cellSize + gap));
    const row = Math.round(y / (cellSize + gap));

    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    return { row, col };
  }

  function showPreview(shape, startRow, startCol, valid) {
    const cellEls = boardEl.querySelectorAll('.cell');
    for (const [dr, dc] of shape) {
      const r = startRow + dr;
      const c = startCol + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        const el = cellEls[r * BOARD_SIZE + c];
        if (el) el.classList.add(valid ? 'preview-valid' : 'preview-invalid');
      }
    }
  }

  function clearPreviews() {
    boardEl.querySelectorAll('.preview-valid, .preview-invalid').forEach(el => {
      el.classList.remove('preview-valid', 'preview-invalid');
    });
  }

  // --- Init ---
  function startGame() {
    gameOverEl.classList.add('hidden');
    score = 0;
    scoreEl.textContent = '0';
    loadBest();
    initBoard();
    renderBoard();
    generateCandidates();
  }

  restartBtn.addEventListener('click', startGame);
  window.addEventListener('resize', updateCandidateSizes);

  // Prevent page scroll while dragging
  document.addEventListener('touchmove', (e) => {
    if (dragging) e.preventDefault();
  }, { passive: false });

  startGame();
})();
