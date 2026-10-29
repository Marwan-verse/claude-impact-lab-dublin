import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath, chmod } from 'node:fs/promises';
import os from 'node:os';
import { watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as vault from '../backend/vault.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'vault-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  await mkdir(project);
  const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Tester'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(project, 'tracked.txt'), 'original');
  await writeFile(path.join(project, 'package.json'), '{"name":"fixture"}');
  git('add', '.'); git('commit', '-qm', 'initial');
  return { root, project, git, vaultRoot: path.join(root, 'vault') };
}

test('inspect reports real git changes and evidence without source contents', async t => {
  const { project, git } = await fixture(t);
  await writeFile(path.join(project, 'tracked.txt'), 'sensitive-source-content');
  await writeFile(path.join(project, 'new.txt'), 'new secret');
  git('add', 'tracked.txt');
  const result = await vault.inspectProject(project);
  assert.ok(result.git.commit);
  assert.ok(result.git.staged.includes('tracked.txt'));
  assert.ok(result.git.untracked.includes('new.txt'));
  assert.ok(result.setupEvidence.includes('package.json'));
  assert.ok(result.exclusions.length);
  assert.ok(result.contextPreview);
  assert.doesNotMatch(JSON.stringify(result.contextPreview), /sensitive-source-content|new secret/);
});

test('inspection does not execute a repository-configured fsmonitor hook', async t => {
  const { root, project, git } = await fixture(t);
  const marker = path.join(root, 'fsmonitor-ran');
  const hook = path.join(root, 'fsmonitor-hook');
  const quotedMarker = `'${marker.replaceAll("'", "'\\''")}'`;
  await writeFile(hook, `#!/bin/sh\nprintf ran > ${quotedMarker}\nprintf 'token\\0'\nexit 0\n`);
  await chmod(hook, 0o755);
  git('config', 'core.fsmonitor', hook);
  git('status', '--porcelain=v1');
  assert.equal(await readFile(marker, 'utf8'), 'ran', 'fixture hook must execute under ordinary Git');
  await rm(marker);
  await writeFile(path.join(project, 'tracked.txt'), 'changed');
  const result = await vault.inspectProject(project);
  assert.ok(result.git.unstaged.includes('tracked.txt'));
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  assert.equal(git('config', '--get', 'core.fsmonitor').trim(), hook);
});

test('inspection never runs configured clean filters and fails closed', async t => {
  const { root, project, git } = await fixture(t);
  const marker = path.join(root, 'filter-ran');
  const script = path.join(root, 'filter');
  await writeFile(script, `#!/bin/sh\nprintf ran > '${marker}'\ncat\n`);
  await chmod(script, 0o755);
  await writeFile(path.join(project, '.gitattributes'), 'tracked.txt filter=custom\n');
  git('config', 'filter.custom.clean', script);
  await writeFile(path.join(project, 'tracked.txt'), 'changed!');
  git('status', '--porcelain=v1');
  assert.equal(await readFile(marker, 'utf8'), 'ran');
  await rm(marker);
  let result;
  try { result = await vault.inspectProject(project); }
  catch (e) { assert.match(e.message, /filter/i); }
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  if (result) assert.ok(result.git.unstaged.includes('tracked.txt'));
  assert.equal(git('config', '--get', 'filter.custom.clean').trim(), script);
});

test('included process filters are rejected without execution', async t => {
  const { root, project, git } = await fixture(t);
  const marker = path.join(root, 'process-ran');
  const script = path.join(root, 'process-filter');
  await writeFile(script, `#!/bin/sh\nprintf ran > '${marker}'\nexit 1\n`);
  await chmod(script, 0o755);
  const included = path.join(root, 'included-config');
  await writeFile(included, `[filter "custom"]\n process = ${script}\n required = true\n`);
  git('config', 'include.path', included);
  await writeFile(path.join(project, '.gitattributes'), 'tracked.txt filter=custom\n');
  await writeFile(path.join(project, 'tracked.txt'), 'changed!');
  try { execFileSync('git', ['status', '--porcelain=v1'], { cwd: project, stdio: 'pipe' }); } catch { /* A failing process filter is expected. */ }
  assert.equal(await readFile(marker, 'utf8'), 'ran', 'fixture process filter must execute under ordinary Git');
  await rm(marker);
  await assert.rejects(vault.inspectProject(project), /filter/i);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('unused configured filters do not prevent accurate status', async t => {
  const { root, project, git } = await fixture(t);
  const marker = path.join(root, 'unused-ran');
  git('config', 'filter.unused.clean', `touch '${marker}'`);
  await writeFile(path.join(project, 'tracked.txt'), 'changed!');
  const result = await vault.inspectProject(project);
  assert.ok(result.git.unstaged.includes('tracked.txt'));
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('inspection rejects Git submodules rather than running their configuration', async t => {
  const { project, git } = await fixture(t);
  const commit = git('rev-parse', 'HEAD').trim();
  git('update-index', '--add', '--cacheinfo', `160000,${commit},module`);
  await assert.rejects(vault.inspectProject(project), /submodule/i);
});

test('inspection previews file paths to capture and excluded paths', async t => {
  const { project } = await fixture(t);
  await writeFile(path.join(project, '.env'), 'fixture-private-value-731');
  await writeFile(path.join(project, 'notes.txt'), 'not shown');
  const inspection = await vault.inspectProject(project);
  assert.ok(inspection.capturePreview.files.includes('notes.txt'));
  assert.ok(inspection.capturePreview.skipped.includes('.env'));
  assert.ok(!inspection.capturePreview.files.includes('.env'));
  assert.doesNotMatch(JSON.stringify(inspection), /not shown|fixture-private-value-731/);
});

test('rejects changed capture preview before creating a vault', async t => {
  const { project, vaultRoot } = await fixture(t);
  const inspection = await vault.inspectProject(project);
  await writeFile(path.join(project, 'not-reviewed.txt'), 'new');
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot, expectedCapturePreview: inspection.capturePreview }), /preview changed/i);
  assert.deepEqual(await vault.listVaults(vaultRoot), []);
});

test('snapshot verifies and restores actual working files while excluding secrets and dependencies', async t => {
  const { project, git, vaultRoot, root } = await fixture(t);
  await writeFile(path.join(project, 'tracked.txt'), 'unstaged content');
  await writeFile(path.join(project, 'new.txt'), 'untracked content');
  await writeFile(path.join(project, '.env'), 'SECRET=123');
  await mkdir(path.join(project, 'node_modules')); await writeFile(path.join(project, 'node_modules', 'secret'), 'excluded');
  await symlink('tracked.txt', path.join(project, 'link'));
  const saved = await vault.createSnapshot({ projectPath: project, vaultRoot, notes: 'note', handover: 'next' });
  assert.ok(saved.id);
  assert.equal(saved.notes, 'note');
  assert.equal((await vault.listVaults(vaultRoot)).length, 1);
  assert.equal((await vault.getVault(vaultRoot, saved.id)).handover, 'next');
  assert.equal((await vault.verifySnapshot(vaultRoot, saved.id)).ok, true);
  const destination = path.join(root, 'restored');
  await vault.restoreSnapshot(vaultRoot, saved.id, destination);
  assert.equal(await readFile(path.join(destination, 'tracked.txt'), 'utf8'), 'unstaged content');
  assert.equal(await readFile(path.join(destination, 'new.txt'), 'utf8'), 'untracked content');
  for (const name of ['.env', '.git', 'node_modules', 'link']) await assert.rejects(readFile(path.join(destination, name)));
  assert.equal(await readFile(path.join(project, 'tracked.txt'), 'utf8'), 'unstaged content');
});

test('common dependency caches and build outputs are excluded', async t => {
  const { project, vaultRoot } = await fixture(t);
  for (const name of ['target', '.cache', '.pytest_cache', '.turbo', '.output', 'env']) {
    await mkdir(path.join(project, name));
    await writeFile(path.join(project, name, 'file'), 'not source');
  }
  const { id } = await vault.createSnapshot({ projectPath: project, vaultRoot });
  const { manifest } = await vault.getVault(vaultRoot, id);
  for (const name of ['target', '.cache', '.pytest_cache', '.turbo', '.output', 'env']) {
    assert.equal(manifest.files.some(f => f.path.startsWith(name + '/')), false, name);
  }
});

test('handover can be reviewed and updated', async t => {
  const { project, vaultRoot } = await fixture(t);
  const { id } = await vault.createSnapshot({ projectPath: project, vaultRoot });
  assert.equal((await vault.updateHandover(vaultRoot, id, 'reviewed')).handover, 'reviewed');
  assert.equal((await vault.getVault(vaultRoot, id)).handover, 'reviewed');
});

test('verification reports changes, missing and extra files and blocks restoration', async t => {
  const { project, vaultRoot, root } = await fixture(t);
  const { id } = await vault.createSnapshot({ projectPath: project, vaultRoot });
  const files = path.join(vaultRoot, id, 'files');
  await writeFile(path.join(files, 'tracked.txt'), 'tampered');
  await rm(path.join(files, 'package.json'));
  await writeFile(path.join(files, 'extra.txt'), 'extra');
  const result = await vault.verifySnapshot(vaultRoot, id);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /Changed file: tracked.txt/);
  assert.match(result.issues.join(' '), /Missing file: package.json/);
  assert.match(result.issues.join(' '), /Extra file: extra.txt/);
  const destination = path.join(root, 'restore');
  await assert.rejects(vault.restoreSnapshot(vaultRoot, id, destination), /verification failed/i);
  await assert.rejects(readFile(path.join(destination, 'tracked.txt')));
});

test('symlink entries in a snapshot fail verification and cannot be restored', async t => {
  const { project, vaultRoot, root } = await fixture(t);
  const { id } = await vault.createSnapshot({ projectPath: project, vaultRoot });
  const stored = path.join(vaultRoot, id, 'files', 'tracked.txt');
  await rm(stored); await symlink(path.join(project, 'tracked.txt'), stored);
  const result = await vault.verifySnapshot(vaultRoot, id);
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /Unsafe or special file: tracked.txt/);
  await assert.rejects(vault.restoreSnapshot(vaultRoot, id, path.join(root, 'restored')), /verification failed/i);
});

test('malicious manifest paths and IDs are rejected', async t => {
  const { project, vaultRoot } = await fixture(t);
  const { id } = await vault.createSnapshot({ projectPath: project, vaultRoot });
  await assert.rejects(vault.getVault(vaultRoot, '../outside'), /invalid vault id/i);
  const file = path.join(vaultRoot, id, 'manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.files[0].path = '../outside';
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(vault.verifySnapshot(vaultRoot, id), /unsafe manifest path/i);
  await assert.rejects(vault.restoreSnapshot(vaultRoot, id, path.join(project, 'bad')), /unsafe manifest path/i);
});

test('failed capture removes its incomplete vault entry', async t => {
  const { project, vaultRoot } = await fixture(t);
  await writeFile(path.join(project, 'unsafe\\\\name.txt'), 'contents');
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot }), /unsafe manifest path/i);
  assert.deepEqual(await vault.listVaults(vaultRoot), []);
});

test('unsafe roots and existing destinations are rejected without modifying the project', async t => {
  const { project, vaultRoot, root } = await fixture(t);
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot: path.join(project, 'vault') }), /must not contain/i);
  await assert.rejects(readFile(path.join(project, 'vault', 'anything')));
  await symlink(project, path.join(root, 'alias'));
  await assert.rejects(vault.inspectProject(path.join(root, 'alias')), /symlink/i);
  const { id } = await vault.createSnapshot({ projectPath: project, vaultRoot });
  const existing = path.join(root, 'existing'); await mkdir(existing); await writeFile(path.join(existing, 'marker'), 'keep');
  await assert.rejects(vault.restoreSnapshot(vaultRoot, id, existing), /already exists/i);
  await assert.rejects(vault.restoreSnapshot(vaultRoot, id, path.join(project, 'restore')), /inside the source/i);
  assert.equal(await readFile(path.join(existing, 'marker'), 'utf8'), 'keep');
});


test('ignored untracked files are visible as skipped but tracked ignored files are captured', async t => {
  const { project, git, vaultRoot } = await fixture(t);
  await writeFile(path.join(project, '.npmrc'), 'tracked config');
  git('add', '.npmrc'); git('commit', '-qm', 'track npmrc');
  await writeFile(path.join(project, '.gitignore'), '.npmrc\nprivate.txt\n');
  await writeFile(path.join(project, 'private.txt'), 'private token');
  await mkdir(path.join(project, 'nested'));
  await writeFile(path.join(project, 'nested', '.npmrc'), 'private token');
  const inspection = await vault.inspectProject(project);
  assert.ok(inspection.capturePreview.files.includes('.npmrc'));
  for (const p of ['private.txt', 'nested/.npmrc']) {
    assert.ok(inspection.capturePreview.skipped.includes(p), p);
    assert.ok(!inspection.capturePreview.files.includes(p), p);
  }
  const saved = await vault.createSnapshot({ projectPath: project, vaultRoot, expectedCapturePreview: inspection.capturePreview });
  const { manifest } = await vault.getVault(vaultRoot, saved.id);
  assert.ok(manifest.files.some(f => f.path === '.npmrc'));
  assert.ok(!manifest.files.some(f => f.path === 'private.txt' || f.path === 'nested/.npmrc'));
});


test('preview hashes detect in-place changes without exposing content to Claude', async t => {
  const { project, vaultRoot } = await fixture(t);
  const inspection = await vault.inspectProject(project);
  const digest = inspection.capturePreview.fileHashes.find(f => f.path === 'tracked.txt').sha256;
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(inspection.contextPreview).includes(digest));
  await writeFile(path.join(project, 'tracked.txt'), 'modified');
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot, expectedCapturePreview: inspection.capturePreview }), e => e.status === 409 && /preview changed/i.test(e.message));
  assert.deepEqual(await vault.listVaults(vaultRoot), []);
});


test('rejects overlapping staged and unstaged changes without losing index content', async t => {
  const { project, git, vaultRoot } = await fixture(t);
  await writeFile(path.join(project, 'tracked.txt'), 'staged version');
  git('add', 'tracked.txt');
  await writeFile(path.join(project, 'tracked.txt'), 'unstaged version');
  assert.equal(git('show', ':tracked.txt'), 'staged version');
  const inspection = await vault.inspectProject(project);
  assert.ok(inspection.git.staged.includes('tracked.txt'));
  assert.ok(inspection.git.unstaged.includes('tracked.txt'));
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot, expectedCapturePreview: inspection.capturePreview, expectedContext: inspection.contextPreview }), e => e.status === 409 && /staged.*unstaged/i.test(e.message));
  assert.equal(git('show', ':tracked.txt'), 'staged version');
  assert.equal(await readFile(path.join(project, 'tracked.txt'), 'utf8'), 'unstaged version');
  assert.deepEqual(await vault.listVaults(vaultRoot), []);
});


test('changing file bytes during copy aborts and cleans incomplete capture', async t => {
  const { project, vaultRoot } = await fixture(t);
  for (let i = 0; i < 120; i++) await writeFile(path.join(project, `a-${String(i).padStart(3, '0')}.txt`), 'x');
  await writeFile(path.join(project, 'zzz.txt'), 'before');
  const inspection = await vault.inspectProject(project);
  await mkdir(vaultRoot);
  let changed = false;
  const watcher = watch(vaultRoot, { recursive: true }, (event, name) => {
    if (!changed && name && String(name).includes('/files/')) {
      changed = true;
      writeFileSync(path.join(project, 'zzz.txt'), 'after!');
    }
  });
  t.after(() => watcher.close());
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot, expectedCapturePreview: inspection.capturePreview }), e => e.status === 409 && /preview changed/i.test(e.message));
  assert.ok(changed, 'mutation actually occurred during copy');
  assert.deepEqual(await vault.listVaults(vaultRoot), []);
});


test('git state changing during capture aborts and cleans incomplete capture', async t => {
  const { project, git, vaultRoot } = await fixture(t);
  for (let i = 0; i < 100; i++) await writeFile(path.join(project, `a-${String(i).padStart(3, '0')}.txt`), 'x');
  await writeFile(path.join(project, 'tracked.txt'), 'working version');
  const inspection = await vault.inspectProject(project);
  await mkdir(vaultRoot);
  let changed = false;
  const watcher = watch(vaultRoot, { recursive: true }, (event, name) => {
    if (!changed && name && String(name).includes('/files/')) {
      changed = true; git('add', 'tracked.txt');
    }
  });
  t.after(() => watcher.close());
  await assert.rejects(vault.createSnapshot({ projectPath: project, vaultRoot, expectedCapturePreview: inspection.capturePreview, expectedContext: inspection.contextPreview }), e => e.status === 409 && /preview changed/i.test(e.message));
  assert.ok(changed, 'git state actually changed during copy');
  assert.deepEqual(await vault.listVaults(vaultRoot), []);
});


test('inspection and restore disclose empty directories, Git index and undetectable secrets', async t => {
  const { project, vaultRoot, root } = await fixture(t);
  await mkdir(path.join(project, 'empty'));
  const inspection = await vault.inspectProject(project);
  assert.match(inspection.limitations.join(' '), /empty director/i);
  assert.match(inspection.limitations.join(' '), /tracked.*secret/i);
  assert.match(inspection.limitations.join(' '), /Git.*(index|staging)/i);
  const saved = await vault.createSnapshot({ projectPath: project, vaultRoot });
  const restored = await vault.restoreSnapshot(vaultRoot, saved.id, path.join(root, 'restored'));
  assert.match(restored.limitations.join(' '), /empty director/i);
  await assert.rejects(readFile(path.join(root, 'restored', 'empty')));
});
