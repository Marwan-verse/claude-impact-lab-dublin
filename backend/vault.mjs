import path from 'node:path';
import { lstat, mkdir, readdir, readFile, writeFile, open, rm, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';

const exec = promisify(execFile);
const EXCLUSIONS = ['Git-ignored untracked files', '.git', '.env and .env.*', 'node_modules', 'vendor', 'venv', '.venv', 'env', '__pycache__', 'dist', 'build', 'target', '.next', '.nuxt', '.output', '.cache', '.pytest_cache', '.mypy_cache', '.turbo', '.gradle', '.tox', 'coverage', 'symlinks and special files'];
const SETUP = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'Cargo.toml', 'go.mod', 'Gemfile', 'Dockerfile', 'docker-compose.yml', 'Makefile', 'README.md', '.env.example'];
function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
async function safeExisting(p) {
  if (typeof p !== 'string' || !p.trim() || !path.isAbsolute(p)) throw error('Path must be an absolute path');
  p = path.resolve(p);
  const parts = p.slice(path.parse(p).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(p).root;
  for (const part of parts) {
    current = path.join(current, part);
    let st;
    try { st = await lstat(current); } catch (e) { if (e.code === 'ENOENT') throw error(`Path does not exist: ${current}`, 404); throw e; }
    if (st.isSymbolicLink()) throw error(`Symlink paths are not allowed: ${current}`);
  }
  return p;
}
async function git(cwd, ...args) {
  try { return (await exec('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 10000, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' } })).stdout; }
  catch (e) { throw error(`Git inspection failed: ${e.stderr?.trim() || e.message}`, 400); }
}

// Configured clean/process filters can run shell commands during status. Even
// disabling them silently would produce incorrect status for transformed files.
async function safeStatus(project) {
  const config = await git(project, 'config', '--null', '--list', '--includes');
  const filters = new Set();
  for (const record of config.split('\0')) {
    if (!record) continue;
    const separator = record.indexOf('\n');
    const key = separator < 0 ? record : record.slice(0, separator);
    const match = /^filter\.(.+)\.(clean|process)$/i.exec(key);
    if (match && (separator < 0 || record.slice(separator + 1))) filters.add(match[1]);
  }
  if (filters.size > 128 || [...filters].some(name => !/^[a-zA-Z0-9_-]+$/.test(name))) throw error('Git filter configuration is too complex for safe inspection');
  const index = await git(project, 'ls-files', '--stage', '-z');
  if (index.split('\0').some(record => record.startsWith('160000 '))) throw error('Git submodules cannot be inspected safely');
  if (filters.size) {
    // Attribute evaluation is passive; check tracked paths before disabling
    // filters, so we never return misleading status for a filtered file.
    const paths = index.split('\0').filter(Boolean).map(record => record.slice(record.indexOf('\t') + 1));
    let attrs = '';
    try {
      attrs = await new Promise((resolve, reject) => {
        const child = execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', project, 'check-attr', '-z', '--stdin', 'filter'], { maxBuffer: 16 * 1024 * 1024, timeout: 10000, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1' } }, (e, stdout) => e ? reject(e) : resolve(stdout));
        child.stdin.on('error', reject);
        child.stdin.end(paths.length ? paths.join('\0') + '\0' : '');
      });
    } catch { throw error('Could not safely inspect Git filter attributes'); }
    const fields = attrs.split('\0');
    if (fields.length !== paths.length * 3 + 1) throw error('Could not safely inspect Git filter attributes');
    for (let i = 0; i < fields.length - 1; i += 3) {
      if (filters.has(fields[i + 2])) throw error('Git filter is active on tracked files; safe status cannot be guaranteed');
    }
  }
  const overrides = [...filters].flatMap(name => ['-c', `filter.${name}.clean=`, '-c', `filter.${name}.process=`, '-c', `filter.${name}.required=false`]);
  return git(project, ...overrides, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all');
}
export async function inspectProject(projectPath) {
  const project = await safeExisting(projectPath);
  if (!(await lstat(project)).isDirectory()) throw error('Project must be a directory');
  const top = (await git(project, 'rev-parse', '--show-toplevel')).trim();
  if (path.resolve(top) !== project) throw error('Select the Git repository root');
  const branch = (await git(project, 'branch', '--show-current')).trim() || null;
  let commit = null;
  try { commit = (await git(project, 'rev-parse', '--verify', 'HEAD')).trim(); } catch (e) { if (!/Needed a single revision|unknown revision|ambiguous argument/i.test(e.message)) throw e; }
  const records = (await safeStatus(project)).split('\0');
  const state = { branch, commit, staged: [], unstaged: [], untracked: [] };
  for (let i = 0; i < records.length; i++) {
    const r = records[i]; if (!r) continue;
    const xy = r.slice(0, 2), name = r.slice(3);
    if (xy === '??') state.untracked.push(name);
    else { if (xy[0] !== ' ' && xy[0] !== '?') state.staged.push(name); if (xy[1] !== ' ' && xy[1] !== '?') state.unstaged.push(name); }
    if (xy.includes('R') || xy.includes('C')) i++;
  }
  const setupEvidence = [];
  for (const name of SETUP) { try { const st = await lstat(path.join(project, name)); if (st.isFile()) setupEvidence.push(name); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  const result = { projectPath: project, projectName: path.basename(project), git: state, exclusions: EXCLUSIONS, setupEvidence, limitations: LIMITATIONS };
  const capturePreview = await walk(project, { filter: true });
  return { ...result, capturePreview, contextPreview: { projectName: result.projectName, git: state, exclusions: EXCLUSIONS, setupEvidence } };
}

const LIMITATIONS = [
  'Only permitted working-tree files are captured; Git history and Git index or staging are not restored.',
  'Git-ignored untracked files and named exclusions are skipped. Arbitrary tracked or unignored secrets cannot be detected automatically; review files before capture.',
  'Empty directories are not captured or restored.',
  'Credentials, environment variables, installed dependencies and running processes are not restored.',
  'Repositories with active configured Git clean/process filters or submodules cannot be inspected safely; inspection rejects them.',
  'Integrity checks do not prove that the application runs. Concurrent filesystem changes, including Git configuration or attributes, are not supported.'
];
const EXCLUDED_NAMES = new Set(EXCLUSIONS.filter(name => !name.includes(' ') && name !== '.env and .env.*'));
function excluded(name) { return EXCLUDED_NAMES.has(name.toLowerCase()) || /^\.env(?:\.|$)/i.test(name); }
function isWithin(child, parent) { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); }
function validateId(id) { if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw error('Invalid vault ID'); }
function validateRelative(p) {
  if (typeof p !== 'string' || !p || p.includes('\\') || p.includes('\0') || p.startsWith('/') || p.split('/').some(x => !x || x === '.' || x === '..' || excluded(x))) throw error('Unsafe manifest path');
}
async function ensureDir(p) {
  if (typeof p !== 'string' || !p.trim() || !path.isAbsolute(p)) throw error('Path must be an absolute path');
  p = path.resolve(p);
  let cur = path.parse(p).root;
  for (const component of p.slice(cur.length).split(path.sep).filter(Boolean)) {
    cur = path.join(cur, component);
    try { await mkdir(cur, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const st = await lstat(cur);
    if (st.isSymbolicLink() || !st.isDirectory()) throw error(`Not a safe directory: ${cur}`);
  }
  return p;
}
async function readRegular(file) {
  const fd = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try { const st = await fd.stat(); if (!st.isFile()) throw error(`Not a regular file: ${file}`); return await fd.readFile(); }
  finally { await fd.close(); }
}
function hash(data) { return createHash('sha256').update(data).digest('hex'); }
async function walk(root, { filter = false } = {}) {
  const files = [], skipped = [], fileHashes = [];
  const ignored = filter ? new Set((await git(root, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z')).split('\0').filter(Boolean)) : new Set();
  async function visit(dir, prefix) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (filter && (excluded(entry.name) || ignored.has(rel))) { skipped.push(rel); continue; }
      const full = path.join(dir, entry.name), st = await lstat(full);
      if (st.isSymbolicLink() || (!st.isDirectory() && !st.isFile())) { skipped.push(rel); continue; }
      if (st.isDirectory()) await visit(full, rel);
      else {
        files.push(rel);
        if (filter) { await safeExisting(full); fileHashes.push({ path: rel, sha256: hash(await readRegular(full)) }); }
      }
    }
  }
  await visit(root, ''); return filter ? { files, skipped, fileHashes } : { files, skipped };
}
async function readJsonSafe(file) {
  await safeExisting(file);
  try { return JSON.parse(await readRegular(file)); } catch (e) { if (e instanceof SyntaxError) throw error(`Invalid JSON: ${file}`); throw e; }
}
async function vaultDir(root, id) {
  validateId(id); root = await safeExisting(root);
  const dir = path.join(root, id); await safeExisting(dir);
  if (!(await lstat(dir)).isDirectory()) throw error('Invalid vault directory');
  return dir;
}
export async function createSnapshot({ projectPath, vaultRoot, notes = '', handover = '', expectedCapturePreview, expectedContext }) {
  const inspection = await inspectProject(projectPath), project = inspection.projectPath;
  if ((expectedCapturePreview && !isDeepStrictEqual(expectedCapturePreview, inspection.capturePreview)) || (expectedContext && !isDeepStrictEqual(expectedContext, inspection.contextPreview))) throw error('Project preview changed; inspect and review again', 409);
  const unstaged = new Set(inspection.git.unstaged);
  const overlap = inspection.git.staged.filter(p => unstaged.has(p));
  if (overlap.length) throw error(`Files have both staged and unstaged changes: ${overlap.join(', ')}. Resolve this state before capture; Git staging is not restored.`, 409);
  if (typeof vaultRoot !== 'string' || !path.isAbsolute(vaultRoot)) throw error('Vault root must be an absolute path');
  const root = path.resolve(vaultRoot);
  if (isWithin(root, project) || isWithin(project, root)) throw error('Vault and project must not contain one another');
  if (typeof notes !== 'string' || typeof handover !== 'string') throw error('Notes and handover must be strings');
  await ensureDir(root);
  const id = randomUUID(), dir = path.join(root, id);
  await mkdir(dir, { mode: 0o700 });
  try {
    const filesRoot = path.join(dir, 'files'); await mkdir(filesRoot, { mode: 0o700 });
    const currentPreview = await walk(project, { filter: true });
    const { files, skipped, fileHashes } = currentPreview;
    if (!isDeepStrictEqual(inspection.capturePreview, currentPreview)) throw error('Project preview changed; inspect and review again', 409);
    const reviewedHashes = new Map(fileHashes.map(f => [f.path, f.sha256]));
    const manifest = { version: 1, files: [] };
    for (const rel of files) {
      validateRelative(rel); const source = path.join(project, ...rel.split('/'));
      await safeExisting(source); const data = await readRegular(source), st = await lstat(source);
      if (hash(data) !== reviewedHashes.get(rel)) throw error(`Project preview changed during capture: ${rel}; inspect and review again`, 409);
      const dest = path.join(filesRoot, ...rel.split('/')); await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
      await writeFile(dest, data, { flag: 'wx', mode: st.mode & 0o777 });
      manifest.files.push({ path: rel, size: data.length, sha256: hash(data), mode: st.mode & 0o777 });
    }
    const finalInspection = await inspectProject(project);
    if (!isDeepStrictEqual(inspection.capturePreview, finalInspection.capturePreview) || !isDeepStrictEqual(inspection.contextPreview, finalInspection.contextPreview)) throw error('Project preview changed during capture; inspect and review again', 409);
    const metadata = { id, createdAt: new Date().toISOString(), projectPath: project, projectName: inspection.projectName, git: inspection.git, setupEvidence: inspection.setupEvidence, exclusions: inspection.exclusions, skipped, notes, handover, limitations: LIMITATIONS, fileCount: manifest.files.length };
    await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), { flag: 'wx', mode: 0o600 });
    const checked = await verifySnapshot(root, id); if (!checked.ok) throw error(`Snapshot verification failed: ${checked.issues.join('; ')}`);
    return metadata;
  } catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
}
export async function getVault(vaultRoot, id) {
  const dir = await vaultDir(vaultRoot, id);
  const metadata = await readJsonSafe(path.join(dir, 'metadata.json'));
  if (!metadata || metadata.id !== id) throw error('Invalid vault metadata');
  const manifest = await readJsonSafe(path.join(dir, 'manifest.json'));
  return { ...metadata, manifest };
}
export async function listVaults(vaultRoot) {
  if (typeof vaultRoot !== 'string' || !path.isAbsolute(vaultRoot)) throw error('Vault root must be an absolute path');
  try { await safeExisting(vaultRoot); } catch (e) { if (e.status === 404) return []; throw e; }
  const entries = await readdir(vaultRoot, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(entry.name)) continue;
    result.push(await getVault(vaultRoot, entry.name));
  }
  return result.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function updateHandover(vaultRoot, id, handover) {
  if (typeof handover !== 'string') throw error('Handover must be a string');
  const dir = await vaultDir(vaultRoot, id), metadata = await readJsonSafe(path.join(dir, 'metadata.json'));
  if (!metadata || metadata.id !== id) throw error('Invalid vault metadata');
  metadata.handover = handover;
  const temp = path.join(dir, `.metadata-${randomUUID()}.tmp`);
  try { await writeFile(temp, JSON.stringify(metadata, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temp, path.join(dir, 'metadata.json')); }
  finally { await rm(temp, { force: true }); }
  return getVault(vaultRoot, id);
}
export async function verifySnapshot(vaultRoot, id) {
  const dir = await vaultDir(vaultRoot, id), manifest = await readJsonSafe(path.join(dir, 'manifest.json'));
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files)) throw error('Invalid manifest');
  const expected = new Map();
  for (const f of manifest.files) {
    if (!f || typeof f !== 'object') throw error('Invalid manifest entry');
    validateRelative(f.path);
    if (expected.has(f.path) || !Number.isSafeInteger(f.size) || f.size < 0 || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isInteger(f.mode) || f.mode < 0 || f.mode > 0o777) throw error('Invalid manifest entry');
    expected.set(f.path, f);
  }
  const root = path.join(dir, 'files'); await safeExisting(root);
  const { files, skipped } = await walk(root), found = new Set(files), issues = skipped.map(p => `Unsafe or special file: ${p}`);
  for (const p of files) if (!expected.has(p)) issues.push(`Extra file: ${p}`);
  for (const [p, f] of expected) {
    if (!found.has(p)) { issues.push(`Missing file: ${p}`); continue; }
    await safeExisting(path.join(root, ...p.split('/')));
    const data = await readRegular(path.join(root, ...p.split('/')));
    if (data.length !== f.size || hash(data) !== f.sha256) issues.push(`Changed file: ${p}`);
  }
  return { ok: issues.length === 0, issues, checkedFiles: expected.size };
}
function resumeNote(record) {
  let notes = record.notes;
  try { const n = JSON.parse(notes); if (n && typeof n === 'object') notes = [['What you were working on', n.goal], ['Unresolved', n.issue], ['Next step', n.nextStep]].filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`).join('\n'); } catch {}
  const git = record.git || {};
  return [`# Resume: ${record.projectName}`, '',
    `Restored by The Unfinished Work Vault from a snapshot saved ${record.createdAt}.`,
    `Original project: \`${record.projectPath}\` (branch \`${git.branch ?? 'unknown'}\`, commit \`${git.commit ?? 'unknown'}\`).`, '',
    '## Your notes', '', notes || '_None._', '',
    '## Handover', '', record.handover || '_None saved._', '',
    '## Not restored', '', ...LIMITATIONS.map(l => `- ${l}`), ''].join('\n');
}
export async function restoreSnapshot(vaultRoot, id, destination) {
  const record = await getVault(vaultRoot, id), verified = await verifySnapshot(vaultRoot, id);
  if (!verified.ok) throw error(`Snapshot verification failed: ${verified.issues.join('; ')}`, 409);
  if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw error('Destination must be an absolute path');
  destination = path.resolve(destination);
  if (isWithin(destination, record.projectPath) || isWithin(destination, path.resolve(vaultRoot))) throw error('Destination cannot be inside the source or vault');
  await safeExisting(path.dirname(destination));
  try { await mkdir(destination, { mode: 0o700 }); } catch (e) { if (e.code === 'EEXIST') throw error('Destination already exists', 409); throw e; }
  try {
    const root = path.join(await vaultDir(vaultRoot, id), 'files');
    for (const f of record.manifest.files) {
      validateRelative(f.path); const source = path.join(root, ...f.path.split('/'));
      await safeExisting(source); const data = await readRegular(source);
      if (data.length !== f.size || hash(data) !== f.sha256) throw error(`Snapshot changed during restore: ${f.path}`, 409);
      const target = path.join(destination, ...f.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, data, { flag: 'wx', mode: f.mode });
    }
    const taken = new Set(record.manifest.files.map(f => f.path));
    const resumeFile = taken.has('VAULT-RESUME.md') ? `VAULT-RESUME-${id.slice(0, 8)}.md` : 'VAULT-RESUME.md';
    if (taken.has(resumeFile)) throw error('Cannot write resume note: file name already in snapshot', 409);
    await writeFile(path.join(destination, resumeFile), resumeNote(record), { flag: 'wx', mode: 0o600 });
    return { destination, restoredFiles: record.manifest.files.length, resumeFile, limitations: LIMITATIONS, handover: record.handover };
  } catch (e) { await rm(destination, { recursive: true, force: true }); throw e; }
}
