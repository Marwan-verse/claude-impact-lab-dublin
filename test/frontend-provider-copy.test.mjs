import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('handover review copy is provider-neutral while preview names the actual provider', () => {
  const review = app.split("screen==='review'")[1].split("screen==='detail'")[0];
  assert.doesNotMatch(review, /Claude/i);
  assert.match(review, /Optional notes help the AI provider describe where to pick up/);
  assert.match(review, /Preparing the preview does not call the AI provider/);
  assert.match(review, /Context for \{preview\.provider\}/);
  assert.match(review, /agree to send it to \{preview\.provider\}/);
  assert.match(review, /This draft is AI interpretation/);
});
