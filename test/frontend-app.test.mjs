import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
after(() => vite.close());
const app = await vite.ssrLoadModule('/src/App.jsx');

test('dashboard uses the next step persisted in structured notes', () => {
  assert.equal(typeof app.nextStepOf, 'function');
  assert.equal(app.nextStepOf({ notes: JSON.stringify({ nextStep: 'Run tests' }) }), 'Run tests');
});

test('dashboard safely falls back for plain, malformed, or unrelated notes', () => {
  const fallback = 'Open the handover to see your next step.';
  for (const notes of ['plain text', '{invalid', 'null', '42', '{}', '{"nextStep":42}', '{"nextStep":"  "}']) {
    assert.equal(app.nextStepOf({ notes }), fallback);
  }
  assert.equal(app.nextStepOf({ next_step: 'Explicit', notes: '{"nextStep":"Other"}' }), 'Explicit');
  assert.equal(app.nextStepOf({ notes: { nextStep: 'Object notes' } }), 'Object notes');
});
