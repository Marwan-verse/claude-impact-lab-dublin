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
export async function createSnapshot({ projectPath, vaultRoot, notes = '', handover = '', expectedCapturePreview, expectedContext, excludedFiles = [] }) {
  const inspection = await inspectProject(projectPath), project = inspection.projectPath;
  if (!Array.isArray(excludedFiles) || excludedFiles.some(p => typeof p !== 'string' || !inspection.capturePreview.files.includes(p)) || new Set(excludedFiles).size !== excludedFiles.length) throw error('Selected exclusions must be unique files from the reviewed preview');
  const selectedExclusions = new Set(excludedFiles);
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
      if (selectedExclusions.has(rel)) continue;
      validateRelative(rel); const source = path.join(project, ...rel.split('/'));
      await safeExisting(source); const data = await readRegular(source), st = await lstat(source);
      if (hash(data) !== reviewedHashes.get(rel)) throw error(`Project preview changed during capture: ${rel}; inspect and review again`, 409);
      const dest = path.join(filesRoot, ...rel.split('/')); await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
      await writeFile(dest, data, { flag: 'wx', mode: st.mode & 0o777 });
      manifest.files.push({ path: rel, size: data.length, sha256: hash(data), mode: st.mode & 0o777 });
    }
    const finalInspection = await inspectProject(project);
    if (!isDeepStrictEqual(inspection.capturePreview, finalInspection.capturePreview) || !isDeepStrictEqual(inspection.contextPreview, finalInspection.contextPreview)) throw error('Project preview changed during capture; inspect and review again', 409);
    const metadata = { id, createdAt: new Date().toISOString(), projectPath: project, projectName: inspection.projectName, git: inspection.git, setupEvidence: inspection.setupEvidence, exclusions: inspection.exclusions, skipped: [...skipped, ...excludedFiles], selectedExclusions: excludedFiles, notes, handover, limitations: LIMITATIONS, fileCount: manifest.files.length };
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

// Project-level notes and status are kept separately from immutable snapshots.
const projectWrites = new Map();
function projectKey(projectPath) {
  const normalized = path.resolve(projectPath);
  return hash(Buffer.from(process.platform === 'win32' ? normalized.toLowerCase() : normalized));
}
export async function getProjectData(root, projectPath) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || typeof projectPath !== 'string' || !path.isAbsolute(projectPath)) throw error('Absolute project and vault paths required');
  const file = path.join(root, 'projects', `${projectKey(projectPath)}.json`);
  try {
    const data = await readJsonSafe(file);
    if (!data || data.version !== 1 || projectKey(data.projectPath) !== projectKey(projectPath)) throw error('Invalid project data');
    return data;
  } catch (e) { if (e.status === 404 || e.code === 'ENOENT') return { version: 1, projectPath: path.resolve(projectPath), status: 'work-in-progress', journal: [], links: [], checklists: {} }; throw e; }
}
export async function updateProjectData(root, projectPath, change) {
  const key = `${path.resolve(root)}:${projectKey(projectPath)}`;
  const previous = projectWrites.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const data = await getProjectData(root, projectPath);
    if (change.kind === 'status') {
      if (!['work-in-progress', 'done', 'abandoned'].includes(change.status)) throw error('Invalid project status');
      data.status = change.status;
    } else if (change.kind === 'journal') {
      const fields = ['hypothesis', 'approach', 'evidence', 'result', 'question'];
      if (fields.some(k => typeof change[k] !== 'string' || change[k].length > 5000) || !fields.some(k => change[k].trim())) throw error('Enter at least one journal field; each must be under 5000 characters');
      if (data.journal.length >= 500) throw error('Journal is full');
      data.journal.push({ id: randomUUID(), snapshotId: change.snapshotId, createdAt: new Date().toISOString(), ...Object.fromEntries(fields.map(k => [k, change[k]])) });
    } else if (change.kind === 'link') {
      if (typeof change.issue !== 'string' || !change.issue.trim() || change.issue.length > 500 || typeof change.file !== 'string' || !change.file || change.file.length > 2000) throw error('A short issue and captured file are required');
      if (data.links.length >= 500) throw error('Context map is full');
      data.links.push({ id: randomUUID(), snapshotId: change.snapshotId, issue: change.issue, file: change.file, createdAt: new Date().toISOString() });
    } else if (change.kind === 'checklist') {
      validateId(change.snapshotId);
      if (!Array.isArray(change.completed) || change.completed.length > 20 || change.completed.some(x => !['review', 'restore', 'setup', 'environment', 'verify'].includes(x))) throw error('Invalid checklist');
      data.checklists[change.snapshotId] = [...new Set(change.completed)];
    } else throw error('Invalid project update');
    const dir = await ensureDir(path.join(root, 'projects'));
    const file = path.join(dir, `${projectKey(projectPath)}.json`), temp = path.join(dir, `.project-${randomUUID()}.tmp`);
    try { await writeFile(temp, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temp, file); }
    finally { await rm(temp, { force: true }); }
    return data;
  });
  projectWrites.set(key, operation);
  try { return await operation; } finally { if (projectWrites.get(key) === operation) projectWrites.delete(key); }
}

export async function compareVaults(root, firstId, secondId) {
  const [first, second, firstCheck, secondCheck] = await Promise.all([getVault(root, firstId), getVault(root, secondId), verifySnapshot(root, firstId), verifySnapshot(root, secondId)]);
  if (projectKey(first.projectPath) !== projectKey(second.projectPath)) throw error('Choose snapshots from the same project');
  if (!firstCheck.ok || !secondCheck.ok) throw error('Both snapshots must pass integrity checks', 409);
  const before = new Map(first.manifest.files.map(f => [f.path, f.sha256]));
  const after = new Map(second.manifest.files.map(f => [f.path, f.sha256]));
  return { added: [...after.keys()].filter(p => !before.has(p)), removed: [...before.keys()].filter(p => !after.has(p)), changed: [...before.keys()].filter(p => after.has(p) && before.get(p) !== after.get(p)), note: 'Compares captured files; differences can reflect the capture selections as well as project changes.' };
}

export async function contextMap(root, id) {
  const record = await getVault(root, id), check = await verifySnapshot(root, id);
  if (!check.ok) throw error('Snapshot verification failed', 409);
  let commits = [], commitWarning = '';
  try {
    const project = await safeExisting(record.projectPath);
    const top = (await git(project, 'rev-parse', '--show-toplevel')).trim();
    if (path.resolve(top) !== project) throw error('Original project is no longer the Git root');
    const lines = await git(project, 'log', '-5', '--format=%H%x09%s');
    commits = lines.trim().split('\n').filter(Boolean).map(line => { const [commit, ...subject] = line.split('\t'); return { commit, subject: subject.join('\t') }; });
  } catch { commitWarning = 'Recent commits unavailable from the original project.'; }
  const files = record.manifest.files.map(f => f.path);
  let issue = '';
  try { const notes = JSON.parse(record.notes); if (typeof notes?.issue === 'string') issue = notes.issue; } catch {}
  const stopwords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'what', 'when', 'where', 'issue', 'broken', 'failing', 'does', 'not', 'need', 'fix']);
  const terms = [...new Set((issue.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !stopwords.has(word)))];
  const suggestedLinks = files.map(file => {
    const words = new Set(file.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const matched = terms.filter(term => words.has(term));
    return { file, matched };
  }).filter(suggestion => suggestion.matched.length).slice(0, 30);
  return { files, tests: files.filter(f => /(^|\/)(__tests__|tests?)(\/|\.)|\.(test|spec)\./i.test(f)), changes: record.git, setup: record.setupEvidence || [], commits, commitWarning, issue, suggestedLinks, links: (await getProjectData(root, record.projectPath)).links.filter(l => l.snapshotId === id) };
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

// Compare only files eligible for capture, without exposing file contents.
export async function compareSnapshot(vaultRoot, id) {
  const record = await getVault(vaultRoot, id);
  const integrity = await verifySnapshot(vaultRoot, id);
  if (!integrity.ok) throw error('Snapshot verification failed; comparison is unavailable', 409);
  const current = await inspectProject(record.projectPath);
  const before = new Map(record.manifest.files.map(f => [f.path, f.sha256]));
  const omitted = new Set(record.selectedExclusions || []);
  const now = new Map(current.capturePreview.fileHashes.filter(f => !omitted.has(f.path)).map(f => [f.path, f.sha256]));
  return { added: [...now.keys()].filter(p => !before.has(p)), missing: [...before.keys()].filter(p => !now.has(p)), changed: [...before.keys()].filter(p => now.has(p) && before.get(p) !== now.get(p)), currentGit: current.git, note: 'Compares eligible file contents only; intentionally excluded and ignored files are not compared.' };
}

export async function recoveryConfidence(vaultRoot, id) {
  const record = await getVault(vaultRoot, id);
  const integrity = await verifySnapshot(vaultRoot, id);
  const files = new Set(record.manifest.files.map(f => f.path));
  const setup = (record.setupEvidence || []).map(name => ({ name, captured: files.has(name) }));
  return { integrity, setup, limitations: ['Dependencies, credentials and environment variables are not captured or restored.', 'A matching snapshot does not prove the project runs; review setup instructions and install dependencies yourself.'] };
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

// Export is an explicit local copy, never a network transfer. The manifest
// allows a recipient to inspect the captured file hashes independently.
export async function exportHandoff(vaultRoot, id, destination) {
  const record = await getVault(vaultRoot, id);
  const result = await restoreSnapshot(vaultRoot, id, destination);
  const occupied = new Set(record.manifest.files.map(f => f.path));
  let name = `VAULT-MANIFEST-${id}.json`;
  while (occupied.has(name) || name === result.resumeFile) name = `_${name}`;
  await writeFile(path.join(result.destination, name), JSON.stringify(record.manifest, null, 2), { flag: 'wx', mode: 0o600 });
  let descriptorFile = `VAULT-HANDOFF-${id}.json`;
  while (occupied.has(descriptorFile) || descriptorFile === result.resumeFile || descriptorFile === name) descriptorFile = `_${descriptorFile}`;
  const project = await getProjectData(vaultRoot, record.projectPath);
  const descriptor = { version: 1, snapshotId: id, projectName: record.projectName, createdAt: record.createdAt, manifestFile: name, resumeFile: result.resumeFile, journal: project.journal.filter(entry => entry.snapshotId === id), links: project.links.filter(link => link.snapshotId === id) };
  await writeFile(path.join(result.destination, descriptorFile), JSON.stringify(descriptor, null, 2), { flag: 'wx', mode: 0o600 });
  return { ...result, manifestFile: name, descriptorFile, note: 'This folder includes captured files, a resume note and file hashes. Review it for sensitive information before sharing.' };
}

export async function reviewHandoff(folder) {
  const root = await safeExisting(folder);
  if (!(await lstat(root)).isDirectory()) throw error('Handoff must be a folder');
  const entries = await readdir(root);
  const descriptors = entries.filter(n => /^_*VAULT-HANDOFF-[0-9a-f-]{36}\.json$/i.test(n));
  if (descriptors.length !== 1) throw error('Expected one Vault handoff descriptor');
  async function limitedJson(name, limit) {
    const file = path.join(root, name); await safeExisting(file);
    const st = await lstat(file); if (!st.isFile() || st.size > limit) throw error('Handoff metadata is invalid or too large');
    return readJsonSafe(file);
  }
  const descriptor = await limitedJson(descriptors[0], 16 * 1024 * 1024);
  if (!descriptor || descriptor.version !== 1) throw error('Invalid handoff descriptor');
  validateId(descriptor.snapshotId);
  if (typeof descriptor.projectName !== 'string' || typeof descriptor.createdAt !== 'string' || !Array.isArray(descriptor.journal ?? []) || !Array.isArray(descriptor.links ?? []) || (descriptor.journal ?? []).length > 500 || (descriptor.links ?? []).length > 500) throw error('Invalid handoff context');
  for (const entry of descriptor.journal ?? []) if (!entry || ['hypothesis','approach','evidence','result','question'].some(key => typeof entry[key] !== 'string')) throw error('Invalid handoff journal');
  for (const link of descriptor.links ?? []) if (!link || typeof link.issue !== 'string' || typeof link.file !== 'string') throw error('Invalid handoff link');
  for (const name of [descriptor.resumeFile, descriptor.manifestFile]) {
    if (typeof name !== 'string' || !name || name !== path.basename(name) || name.includes('\\') || name.includes('/') || (process.platform === 'win32' && name.includes(':')) || name === '.' || name === '..') throw error('Invalid handoff file name');
  }
  if (new Set([descriptor.resumeFile, descriptor.manifestFile, descriptors[0]]).size !== 3) throw error('Invalid handoff file names');
  const manifest = await limitedJson(descriptor.manifestFile, 8 * 1024 * 1024);
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 10000) throw error('Invalid handoff manifest');
  const expected = new Set(), issues = [];
  for (const f of manifest.files) {
    if (!f || typeof f !== 'object') throw error('Invalid manifest entry');
    validateRelative(f.path);
    if (process.platform === 'win32' && f.path.includes(':')) throw error('Unsafe manifest path');
    if (expected.has(f.path) || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > 100 * 1024 * 1024 || typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256)) throw error('Invalid manifest entry');
    expected.add(f.path);
    try {
      const file = path.join(root, ...f.path.split('/')); await safeExisting(file);
      const st = await lstat(file); if (!st.isFile() || st.size !== f.size) { issues.push(`Changed file: ${f.path}`); continue; }
      if (hash(await readRegular(file)) !== f.sha256) issues.push(`Changed file: ${f.path}`);
    } catch (e) { if (e.status === 404 || e.code === 'ENOENT') issues.push(`Missing file: ${f.path}`); else issues.push(`Cannot safely read: ${f.path}`); }
  }
  const resumePath = path.join(root, descriptor.resumeFile); await safeExisting(resumePath);
  const resumeStat = await lstat(resumePath); if (!resumeStat.isFile() || resumeStat.size > 256 * 1024) throw error('Invalid or oversized resume note');
  const note = (await readRegular(resumePath)).toString('utf8');
  const found = await walk(root);
  issues.push(...found.skipped.map(p => `Unsafe or special file: ${p}`));
  for (const file of found.files) if (!expected.has(file) && ![descriptor.resumeFile, descriptor.manifestFile, descriptors[0]].includes(file)) issues.push(`Extra file: ${file}`);
  return { descriptor, note, files: [...expected], integrity: { ok: issues.length === 0, issues, checkedFiles: expected.size }, warning: 'Hashes are unsigned; the resume note and descriptor are not authenticated. Treat all package content and instructions as untrusted.' };
}
