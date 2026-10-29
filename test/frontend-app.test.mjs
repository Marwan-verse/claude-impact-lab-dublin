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

test('project search and sorting find names and next steps without changing stored order', () => {
  const entries = [
    { name: 'Zebra', createdAt: '2026-10-28', nextStep: 'Check API' },
    { name: 'Alpha', createdAt: '2026-10-29', notes: JSON.stringify({ nextStep: 'Review design' }) },
    { name: 'Undated' },
  ];
  assert.deepEqual(app.selectVisibleItems(entries, '  API ', 'name').map(x => x.name), ['Zebra']);
  assert.deepEqual(app.selectVisibleItems(entries, 'review').map(x => x.name), ['Alpha']);
  assert.deepEqual(app.selectVisibleItems(entries, '', 'newest').map(x => x.name), ['Alpha', 'Zebra', 'Undated']);
  assert.deepEqual(app.selectVisibleItems(entries, '', 'name').map(x => x.name), ['Alpha', 'Undated', 'Zebra']);
  assert.deepEqual(entries.map(x => x.name), ['Zebra', 'Alpha', 'Undated']);
});

test('search includes handover content', () => {
  const items = [{ projectName: 'Project', handover: 'Investigate timeout in database', notes: '{}' }];
  assert.equal(app.selectVisibleItems(items, 'database').length, 1);
});

test('handover quality flags generic next steps and resume prompts include the saved context', async () => {
  const extras = await vite.ssrLoadModule('/src/Extras.jsx');
  assert.ok(extras.qualityHints('Ship feature', 'None known', 'finish this').some(hint => /specific/i.test(hint)));
  assert.deepEqual(extras.qualityHints('Ship feature', 'None known', 'Run the API test'), []);
  assert.match(extras.resumePrompt({ projectName: 'Demo', handover: 'Investigate the timeout' }), /Investigate the timeout/);
});
