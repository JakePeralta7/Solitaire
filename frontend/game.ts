// @ts-nocheck
'use strict';

// ─── Card helpers ──────────────────────────────────────────────────────────────

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABELS  = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

function rankLabel(r) { return RANK_LABELS[r] ?? String(r); }
function suitSym(s)   { return SUIT_SYMBOLS[s] ?? s; }
function isRed(s)     { return s === 'H' || s === 'D'; }

// ─── App state ─────────────────────────────────────────────────────────────────

const state = {
  sessionId: null,
  drawMode: 1,
  gameState: null,      // clientState from server
  selected: null,       // { pile, col?, cardIndex?, index? }
  timerInterval: null,
  elapsedSeconds: 0,
  won: false,
};

// ─── DOM refs ──────────────────────────────────────────────────────────────────

const elTimer            = document.getElementById('timer');
const elMoves            = document.getElementById('moves');
const elStockPile        = document.getElementById('stock-pile');
const elWastePile        = document.getElementById('waste-pile');
const elDrawSelector     = document.getElementById('draw-selector');
const elBtnNewGame       = document.getElementById('btn-new-game');
const elBtnUndo          = document.getElementById('btn-undo');
const elBtnLeaderboard   = document.getElementById('btn-leaderboard');
const elBtnTheme         = document.getElementById('btn-theme');
const elModalLeaderboard = document.getElementById('modal-leaderboard');
const elModalScore       = document.getElementById('modal-score');
const elModalBackdrop    = document.getElementById('modal-backdrop');
const elLbClose          = document.getElementById('lb-close');
const elLbDrawSelector   = document.getElementById('lb-draw-selector');
const elLbContent        = document.getElementById('leaderboard-content');
const elScoreForm        = document.getElementById('score-form');
const elPlayerName       = document.getElementById('player-name');
const elScoreSummary     = document.getElementById('score-summary');
const elBtnSkipScore     = document.getElementById('btn-skip-score');
const elFoundations      = [0, 1, 2, 3].map(i => document.getElementById(`foundation-${i}`));
const elTableauCols      = [0, 1, 2, 3, 4, 5, 6].map(i => document.getElementById(`tableau-${i}`));

// ─── Theme ─────────────────────────────────────────────────────────────────────

const THEMES      = ['auto', 'light', 'dark'];
const THEME_ICONS = { auto: '🌙', light: '☀️', dark: '🌙' };

function initTheme() {
  applyTheme(localStorage.getItem('solitaire_theme') ?? 'auto');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  elBtnTheme.textContent = THEME_ICONS[theme] ?? '🌙';
  localStorage.setItem('solitaire_theme', theme);
}

function cycleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') ?? 'auto';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  applyTheme(next);
}

// ─── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  if (state.timerInterval) return;
  state.timerInterval = setInterval(() => {
    if (!state.won) {
      state.elapsedSeconds++;
      localStorage.setItem('solitaire_elapsed', state.elapsedSeconds);
      renderTimer();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function renderTimer() {
  const m = Math.floor(state.elapsedSeconds / 60);
  const s = state.elapsedSeconds % 60;
  elTimer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Card DOM construction ─────────────────────────────────────────────────────

function makeCard(card) {
  const el = document.createElement('div');
  if (!card.faceUp) {
    el.className = 'card face-down';
    return el;
  }
  el.className = `card face-up ${isRed(card.suit) ? 'red' : 'black'}`;
  const r = rankLabel(card.rank);
  const s = suitSym(card.suit);
  el.innerHTML =
    `<div class="rank-top"><span class="rank-label">${r}</span><span class="suit-label">${s}</span></div>` +
    `<span class="suit-center">${s}</span>` +
    `<div class="rank-bottom"><span class="rank-label">${r}</span><span class="suit-label">${s}</span></div>`;
  return el;
}

function getCardW() {
  // Mirror CSS: clamp(40, min((100vw-72)/7, (100dvh-130)/6.8), 95)
  const byWidth  = (window.innerWidth  - 72)  / 7;
  const byHeight = (window.innerHeight - 130) / 6.8;
  return Math.max(40, Math.min(95, Math.min(byWidth, byHeight)));
}

function cardOffsets() {
  const h = getCardW() * 100 / 72;
  return { down: Math.round(h * 0.20), up: Math.round(h * 0.28) };
}

function cardHeight() {
  return Math.round(getCardW() * 100 / 72);
}

// ─── Render ────────────────────────────────────────────────────────────────────

function renderBoard() {
  const gs = state.gameState;
  if (!gs) return;
  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau();
  elMoves.textContent = gs.moves;
}

function renderStock() {
  elStockPile.innerHTML = '';
  if (state.gameState.stockCount > 0) {
    elStockPile.appendChild(makeCard({ faceUp: false }));
  } else {
    elStockPile.innerHTML = '<div class="pile-placeholder">↺</div>';
  }
}

function renderWaste() {
  elWastePile.innerHTML = '<div class="pile-placeholder">—</div>';
  const waste = state.gameState.waste;
  if (!waste.length) return;

  const dm = state.gameState.drawMode;
  const displayCount = dm === 3 ? Math.min(3, waste.length) : 1;
  const startIdx     = waste.length - displayCount;
  const fanPx        = Math.round(getCardW() * 0.194);

  for (let i = startIdx; i < waste.length; i++) {
    const isTop = (i === waste.length - 1);
    const el    = makeCard(waste[i]);
    el.style.left = `${(i - startIdx) * fanPx}px`;

    if (isTop) {
      if (state.selected?.pile === 'waste') el.classList.add('selected');
      el.addEventListener('click',    e => { e.stopPropagation(); handleWasteClick(); });
      el.addEventListener('dblclick', e => { e.stopPropagation(); handleAutoFoundation({ pile: 'waste' }); });
    }
    elWastePile.appendChild(el);
  }
}

function renderFoundations() {
  const suits = ['♠', '♥', '♦', '♣'];
  state.gameState.foundations.forEach((pile, i) => {
    const el = elFoundations[i];
    el.innerHTML = '';
    if (pile.length === 0) {
      el.innerHTML = `<div class="pile-placeholder">${suits[i]}</div>`;
    } else {
      const cardEl = makeCard(pile[pile.length - 1]);
      if (state.selected?.pile === 'foundation' && state.selected.index === i) {
        cardEl.classList.add('selected');
      }
      el.appendChild(cardEl);
    }
    el.classList.toggle('complete', pile.length === 13);
  });
}

function renderTableau() {
  const { down, up } = cardOffsets();
  const ch = cardHeight();

  state.gameState.tableau.forEach((column, col) => {
    const colEl = elTableauCols[col];
    colEl.innerHTML = '';
    colEl.classList.toggle('drop-target', column.length === 0);

    if (column.length === 0) {
      colEl.style.minHeight = `${ch}px`;
      return;
    }

    let top = 0;
    column.forEach((card, i) => {
      const el = makeCard(card);
      el.style.top = `${top}px`;

      if (card.faceUp) {
        const isSel = state.selected?.pile === 'tableau' &&
                      state.selected.col === col &&
                      state.selected.cardIndex <= i; // highlight entire selected sequence
        if (isSel) el.classList.add('selected');

        // Capture loop vars
        const ci = i;
        el.addEventListener('click',    e => { e.stopPropagation(); handleTableauCardClick(col, ci); });
        el.addEventListener('dblclick', e => { e.stopPropagation(); handleAutoFoundation({ pile: 'tableau', col, cardIndex: ci }); });
      }

      colEl.appendChild(el);
      if (i < column.length - 1) top += card.faceUp ? up : down;
    });

    colEl.style.minHeight = `${top + ch}px`;
  });
}

// ─── Interaction handlers ──────────────────────────────────────────────────────

function clearSel() {
  state.selected = null;
}

function handleStockClick() {
  if (state.won) return;
  clearSel();
  startTimer();
  postAction({ type: 'draw' }).then(r => { if (r) applyResult(r); });
}

function handleWasteClick() {
  if (state.won) return;
  if (!state.gameState.waste.length) return;

  if (state.selected?.pile === 'waste') {
    clearSel(); renderBoard(); return;
  }
  clearSel();
  state.selected = { pile: 'waste' };
  renderBoard();
}

function handleFoundationClick(foundIdx) {
  if (state.won) return;

  if (!state.selected) {
    // Select foundation top card (to allow moving it back to tableau)
    if (state.gameState.foundations[foundIdx].length > 0) {
      state.selected = { pile: 'foundation', index: foundIdx };
      renderBoard();
    }
    return;
  }

  const sel = state.selected;
  clearSel();
  startTimer();

  let from;
  if (sel.pile === 'waste')      from = { pile: 'waste' };
  else if (sel.pile === 'tableau') from = { pile: 'tableau', col: sel.col, cardIndex: sel.cardIndex };
  else { renderBoard(); return; }

  postAction({ type: 'move', from, to: { pile: 'foundation', index: foundIdx } })
    .then(r => { if (r) applyResult(r); else renderBoard(); });
}

function handleTableauCardClick(col, cardIndex) {
  if (state.won) return;

  // Toggle deselect
  if (state.selected?.pile === 'tableau' && state.selected.col === col && state.selected.cardIndex === cardIndex) {
    clearSel(); renderBoard(); return;
  }

  if (state.selected) {
    const sel = state.selected;
    clearSel();
    startTimer();

    let from;
    if (sel.pile === 'waste')        from = { pile: 'waste' };
    else if (sel.pile === 'tableau') from = { pile: 'tableau', col: sel.col, cardIndex: sel.cardIndex };
    else if (sel.pile === 'foundation') from = { pile: 'foundation', index: sel.index };
    else { renderBoard(); return; }

    postAction({ type: 'move', from, to: { pile: 'tableau', col } })
      .then(r => {
        if (r) applyResult(r);
        else {
          // Move rejected — select the newly clicked card instead
          state.selected = { pile: 'tableau', col, cardIndex };
          renderBoard();
        }
      });
    return;
  }

  state.selected = { pile: 'tableau', col, cardIndex };
  renderBoard();
}

function handleTableauColClick(col) {
  if (state.won || !state.selected) return;

  const sel = state.selected;
  clearSel();
  startTimer();

  let from;
  if (sel.pile === 'waste')        from = { pile: 'waste' };
  else if (sel.pile === 'tableau') from = { pile: 'tableau', col: sel.col, cardIndex: sel.cardIndex };
  else if (sel.pile === 'foundation') from = { pile: 'foundation', index: sel.index };
  else { renderBoard(); return; }

  postAction({ type: 'move', from, to: { pile: 'tableau', col } })
    .then(r => { if (r) applyResult(r); else renderBoard(); });
}

function handleAutoFoundation(from) {
  if (state.won) return;
  clearSel();
  startTimer();
  // Server auto-detects the correct foundation pile (no index provided)
  postAction({ type: 'move', from, to: { pile: 'foundation' } })
    .then(r => { if (r) applyResult(r); else renderBoard(); });
}

function applyResult(result) {
  state.gameState = result.state;
  renderBoard();
  if (result.won) {
    state.won = true;
    stopTimer();
    openScoreModal();
  }
}

async function handleUndo() {
  if (state.won) return;
  clearSel();
  const r = await postAction({ type: 'undo' });
  if (r) {
    state.gameState = r.state;
    renderBoard();
  }
}

// ─── API ───────────────────────────────────────────────────────────────────────

async function postAction(body) {
  body.session_id = state.sessionId;
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// ─── Session management ────────────────────────────────────────────────────────

async function tryResumeSession() {
  const savedId = localStorage.getItem('solitaire_sessionId');
  if (!savedId) return false;
  try {
    const res = await fetch(`/api/session/${savedId}`);
    if (!res.ok) {
      localStorage.removeItem('solitaire_sessionId');
      localStorage.removeItem('solitaire_elapsed');
      return false;
    }
    const data = await res.json();
    state.sessionId    = data.session_id;
    state.drawMode     = data.draw_mode;
    state.gameState    = data.state;
    state.elapsedSeconds = parseInt(localStorage.getItem('solitaire_elapsed') ?? '0', 10);
    state.won = false;
    syncDrawBtns(state.drawMode);
    renderTimer();
    renderBoard();
    startTimer();
    return true;
  } catch {
    return false;
  }
}

async function startNewGame() {
  stopTimer();
  clearSel();
  state.won = false;
  state.elapsedSeconds = 0;
  state.gameState = null;
  renderTimer();
  elMoves.textContent = '0';

  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draw_mode: state.drawMode }),
    });
    const data = await res.json();
    state.sessionId  = data.session_id;
    state.drawMode   = data.draw_mode;
    state.gameState  = data.state;
    localStorage.setItem('solitaire_sessionId', state.sessionId);
    localStorage.setItem('solitaire_elapsed', '0');
    renderBoard();
  } catch (err) {
    console.error('Failed to start new game:', err);
  }
}

function syncDrawBtns(dm) {
  document.querySelectorAll('#draw-selector .draw-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.draw) === dm);
  });
}

// ─── Leaderboard ───────────────────────────────────────────────────────────────

let lbDrawMode = 1;

function openLeaderboardModal() {
  lbDrawMode = state.drawMode;
  syncLbBtns(lbDrawMode);
  loadLeaderboard(lbDrawMode);
  elModalLeaderboard.classList.remove('hidden');
  elModalBackdrop.classList.remove('hidden');
}

function closeLeaderboardModal() {
  elModalLeaderboard.classList.add('hidden');
  elModalBackdrop.classList.add('hidden');
}

function syncLbBtns(dm) {
  document.querySelectorAll('#lb-draw-selector .draw-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.draw) === dm);
  });
}

async function loadLeaderboard(dm) {
  elLbContent.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const res = await fetch(`/api/leaderboard?draw_mode=${dm}`);
    renderLeaderboard(await res.json());
  } catch {
    elLbContent.innerHTML = '<p class="empty-state">Failed to load.</p>';
  }
}

function renderLeaderboard(rows) {
  if (!rows.length) {
    elLbContent.innerHTML = '<p class="empty-state">No scores yet — be the first!</p>';
    return;
  }
  const fmtTime = s => {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };
  const icons = ['🥇', '🥈', '🥉'];
  const body = rows.map((r, i) =>
    `<tr>
      <td><span class="rank-badge${i < 3 ? ` rank-${i + 1}` : ''}">${icons[i] ?? (i + 1)}</span></td>
      <td>${escHtml(r.player_name)}</td>
      <td>${fmtTime(r.time_seconds)}</td>
    </tr>`
  ).join('');
  elLbContent.innerHTML =
    `<table><thead><tr><th>#</th><th>Player</th><th>Time</th></tr></thead><tbody>${body}</tbody></table>`;
}

// ─── Score modal ───────────────────────────────────────────────────────────────

function openScoreModal() {
  const m = Math.floor(state.elapsedSeconds / 60);
  const s = state.elapsedSeconds % 60;
  const moves = state.gameState?.moves ?? 0;
  elScoreSummary.textContent =
    `Completed in ${m > 0 ? `${m}m ` : ''}${s}s with ${moves} move${moves !== 1 ? 's' : ''}!`;
  elPlayerName.value = localStorage.getItem('solitaire_playerName') ?? '';
  elModalScore.classList.remove('hidden');
  elModalBackdrop.classList.remove('hidden');
  elPlayerName.focus();
}

function closeScoreModal() {
  elModalScore.classList.add('hidden');
  elModalBackdrop.classList.add('hidden');
}

async function submitScore(name) {
  localStorage.setItem('solitaire_playerName', name);
  try {
    await fetch('/api/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id:   state.sessionId,
        player_name:  name,
        time_seconds: state.elapsedSeconds,
      }),
    });
  } catch (err) {
    console.error('Score submit error:', err);
  }
  localStorage.removeItem('solitaire_sessionId');
  localStorage.removeItem('solitaire_elapsed');
  closeScoreModal();
}

// ─── XSS helper ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event listeners ───────────────────────────────────────────────────────────

elBtnTheme.addEventListener('click', cycleTheme);

elBtnNewGame.addEventListener('click', async () => {
  if (state.sessionId && !state.won) {
    await fetch(`/api/session/${state.sessionId}`, { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem('solitaire_sessionId');
    localStorage.removeItem('solitaire_elapsed');
  }
  await startNewGame();
});

elDrawSelector.querySelectorAll('.draw-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const dm = Number(btn.dataset.draw);
    if (dm === state.drawMode) return;
    state.drawMode = dm;
    syncDrawBtns(dm);
    elBtnNewGame.click();
  });
});

elStockPile.addEventListener('click', handleStockClick);

elFoundations.forEach((el, i) => el.addEventListener('click', () => handleFoundationClick(i)));

elTableauCols.forEach((colEl, col) => {
  colEl.addEventListener('click', () => handleTableauColClick(col));
});

elBtnUndo.addEventListener('click', handleUndo);
elBtnLeaderboard.addEventListener('click', openLeaderboardModal);
elLbClose.addEventListener('click', closeLeaderboardModal);

elLbDrawSelector.querySelectorAll('.draw-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    lbDrawMode = Number(btn.dataset.draw);
    syncLbBtns(lbDrawMode);
    loadLeaderboard(lbDrawMode);
  });
});

elScoreForm.addEventListener('submit', async e => {
  e.preventDefault();
  const name = elPlayerName.value.trim();
  if (!name) { elPlayerName.focus(); return; }
  await submitScore(name);
  await startNewGame();
});

elBtnSkipScore.addEventListener('click', async () => {
  if (state.sessionId) {
    await fetch(`/api/session/${state.sessionId}`, { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem('solitaire_sessionId');
    localStorage.removeItem('solitaire_elapsed');
  }
  closeScoreModal();
  await startNewGame();
});

elModalBackdrop.addEventListener('click', () => {
  if (!elModalLeaderboard.classList.contains('hidden')) closeLeaderboardModal();
});

window.addEventListener('resize', () => {
  if (state.gameState) renderBoard();
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    handleUndo();
    return;
  }
  if (e.key === 'Escape' && elModalLeaderboard.classList.contains('hidden') === false) {
    closeLeaderboardModal();
  }
});

// ─── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  initTheme();
  const resumed = await tryResumeSession();
  if (!resumed) await startNewGame();
})();

