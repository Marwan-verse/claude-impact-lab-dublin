import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function fixture(t) {
  const root = await mkdtemp(path.join(await realpath(process.env.TMPDIR || os.tmpdir()), 'vault-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  await mkdir(project);
  const git = (...args) => execFileSync('git', args, { cwd: project });
  git('init', '-q'); git('config', 'user.name', 'Tester'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(project, 'file.txt'), 'original');
  git('add', '.'); git('commit', '-qm', 'initial');
  await writeFile(path.join(project, 'file.txt'), 'unfinished work');
  return { root, project };
}
const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('defaults to the supported Sonnet model and accepts an override', async () => {
  const { getConfig } = await import('../backend/server.mjs');
  assert.equal(getConfig({}).model, 'claude-sonnet-5-5');
  assert.equal(getConfig({ ANTHROPIC_MODEL: 'custom-model' }).model, 'custom-model');
});
test('provider configuration isolates credentials and requires an explicit TensorX model', async () => {
  const { getConfig } = await import('../backend/server.mjs');
  const env = { ANTHROPIC_API_KEY: 'anthropic-only', ANTHROPIC_MODEL: 'claude-custom', HANDOVER_PROVIDER: 'tensorx' };
  const missing = getConfig(env);
  assert.equal(missing.provider, 'tensorx');
  assert.equal(missing.apiKey, undefined);
  assert.equal(missing.model, undefined);
  const configured = getConfig({ ...env, TENSORX_API_KEY: 'tensor-only', TENSORX_MODEL: 'tensor-model' });
  assert.equal(configured.apiKey, 'tensor-only');
  assert.equal(configured.model, 'tensor-model');
  assert.equal(getConfig({}).provider, 'anthropic');
});
async function request(base, path, body, method) {
  const response = await post(base + path, body, method);
  return { response, body: await response.json() };
}

async function start(t, options = {}) {
  const { createServer } = await import('../backend/server.mjs');
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('TensorX frontend preview is consented and sent unchanged before saving real files', async t => {
  const { root, project } = await fixture(t);
  let sent;
  const base = await start(t, { provider: 'tensorx', vaultRoot: path.join(root, 'vault'), apiKey: 'tensor-test-secret', model: 'tensor-test-model', fetchImpl: async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return Response.json({ choices: [{ message: { content: 'Resume carefully.' } }] });
  } });
  const inspected = await request(base, '/api/inspect', { path: project });
  const notes = { goal: 'Ship', issue: 'Failing test', nextStep: 'Fix test' };
  const preview = await request(base, '/api/handover/preview', { inspectionId: inspected.body.inspectionId, ...notes });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.provider, 'TensorX');
  assert.equal(preview.body.context, JSON.stringify({ context: inspected.body.contextPreview, notes }));
  assert.equal(sent, undefined);
  const generated = await request(base, '/api/handover/generate', { previewId: preview.body.previewId });
  assert.equal(generated.response.status, 200, JSON.stringify(generated.body));
  assert.equal(sent.url, 'https://api.tensorx.ai/v1/chat/completions');
  assert.equal(new Headers(sent.options.headers).get('authorization'), 'Bearer tensor-test-secret');
  assert.equal(sent.body.model, 'tensor-test-model');
  assert.equal(sent.body.messages.find(m => m.role === 'user').content, preview.body.context);
  assert.match(generated.body.handover, /TensorX/);
  assert.doesNotMatch(generated.body.handover, /Claude/);
  assert.doesNotMatch(JSON.stringify(generated.body), /tensor-test-secret/);
  const saved = await request(base, '/api/vaults', { inspectionId: inspected.body.inspectionId, handover: generated.body.handover });
  assert.equal(saved.response.status, 201, JSON.stringify(saved.body));
  const dest = path.join(root, 'restored-tensor');
  assert.equal((await request(base, `/api/vaults/${saved.body.id}/restore`, { destination: dest })).response.status, 200);
  assert.equal(await readFile(path.join(dest, 'file.txt'), 'utf8'), 'unfinished work');
});

test('TensorX direct capture requires confirmation and captures the reviewed git files', async t => {
  const { root, project } = await fixture(t);
  const sent = [];
  const base = await start(t, { provider: 'tensorx', vaultRoot: path.join(root, 'vault'), apiKey: 'tensor-direct-secret', model: 'direct-model', fetchImpl: async (url, options) => {
    sent.push({ url, options, body: JSON.parse(options.body) });
    return Response.json({ choices: [{ message: { content: 'Finish safely.' } }] });
  } });
  const inspected = (await request(base, '/api/inspect', { projectPath: project })).body;
  const input = { projectPath: project, context: inspected.contextPreview, capturePreview: inspected.capturePreview, notes: 'Finish this' };
  assert.equal((await request(base, '/api/vaults', input)).response.status, 400);
  assert.equal(sent.length, 0);
  const created = await request(base, '/api/vaults', { ...input, confirmed: true });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.tensorx.ai/v1/chat/completions');
  assert.equal(new Headers(sent[0].options.headers).get('authorization'), 'Bearer tensor-direct-secret');
  assert.equal(sent[0].body.model, 'direct-model');
  assert.equal(sent[0].body.messages.find(m => m.role === 'user').content, JSON.stringify({ context: input.context, notes: input.notes }));
  assert.match(created.body.handover, /TensorX/);
  assert.doesNotMatch(JSON.stringify(created.body), /tensor-direct-secret|Claude/);
  const destination = path.join(root, 'direct-restore');
  assert.equal((await request(base, `/api/vaults/${created.body.id}/restore`, { destination })).response.status, 200);
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'unfinished work');
});

test('provider configuration failures never reach upstream on either generation path', async t => {
  const { root, project } = await fixture(t);
  for (const scenario of [
    { provider: 'tensorx', apiKey: '', model: 'valid', expected: /TENSORX_API_KEY/ },
    { provider: 'tensorx', apiKey: 'tensor-test-secret', model: '', expected: /TENSORX_MODEL/ },
    { provider: 'invalid', apiKey: 'tensor-test-secret', model: 'valid', expected: /HANDOVER_PROVIDER/ },
  ]) {
    let calls = 0;
    const base = await start(t, { ...scenario, vaultRoot: path.join(root, `vault-${scenario.provider}-${scenario.model}`), fetchImpl: async () => { calls++; throw new Error('should not call'); } });
    const inspected = (await request(base, '/api/inspect', { projectPath: project })).body;
    const direct = await request(base, '/api/vaults', { projectPath: project, context: inspected.contextPreview, capturePreview: inspected.capturePreview, notes: '', confirmed: true });
    assert.equal(direct.response.status, 503);
    assert.match(direct.body.error, scenario.expected);
    const preview = await request(base, '/api/handover/preview', { inspectionId: inspected.inspectionId, goal: '', issue: '', nextStep: '' });
    if (scenario.provider === 'invalid') {
      assert.equal(preview.response.status, 503);
      assert.match(preview.body.error, scenario.expected);
    } else {
      assert.equal(preview.body.provider, 'TensorX');
      const generated = await request(base, '/api/handover/generate', { previewId: preview.body.previewId });
      assert.equal(generated.response.status, 503);
      assert.match(generated.body.error, scenario.expected);
    }
    assert.equal(calls, 0);
    assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
  }
});

test('TensorX rejects changed project during generation and sanitizes upstream failures', async t => {
  const { root, project } = await fixture(t);
  let mode = 'change';
  const base = await start(t, { provider: 'tensorx', vaultRoot: path.join(root, 'vault'), apiKey: 'tensor-private-key', model: 'tensor-model', fetchImpl: async () => {
    if (mode === 'change') {
      await writeFile(path.join(project, 'file.txt'), 'changed while generating');
      return Response.json({ choices: [{ message: { content: 'Draft' } }] });
    }
    throw new Error('tensor-private-key and private upstream details');
  } });
  for (const current of ['change', 'failure']) {
    mode = current;
    const inspected = (await request(base, '/api/inspect', { path: project })).body;
    const preview = (await request(base, '/api/handover/preview', { inspectionId: inspected.inspectionId, goal: '', issue: '', nextStep: '' })).body;
    const generated = await request(base, '/api/handover/generate', { previewId: preview.previewId });
    assert.equal(generated.response.status, mode === 'change' ? 409 : 502);
    assert.doesNotMatch(JSON.stringify(generated.body), /tensor-private-key|private upstream details/);
    assert.ok((await request(base, '/api/vaults', { inspectionId: inspected.inspectionId, handover: 'forged' })).response.status >= 400);
  }
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('TensorX authentication failures are actionable without leaking the response', async t => {
  const { root, project } = await fixture(t);
  const base = await start(t, { provider: 'tensorx', vaultRoot: path.join(root, 'vault'), apiKey: 'dummy', model: 'model', fetchImpl: async () => new Response('private upstream body', { status: 401 }) });
  const inspected = (await request(base, '/api/inspect', { path: project })).body;
  const preview = (await request(base, '/api/handover/preview', { inspectionId: inspected.inspectionId, goal: '', issue: '', nextStep: '' })).body;
  const generated = await request(base, '/api/handover/generate', { previewId: preview.previewId });
  assert.equal(generated.response.status, 502);
  assert.match(generated.body.error, /401/);
  assert.doesNotMatch(JSON.stringify(generated.body), /private upstream body|dummy/);
});

test('selecting TensorX cannot inherit an Anthropic environment key or model', async t => {
  const { root, project } = await fixture(t);
  const script = `
    import { createServer } from './backend/server.mjs';
    let calls = 0;
    const server = createServer({ provider: 'tensorx', fetchImpl: async () => { calls++; throw new Error('unexpected network'); } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
    const [, inspected] = await post('/api/inspect', { projectPath: process.argv[1] });
    const result = await post('/api/vaults', { projectPath: process.argv[1], context: inspected.contextPreview, capturePreview: inspected.capturePreview, notes: '', confirmed: true });
    console.log(JSON.stringify({ result, calls }));
    await new Promise(resolve => server.close(resolve));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, project], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, ANTHROPIC_API_KEY: 'anthropic-only-secret', ANTHROPIC_MODEL: 'anthropic-only-model' }, encoding: 'utf8',
  });
  const { result, calls } = JSON.parse(output);
  assert.equal(result[0], 503);
  assert.match(result[1].error, /TENSORX_API_KEY/);
  assert.doesNotMatch(output, /anthropic-only-secret/);
  assert.equal(calls, 0);
});

test('rejects hostile browser origins before handling requests', async t => {
  const base = await start(t);
  const response = await fetch(`${base}/api/vaults`, { headers: { origin: 'https://evil.example' } });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('inspection exposes only metadata and rejects invalid projects', async t => {
  const { project } = await fixture(t);
  const base = await start(t);
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  assert.equal(inspected.response.status, 200, JSON.stringify(inspected.body));
  assert.ok(inspected.body.contextPreview);
  assert.doesNotMatch(JSON.stringify(inspected.body.contextPreview), /unfinished work/);
  const invalid = await request(base, '/api/inspect', { projectPath: 'relative' });
  assert.equal(invalid.response.status, 400);
});

test('capture, edit, verify and restore real files with confirmed Claude preview', async t => {
  const { root, project } = await fixture(t);
  let sent;
  const fetchImpl = async (url, options) => {
    sent = { url, headers: options.headers, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Continue carefully.' }] }), { status: 200 });
  };
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'dummy', model: 'test-model', workspaceId: 'test-workspace', fetchImpl });
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  const context = inspected.body.contextPreview, capturePreview = inspected.body.capturePreview, notes = 'Resolve the issue';
  const missing = await request(base, '/api/vaults', { projectPath: project, context, capturePreview, notes });
  assert.equal(missing.response.status, 400);
  assert.equal(sent, undefined);
  const created = await request(base, '/api/vaults', { projectPath: project, context, capturePreview, notes, confirmed: true });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.deepEqual(JSON.parse(sent.body.messages[0].content), { context, notes });
  assert.equal(sent.headers['anthropic-workspace-id'], 'test-workspace');
  assert.equal(sent.body.model, 'test-model');
  assert.doesNotMatch(sent.body.messages[0].content, /unfinished work/);
  const id = created.body.id;
  assert.ok(id);
  const list = await (await fetch(base + '/api/vaults')).json();
  assert.ok(list.some(record => record.id === id));
  const edit = await request(base, `/api/vaults/${id}`, { handover: 'Edited handover' }, 'PATCH');
  assert.equal(edit.response.status, 200);
  const detail = await (await fetch(base + `/api/vaults/${id}`)).json();
  assert.equal(detail.handover, 'Edited handover');
  const verify = await request(base, `/api/vaults/${id}/verify`, {});
  assert.equal(verify.body.ok, true);
  const destination = path.join(root, 'restored');
  const restored = await request(base, `/api/vaults/${id}/restore`, { destination });
  assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'unfinished work');
  assert.equal(await readFile(path.join(project, 'file.txt'), 'utf8'), 'unfinished work');
  const conflict = await request(base, `/api/vaults/${id}/restore`, { destination });
  assert.ok(conflict.response.status >= 400);
});

test('rejects DNS rebinding, browser origins, non-JSON, malformed and oversized input', async t => {
  const base = await start(t, { maxBodyBytes: 128 });
  const badHost = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/vaults', { headers: { host: 'attacker.example' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(badHost, 403);
  let r = await fetch(base + '/api/inspect', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
  r = await fetch(base + '/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(r.status, 400);
  r = await post(base + '/api/inspect', { projectPath: 'x'.repeat(200) });
  assert.equal(r.status, 413);
  r = await fetch(base + '/api/vaults', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  r = await fetch(base + '/api/inspect', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(r.status, 403);
  r = await fetch(base + '/api/inspect', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  r = await fetch(base + '/api/vaults/not-a-valid-id');
  assert.equal(r.status, 400);
  r = await post(base + '/api/inspect', null);
  assert.equal(r.status, 400);
  const chunked = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('{"x":"'); req.end('a'.repeat(200) + '"}');
  });
  assert.equal(chunked, 413);
});

test('Claude failures do not create a snapshot or reveal secrets', async t => {
  const { root, project } = await fixture(t);
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'dummy-secret', fetchImpl: async () => new Response('secret error', { status: 401 }) });
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  const result = await request(base, '/api/vaults', { projectPath: project, context: inspected.body.contextPreview, capturePreview: inspected.body.capturePreview, notes: '', confirmed: true });
  assert.equal(result.response.status, 502);
  assert.match(result.body.error, /Claude/);
  assert.doesNotMatch(JSON.stringify(result.body), /dummy-secret|secret error/);
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('rejects stale or modified inspection context before any upstream call', async t => {
  const { root, project } = await fixture(t);
  let called = false;
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'dummy', fetchImpl: async () => { called = true; } });
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  inspected.body.contextPreview.projectName = 'changed';
  const result = await request(base, '/api/vaults', { projectPath: project, context: inspected.body.contextPreview, capturePreview: inspected.body.capturePreview, notes: '', confirmed: true });
  assert.equal(result.response.status, 409);
  assert.equal(called, false);
});

test('rejects files added while Claude is processing rather than capturing unreviewed content', async t => {
  const { root, project } = await fixture(t);
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'dummy', fetchImpl: async () => {
    await writeFile(path.join(project, 'new-secret.txt'), 'not reviewed');
    return Response.json({ content: [{ type: 'text', text: 'Done' }] });
  } });
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  const result = await request(base, '/api/vaults', { projectPath: project, context: inspected.body.contextPreview, capturePreview: inspected.body.capturePreview, notes: '', confirmed: true });
  assert.equal(result.response.status, 409);
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('requires the reviewed capture preview', async t => {
  const { root, project } = await fixture(t);
  let called = false;
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'dummy', fetchImpl: async () => { called = true; } });
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  const result = await request(base, '/api/vaults', { projectPath: project, context: inspected.body.contextPreview, notes: '', confirmed: true });
  assert.equal(result.response.status, 400);
  assert.equal(called, false);
});

test('rejects overlapping staged and unstaged work before calling Claude', async t => {
  const { root, project } = await fixture(t);
  const git = (...args) => execFileSync('git', args, { cwd: project });
  await writeFile(path.join(project, 'file.txt'), 'staged work');
  git('add', 'file.txt');
  await writeFile(path.join(project, 'file.txt'), 'unstaged work');
  let called = false;
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'dummy', fetchImpl: async () => {
    called = true;
    return Response.json({ content: [{ type: 'text', text: 'not needed' }] });
  } });
  const inspected = await request(base, '/api/inspect', { projectPath: project });
  const result = await request(base, '/api/vaults', { projectPath: project, context: inspected.body.contextPreview, capturePreview: inspected.body.capturePreview, notes: '', confirmed: true });
  assert.equal(result.response.status, 409);
  assert.equal(called, false);
  const preview = await request(base, '/api/handover/preview', { inspectionId: inspected.body.inspectionId, goal: '', issue: '', nextStep: '' });
  assert.equal(preview.response.status, 409);
  assert.equal(called, false);
});

test('frontend inspect preview generate save verify and restore uses exactly the reviewed payload', async t => {
  const { root, project } = await fixture(t);
  let sent;
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'fixture-key', fetchImpl: async (url, options) => {
    sent = JSON.parse(options.body).messages[0].content;
    return Response.json({ content: [{ type: 'text', text: 'Resume work.' }] });
  } });
  const inspected = await request(base, '/api/inspect', { path: project });
  assert.equal(inspected.response.status, 200, JSON.stringify(inspected.body));
  const inspectionId = inspected.body.inspectionId;
  assert.ok(inspectionId);
  const notes = { goal: 'Ship feature', issue: 'Broken test', nextStep: 'Fix test' };
  const preview = await request(base, '/api/handover/preview', { inspectionId, ...notes });
  assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.provider, 'Claude');
  assert.equal(preview.body.context, JSON.stringify({ context: inspected.body.contextPreview, notes }));
  assert.equal(sent, undefined);
  const generated = await request(base, '/api/handover/generate', { previewId: preview.body.previewId });
  assert.equal(generated.response.status, 200, JSON.stringify(generated.body));
  assert.equal(sent, preview.body.context);
  assert.match(generated.body.handover, /Resume work/);
  const created = await request(base, '/api/vaults', { inspectionId, handover: 'Edited by user' });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.handover, 'Edited by user');
  const id = created.body.id;
  assert.ok((await (await fetch(base + '/api/vaults')).json()).some(v => v.id === id));
  const detail = await (await fetch(`${base}/api/vaults/${id}`)).json();
  assert.equal(detail.handover, 'Edited by user');
  assert.deepEqual(detail.checkedFacts.git, inspected.body.git);
  assert.deepEqual(JSON.parse(detail.userNotes), notes);
  assert.equal(detail.aiInterpretation, undefined); // The edited draft is not untouched model output.
  assert.equal((await request(base, `/api/vaults/${id}/verify`, {})).body.ok, true);
  const destination = path.join(root, 'restored-frontend');
  assert.equal((await request(base, `/api/vaults/${id}/restore`, { destination })).response.status, 200);
  assert.equal(await readFile(path.join(destination, 'file.txt'), 'utf8'), 'unfinished work');
  assert.ok((await request(base, '/api/vaults', { inspectionId, handover: 'again' })).response.status >= 400);
});

test('frontend IDs cannot bypass preview, be replayed, or authorize another inspection', async t => {
  const { root, project } = await fixture(t);
  let calls = 0;
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'fixture-key', fetchImpl: async () => {
    calls++; return Response.json({ content: [{ type: 'text', text: 'Draft' }] });
  } });
  const first = (await request(base, '/api/inspect', { path: project })).body.inspectionId;
  const second = (await request(base, '/api/inspect', { path: project })).body.inspectionId;
  assert.notEqual(first, second);
  assert.equal((await request(base, '/api/handover/preview', {})).response.status, 400);
  assert.equal((await request(base, '/api/handover/generate', {})).response.status, 400);
  assert.ok((await request(base, '/api/handover/generate', { previewId: 'forged' })).response.status >= 400);
  assert.ok((await request(base, '/api/vaults', { inspectionId: first, handover: 'forged' })).response.status >= 400);
  assert.ok((await request(base, '/api/handover/preview', { inspectionId: first, goal: {}, issue: '', nextStep: '' })).response.status >= 400);
  const notes = { inspectionId: first, goal: '', issue: '', nextStep: '' };
  const old = (await request(base, '/api/handover/preview', notes)).body.previewId;
  const current = (await request(base, '/api/handover/preview', { ...notes, goal: 'changed' })).body.previewId;
  assert.ok((await request(base, '/api/handover/generate', { previewId: old })).response.status >= 400);
  assert.equal(calls, 0);
  assert.equal((await request(base, '/api/handover/generate', { previewId: current })).response.status, 200);
  assert.ok((await request(base, '/api/handover/generate', { previewId: current })).response.status >= 400);
  assert.ok((await request(base, '/api/vaults', { inspectionId: second, handover: 'forged' })).response.status >= 400);
  await request(base, '/api/handover/preview', notes);
  assert.ok((await request(base, '/api/vaults', { inspectionId: first, handover: 'old draft' })).response.status >= 400);
  assert.equal(calls, 1);
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('frontend rejects same-status file edits before preview, generation, and save', async t => {
  const { root, project } = await fixture(t);
  let calls = 0;
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'fixture-key', fetchImpl: async () => {
    calls++; return Response.json({ content: [{ type: 'text', text: 'Draft' }] });
  } });
  const inspect = async () => (await request(base, '/api/inspect', { path: project })).body.inspectionId;
  const preview = id => request(base, '/api/handover/preview', { inspectionId: id, goal: '', issue: '', nextStep: '' });
  let id = await inspect();
  await writeFile(path.join(project, 'file.txt'), 'different contents 1');
  assert.equal((await preview(id)).response.status, 409);
  id = await inspect();
  let p = await preview(id);
  await writeFile(path.join(project, 'file.txt'), 'different contents 2');
  assert.equal((await request(base, '/api/handover/generate', { previewId: p.body.previewId })).response.status, 409);
  assert.equal(calls, 0);
  id = await inspect(); p = await preview(id);
  assert.equal((await request(base, '/api/handover/generate', { previewId: p.body.previewId })).response.status, 200);
  await writeFile(path.join(project, 'file.txt'), 'different contents 3');
  assert.equal((await request(base, '/api/vaults', { inspectionId: id, handover: 'Draft' })).response.status, 409);
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('frontend rejects project changes during generation and failed upstream calls', async t => {
  const { root, project } = await fixture(t);
  let mode = 'mutate';
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'fixture-key', fetchImpl: async () => {
    if (mode === 'mutate') { await writeFile(path.join(project, 'file.txt'), 'changed during call'); return Response.json({ content: [{ type: 'text', text: 'Draft' }] }); }
    return new Response('private upstream error', { status: 401 });
  } });
  for (const current of ['mutate', 'fail']) {
    mode = current;
    const id = (await request(base, '/api/inspect', { path: project })).body.inspectionId;
    const preview = (await request(base, '/api/handover/preview', { inspectionId: id, goal: '', issue: '', nextStep: '' })).body.previewId;
    const generated = await request(base, '/api/handover/generate', { previewId: preview });
    assert.equal(generated.response.status, mode === 'mutate' ? 409 : 502);
    assert.doesNotMatch(JSON.stringify(generated.body), /private upstream error/);
    assert.ok((await request(base, '/api/handover/generate', { previewId: preview })).response.status >= 400);
    assert.ok((await request(base, '/api/vaults', { inspectionId: id, handover: 'forged' })).response.status >= 400);
  }
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('frontend inspection state expires and oldest inspections are bounded', async t => {
  const { project } = await fixture(t);
  const base = await start(t, { maxInspections: 1, inspectionTtlMs: 1000 });
  const first = (await request(base, '/api/inspect', { path: project })).body.inspectionId;
  const second = (await request(base, '/api/inspect', { path: project })).body.inspectionId;
  const notes = { goal: '', issue: '', nextStep: '' };
  assert.equal((await request(base, '/api/handover/preview', { inspectionId: first, ...notes })).response.status, 404);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await request(base, '/api/handover/preview', { inspectionId: second, ...notes })).response.status, 404);
});

test('in-flight generation cannot be replayed or authorize saving after a newer preview', async t => {
  const { root, project } = await fixture(t);
  let entered, release;
  const enteredUpstream = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const base = await start(t, { vaultRoot: path.join(root, 'vault'), apiKey: 'fixture-key', fetchImpl: async () => {
    entered(); await gate;
    return Response.json({ content: [{ type: 'text', text: 'Old draft' }] });
  } });
  const inspectionId = (await request(base, '/api/inspect', { path: project })).body.inspectionId;
  const input = { inspectionId, goal: 'old', issue: '', nextStep: '' };
  const old = (await request(base, '/api/handover/preview', input)).body.previewId;
  const pending = request(base, '/api/handover/generate', { previewId: old });
  await enteredUpstream;
  assert.ok((await request(base, '/api/handover/generate', { previewId: old })).response.status >= 400);
  const newer = await request(base, '/api/handover/preview', { ...input, goal: 'new' });
  assert.equal(newer.response.status, 200);
  release();
  assert.equal((await pending).response.status, 409);
  assert.ok((await request(base, '/api/vaults', { inspectionId, handover: 'old draft' })).response.status >= 400);
  assert.deepEqual(await (await fetch(base + '/api/vaults')).json(), []);
});

test('actual Vite string proxy forwards requests without weakening Host checks', async t => {
  let createVite;
  try { ({ createServer: createVite } = await import('vite')); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND') return t.skip('Vite frontend dependencies are not installed'); throw error; }
  const { project } = await fixture(t);
  const base = await start(t);
  // The frontend's Vite config uses a string target, not an object proxy config.
  const vite = await createVite({ configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, proxy: { '/api': base } } });
  await vite.listen();
  t.after(() => vite.close());
  const viaVite = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const inspected = await request(viaVite, '/api/inspect', { path: project });
  assert.equal(inspected.response.status, 200, JSON.stringify(inspected.body));
  assert.ok(inspected.body.inspectionId);
});
