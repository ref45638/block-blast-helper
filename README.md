# 🧩 Block Blast Helper

A web-based helper tool for the **Block Blast** puzzle game. Set up your board, try unlimited placements, and let the auto-solver find the best move — all running locally in your browser.

## ✨ Features

### 🎮 Block Blast Game
- Classic 8×8 block puzzle gameplay
- Drag & drop pieces onto the board
- Clear full rows and columns to score
- Combo animations and score tracking

### 🛠️ Helper Tool
- **Manual Board Editor** — Paint cells with 8 colors to recreate any board state
- **Screenshot Import** — Upload a screenshot and auto-detect the board via pixel analysis (no server needed)
- **Drag & Drop Simulation** — Place up to 3 candidate pieces with real-time preview (valid / invalid highlights)
- **Auto Solver** — Brute-force DFS solver that finds the optimal placement order to maximize line clears
- **Step Replay** — Review each placement step-by-step with mini-board previews

## 🚀 Getting Started

No build tools or dependencies required — just static HTML, CSS, and JavaScript.

1. **Clone the repo**
   ```bash
   git clone https://github.com/ref45638/block-blast-helper.git
   cd block-blast-helper
   ```

2. **Open in browser**
   - Open `index.html` for the game
   - Open `helper.html` for the helper tool
   - Or use any local server (e.g. VS Code Live Server)

## 📁 Project Structure

```
├── index.html      # Game page
├── game.js         # Game engine (drag & drop, scoring, shapes)
├── style.css       # Shared styles & CSS variables
├── helper.html     # Helper tool page
├── helper.js       # Helper logic (editor, solver, screenshot detection)
├── helper.css      # Helper-specific styles
└── README.md
```

## 🔍 How the Screenshot Detection Works

The auto-detection is done entirely client-side using Canvas:

1. Sample background color from image edges
2. Build a per-row content-width profile to locate the board region
3. Crop to square and detect grid gaps via luminance profiles
4. Sample the center of each cell and match against known block colors

## 🤖 How the Solver Works

- Generates all permutations of the remaining candidate pieces
- For each permutation, uses **backtracking DFS** to try every valid board position
- After each placement, simulates row/column line clears
- Returns the sequence that **maximizes total cells cleared**

## 🛠️ Tech Stack

- **Vanilla JavaScript** — No frameworks, no dependencies
- **CSS Custom Properties** — Theming with gradient block colors
- **Canvas API** — Screenshot analysis and color detection
- **Pointer Events** — Cross-device drag & drop (mouse + touch)

## 📄 License

MIT
