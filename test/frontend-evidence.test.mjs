import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
after(() => vite.close());
const { InspectionEvidence, HandoverEvidence } = await vite.ssrLoadModule('/src/Evidence.jsx');

test('inspection shows capture and skipped paths and keeps hashes in details', () => {
  const html = renderToStaticMarkup(React.createElement(InspectionEvidence, { inspection: {
    projectName: 'Example', git: { branch: 'main' }, limitations: ['No Git history'],
    exclusions: ['.env'], capturePreview: { files: ['src/app.js'], skipped: ['.env'], fileHashes: [{ path: 'src/app.js', sha256: 'hash-value' }] },
  } }));
  assert.match(html, /Files to capture/);
  assert.match(html, /src\/app\.js/);
  assert.match(html, /Skipped paths/);
  assert.match(html, /\.env/);
  assert.match(html, /<details[^>]*>.*hash-value/s);
});

test('handover evidence displays structured user notes and safely escapes text', () => {
  const html = renderToStaticMarkup(React.createElement(HandoverEvidence, { vault: {
    checkedFacts: { git: { branch: 'main' } },
    userNotes: JSON.stringify({ goal: '<script>ignored</script>', nextStep: 'Review the diff' }),
  } }));
  assert.match(html, /Your notes/);
  assert.match(html, /Review the diff/);
  assert.match(html, /&lt;script&gt;ignored&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('handover evidence retains plain user notes', () => {
  const html = renderToStaticMarkup(React.createElement(HandoverEvidence, { vault: { userNotes: 'Plain user note' } }));
  assert.match(html, /Plain user note/);
});
