import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import * as vault from './vault.mjs';
import { generateHandover } from './claude.mjs';
import { generateTensorxHandover } from './tensorx.mjs';

// The API is intentionally unauthenticated for local non-browser clients.
// Run only on loopback; Host and Origin checks protect against browser attacks,
// not other processes or users on the same machine.
export function getConfig(env = process.env) {
  const provider = env.HANDOVER_PROVIDER ?? 'anthropic';
  return {
    port: Number(env.PORT || 3001),
    vaultRoot: path.resolve(env.VAULT_ROOT || path.join(os.homedir(), '.unfinished-work-vault')),
    provider,
    apiKey: provider === 'anthropic' ? env.ANTHROPIC_API_KEY : provider === 'tensorx' ? env.TENSORX_API_KEY : undefined,
    model: provider === 'anthropic' ? env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' : provider === 'tensorx' ? env.TENSORX_MODEL : undefined,
    workspaceId: provider === 'anthropic' ? env.ANTHROPIC_WORKSPACE_ID : undefined,
  };
}

const fail = (status, message) => Object.assign(new Error(message), { status });
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function ensureCapturable(git) {
  const unstaged = new Set(git.unstaged);
  const overlap = git.staged.filter(file => unstaged.has(file));
  if (overlap.length) throw fail(409, `Files have both staged and unstaged changes: ${overlap.join(', ')}. Resolve this state before capture; Git staging is not restored.`);
}
function withEvidence(record) {
  return { ...record, checkedFacts: { git: record.git, setupEvidence: record.setupEvidence, exclusions: record.exclusions, skipped: record.skipped, fileCount: record.fileCount }, userNotes: record.notes };
}
function requireString(value, name, { empty = false } = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim())) throw fail(400, `${name} must be ${empty ? 'a' : 'a non-empty'} string`);
}
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function readJson(req, maxBytes) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(req.headers['content-type'] || '')) {
    req.resume(); return Promise.reject(fail(415, 'Content-Type must be application/json'));
  }
  if (req.headers['content-length'] && Number(req.headers['content-length']) > maxBytes) {
    req.resume(); return Promise.reject(fail(413, 'JSON request body is too large'));
  }
  return new Promise((resolve, reject) => {
    let size = 0, tooLarge = false; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { tooLarge = true; chunks.length = 0; }
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooLarge) return reject(fail(413, 'JSON request body is too large'));
      let value;
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(fail(400, 'Invalid JSON request body')); }
      if (!isObject(value)) return reject(fail(400, 'JSON body must be an object'));
      resolve(value);
    });
  });
}

export function createServer(options = {}) {
  const config = { ...getConfig({ ...process.env, HANDOVER_PROVIDER: options.provider ?? process.env.HANDOVER_PROVIDER }), ...options };
  function providerName() {
    if (config.provider === 'anthropic') return 'Claude';
    if (config.provider === 'tensorx') return 'TensorX';
    throw fail(503, 'Invalid HANDOVER_PROVIDER. Choose anthropic or tensorx.');
  }
  async function generate(context, notes) {
    const name = providerName();
    if (typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
      throw fail(503, name === 'Claude' ? 'Missing Claude API key. Set ANTHROPIC_API_KEY.' : 'Missing TensorX API key. Set TENSORX_API_KEY.');
    }
    if (config.provider === 'tensorx' && (typeof config.model !== 'string' || !config.model.trim())) {
      throw fail(503, 'Missing TensorX model. Set TENSORX_MODEL.');
    }
    try {
      const args = { context, notes, apiKey: config.apiKey, model: config.model, fetchImpl: config.fetchImpl, timeoutMs: config.timeoutMs };
      return config.provider === 'tensorx' ? await generateTensorxHandover(args) : await generateHandover({ ...args, workspaceId: config.workspaceId });
    } catch (error) {
      if (config.provider !== 'tensorx') throw fail(502, error.message);
      const status = /^TensorX request failed \(HTTP ([1-5]\d\d)\)$/.exec(error.message)?.[1];
      if (status === '401') throw fail(502, 'TensorX authentication failed (HTTP 401); check the API key.');
      if (status === '429') throw fail(502, 'TensorX rate limit reached (HTTP 429); try again later.');
      if (status) throw fail(502, `TensorX API request failed (HTTP ${status}); check model access and provider status.`);
      if (error.message === 'TensorX request timed out') throw fail(502, 'TensorX API request timed out.');
      throw fail(502, 'TensorX API request failed; check the connection and provider response.');
    }
  }
  const maxBytes = config.maxBodyBytes ?? 256 * 1024;
  const frontendOrigins = new Set(config.allowedOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173']);
  // Cap both count and bytes; all state is process-local and expires, including drafts.
  const inspections = new Map();
  const ttl = config.inspectionTtlMs ?? 15 * 60 * 1000;
  const maxSessions = config.maxInspections ?? 100;
  const maxStateBytes = 32 * 1024 * 1024;
  function purge() {
    const now = Date.now();
    for (const [id, state] of inspections) if (state.expires <= now) inspections.delete(id);
  }
  function getInspection(id) {
    requireString(id, 'inspectionId'); purge();
    const state = inspections.get(id);
    if (!state) throw fail(404, 'Inspection not found or expired; inspect again');
    return state;
  }
  function valid(id, state, revision) {
    purge();
    if (inspections.get(id) !== state || state.revision !== revision) throw fail(409, 'Review expired or changed; prepare a new preview');
  }
  async function checkReviewed(state) {
    const current = await vault.inspectProject(state.projectPath);
    if (!isDeepStrictEqual(state.context, current.contextPreview) || !isDeepStrictEqual(state.capturePreview, current.capturePreview)) throw fail(409, 'Project context or capture preview changed; inspect and review again');
  }
  const server = http.createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const host = req.headers.host;
      if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) throw fail(403, 'Invalid Host header');
      const origin = req.headers.origin;
      const sameOrigin = origin === `http://${host}`;
      if (origin && !sameOrigin && !frontendOrigins.has(origin)) throw fail(403, 'Origin not allowed');
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        if (!origin || !['GET', 'POST', 'PATCH'].includes(req.headers['access-control-request-method'])) throw fail(400, 'Invalid preflight');
        const headers = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if (headers.some(h => h !== 'content-type')) throw fail(403, 'Preflight headers not allowed');
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PATCH', 'Access-Control-Allow-Headers': 'Content-Type' }); res.end(); return;
      }
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (req.method === 'POST' && pathname === '/api/inspect') {
        const body = await readJson(req, maxBytes);
        const projectPath = body.projectPath ?? body.path;
        requireString(projectPath, 'projectPath');
        const inspected = await vault.inspectProject(projectPath);
        const state = { projectPath: inspected.projectPath, context: inspected.contextPreview, capturePreview: inspected.capturePreview, expires: Date.now() + ttl, revision: 0, phase: 'inspected' };
        const bytes = Buffer.byteLength(JSON.stringify(state));
        if (bytes > maxStateBytes / 2) throw fail(413, 'Inspection is too large to review');
        state.bytes = bytes + maxBytes;
        purge();
        let used = [...inspections.values()].reduce((sum, item) => sum + item.bytes, 0);
        while (inspections.size >= maxSessions || used + state.bytes > maxStateBytes) {
          const oldest = inspections.keys().next().value;
          if (!oldest) throw fail(503, 'Inspection capacity unavailable');
          used -= inspections.get(oldest).bytes; inspections.delete(oldest);
        }
        const inspectionId = randomUUID(); inspections.set(inspectionId, state);
        return json(res, 200, { ...inspected, inspectionId });
      }
      if (req.method === 'POST' && pathname === '/api/handover/preview') {
        const body = await readJson(req, maxBytes);
        const state = getInspection(body.inspectionId);
        if (state.phase === 'saving') throw fail(409, 'Save in progress');
        const revision = ++state.revision;
        state.phase = 'inspected'; delete state.previewId; delete state.notes;
        for (const key of ['goal', 'issue', 'nextStep']) requireString(body[key], key, { empty: true });
        const notes = { goal: body.goal, issue: body.issue, nextStep: body.nextStep };
        await checkReviewed(state); valid(body.inspectionId, state, revision);
        ensureCapturable(state.context.git);
        const previewId = randomUUID();
        state.notes = notes; state.previewId = previewId; state.phase = 'preview';
        return json(res, 200, { previewId, provider: providerName(), context: JSON.stringify({ context: state.context, notes }) });
      }
      if (req.method === 'POST' && pathname === '/api/handover/generate') {
        const body = await readJson(req, maxBytes);
        requireString(body.previewId, 'previewId'); purge();
        const found = [...inspections].find(([, item]) => item.phase === 'preview' && item.previewId === body.previewId);
        if (!found) throw fail(404, 'Preview not found, already used, or expired');
        const [inspectionId, state] = found, revision = state.revision;
        state.phase = 'generating'; delete state.previewId;
        try {
          await checkReviewed(state); valid(inspectionId, state, revision);
          const handover = await generate(state.context, state.notes);
          await checkReviewed(state); valid(inspectionId, state, revision);
          state.phase = 'generated';
          return json(res, 200, { handover });
        } catch (error) {
          if (inspections.get(inspectionId) === state && state.revision === revision) { state.phase = 'inspected'; delete state.notes; }
          throw error;
        }
      }
      if (req.method === 'POST' && pathname === '/api/vaults') {
        const body = await readJson(req, maxBytes);
        if (Object.hasOwn(body, 'inspectionId')) {
          const state = getInspection(body.inspectionId);
          requireString(body.handover, 'handover', { empty: true });
          if (state.phase !== 'generated') throw fail(409, 'Generate a handover from a reviewed preview before saving');
          state.phase = 'saving'; const revision = state.revision;
          try {
            await checkReviewed(state); valid(body.inspectionId, state, revision);
            const record = await vault.createSnapshot({ projectPath: state.projectPath, vaultRoot: config.vaultRoot, notes: JSON.stringify(state.notes), handover: body.handover, expectedContext: state.context, expectedCapturePreview: state.capturePreview });
            inspections.delete(body.inspectionId);
            return json(res, 201, { ...withEvidence(record), nextStep: state.notes.nextStep });
          } catch (error) {
            if (inspections.get(body.inspectionId) === state) inspections.delete(body.inspectionId);
            throw error;
          }
        }
        requireString(body.projectPath, 'projectPath');
        requireString(body.notes, 'notes', { empty: true });
        if (body.confirmed !== true || !isObject(body.context) || !isObject(body.capturePreview)) throw fail(400, 'Explicit confirmation and reviewed context and capture preview are required');
        const inspected = await vault.inspectProject(body.projectPath);
        if (!isDeepStrictEqual(body.context, inspected.contextPreview) || !isDeepStrictEqual(body.capturePreview, inspected.capturePreview)) throw fail(409, 'Project context or capture preview changed; inspect and review again');
        ensureCapturable(inspected.git);
        const handover = await generate(body.context, body.notes);
        const current = await vault.inspectProject(body.projectPath);
        if (!isDeepStrictEqual(body.context, current.contextPreview) || !isDeepStrictEqual(body.capturePreview, current.capturePreview)) throw fail(409, 'Project context or capture preview changed; inspect and review again');
        const record = await vault.createSnapshot({ projectPath: body.projectPath, vaultRoot: config.vaultRoot, notes: body.notes, handover, expectedContext: body.context, expectedCapturePreview: body.capturePreview });
        return json(res, 201, record);
      }
      if (req.method === 'GET' && pathname === '/api/vaults') return json(res, 200, await vault.listVaults(config.vaultRoot));
      const match = pathname.match(/^\/api\/vaults\/([^/]+)(?:\/(verify|restore))?$/);
      if (match) {
        let id; try { id = decodeURIComponent(match[1]); } catch { throw fail(400, 'Invalid vault ID'); }
        const operation = match[2];
        if (req.method === 'GET' && !operation) return json(res, 200, withEvidence(await vault.getVault(config.vaultRoot, id)));
        if (req.method === 'PATCH' && !operation) {
          const body = await readJson(req, maxBytes); requireString(body.handover, 'handover', { empty: true });
          return json(res, 200, await vault.updateHandover(config.vaultRoot, id, body.handover));
        }
        if (req.method === 'POST' && operation === 'verify') {
          await readJson(req, maxBytes);
          return json(res, 200, await vault.verifySnapshot(config.vaultRoot, id));
        }
        if (req.method === 'POST' && operation === 'restore') {
          const body = await readJson(req, maxBytes); requireString(body.destination, 'destination');
          return json(res, 200, await vault.restoreSnapshot(config.vaultRoot, id, body.destination));
        }
      }
      throw fail(404, 'Endpoint not found');
    } catch (error) {
      if (!res.headersSent) json(res, Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500, { error: error.status ? error.message : 'Internal server error' });
      else res.destroy();
    }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = getConfig();
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be between 1 and 65535');
  createServer(config).listen(config.port, '127.0.0.1', () => console.log(`Vault API listening on http://127.0.0.1:${config.port}`));
}
