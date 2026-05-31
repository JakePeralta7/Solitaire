'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deal,
  drawStock,
  moveCards,
  isWon,
  clientState,
} = require('../game');

test('deal returns a complete Klondike setup', () => {
  const state = deal(1);

  assert.equal(state.tableau.length, 7);
  assert.equal(state.stock.length, 24);
  assert.equal(state.waste.length, 0);
  assert.equal(state.foundations.length, 4);
  assert.equal(state.tableau[6].length, 7);
  assert.equal(state.tableau[0][0].faceUp, true);
  assert.equal(state.tableau[1][0].faceUp, false);
  assert.equal(state.tableau[1][1].faceUp, true);
});

test('drawStock moves cards between stock and waste', () => {
  const state = deal(3);
  const startingStock = state.stock.length;

  drawStock(state);

  assert.equal(state.stock.length, startingStock - 3);
  assert.equal(state.waste.length, 3);
  assert.equal(state.waste.every((card) => card.faceUp), true);
});

test('moveCards validates tableau moves', () => {
  const state = {
    stock: [],
    waste: [{ rank: 7, suit: 'H', faceUp: true }],
    foundations: [[], [], [], []],
    tableau: [
      [],
      [{ rank: 8, suit: 'C', faceUp: true }],
      [], [], [], [], [],
    ],
    drawMode: 1,
    moves: 0,
    recycleCount: 0,
    history: [],
  };

  const result = moveCards(state, { pile: 'waste' }, { pile: 'tableau', col: 1 });

  assert.equal(result.ok, true);
  assert.equal(state.tableau[1].length, 2);
});

test('isWon and clientState reflect the game status', () => {
  const state = {
    stock: [],
    waste: [],
    foundations: [
      Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit: 'S', faceUp: true })),
      Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit: 'H', faceUp: true })),
      Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit: 'D', faceUp: true })),
      Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit: 'C', faceUp: true })),
    ],
    tableau: [[], [], [], [], [], [], []],
    drawMode: 1,
    moves: 12,
    recycleCount: 1,
    history: [],
  };

  assert.equal(isWon(state), true);
  assert.equal(clientState(state).moves, 12);
});