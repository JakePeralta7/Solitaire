'use strict';

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const { deal, drawStock, moveCards, isWon, clientState } = require('./game');

const app = express();
const PORT = process.env.PORT || 3000;
const VALID_DRAW_MODES = [1, 3];

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── Validation helpers ────────────────────────────────────────────────────────

function validateDrawMode(value, res) {
  const dm = Number(value);
  if (!VALID_DRAW_MODES.includes(dm)) {
    res.status(400).json({ error: `draw_mode must be one of: ${VALID_DRAW_MODES.join(', ')}` });
    return null;
  }
  return dm;
}

function requireSession(req, res) {
  const { session_id } = req.body;
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' });
    return null;
  }
  const session = db.getSession(session_id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return null;
  }
  return session;
}

// ─── POST /api/session ─────────────────────────────────────────────────────────

app.post('/api/session', (req, res) => {
  const draw_mode = validateDrawMode(req.body.draw_mode, res);
  if (draw_mode === null) return;

  const session_id = uuidv4();
  const state = deal(draw_mode);

  db.createSession(session_id, draw_mode, state);

  res.json({
    session_id,
    draw_mode,
    state: clientState(state),
    started_at: db.getSession(session_id).started_at,
  });
});

// ─── GET /api/session/:id ──────────────────────────────────────────────────────

app.get('/api/session/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });
  res.json({
    session_id: session.session_id,
    draw_mode: session.draw_mode,
    state: clientState(session.state),
    started_at: session.started_at,
  });
});

// ─── POST /api/action ──────────────────────────────────────────────────────────

/**
 * Unified action endpoint.
 *
 * Draw from stock:
 *   { session_id, type: 'draw' }
 *
 * Move cards:
 *   {
 *     session_id,
 *     type: 'move',
 *     from: { pile: 'waste'|'tableau'|'foundation', col?: 0-6, cardIndex?: N, index?: 0-3 },
 *     to:   { pile: 'tableau'|'foundation', col?: 0-6, index?: 0-3 }
 *   }
 */
app.post('/api/action', (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const { type } = req.body;
  const state = session.state;

  if (type === 'draw') {
    drawStock(state);
    db.updateSession(session.session_id, state);
    const won = isWon(state);
    return res.json({ state: clientState(state), won });
  }

  if (type === 'move') {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required for move' });

    const result = moveCards(state, from, to);
    if (!result.ok) return res.status(400).json({ error: result.error });

    db.updateSession(session.session_id, state);
    const won = isWon(state);
    return res.json({ state: clientState(state), won });
  }

  return res.status(400).json({ error: `Unknown action type: ${type}` });
});

// ─── DELETE /api/session/:id ───────────────────────────────────────────────────

app.delete('/api/session/:id', (req, res) => {
  db.deleteSession(req.params.id);
  res.status(204).end();
});

// ─── POST /api/complete ────────────────────────────────────────────────────────

app.post('/api/complete', (req, res) => {
  const { session_id, player_name, time_seconds } = req.body;

  if (!session_id) return res.status(400).json({ error: 'session_id is required' });
  if (!player_name || typeof player_name !== 'string' || !player_name.trim()) {
    return res.status(400).json({ error: 'player_name is required' });
  }
  if (!Number.isInteger(time_seconds) || time_seconds < 0) {
    return res.status(400).json({ error: 'time_seconds must be a non-negative integer' });
  }

  const session = db.getSession(session_id);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });

  // Anti-cheat: verify the game was actually won
  if (!isWon(session.state)) {
    return res.status(400).json({ error: 'Game is not won yet' });
  }

  db.saveScore(player_name.trim().slice(0, 64), time_seconds, session.draw_mode);
  db.deleteSession(session_id);

  res.json({ ok: true });
});

// ─── GET /api/leaderboard ──────────────────────────────────────────────────────

app.get('/api/leaderboard', (req, res) => {
  const draw_mode = validateDrawMode(req.query.draw_mode ?? 1, res);
  if (draw_mode === null) return;
  const rows = db.getLeaderboard(draw_mode);
  res.json(rows);
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Solitaire server running on http://localhost:${PORT}`));
