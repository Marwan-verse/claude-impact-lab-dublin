import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverProjects } from '../backend/discovery.mjs';
import { createServer } from '../backend/server.mjs';

test('discovers and deduplicates Git roots from Codex and Claude session metadata without returning conversation text', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'vault-discovery-'));
  try {
    const codexHome = path.join(temp, 'codex'), claudeHome = path.join(temp, 'claude'), project = path.join(temp, 'my-project');
    await mkdir(path.join(project, '.git'), { recursive: true });
    await mkdir(path.join(project, 'subfolder'));
    await mkdir(path.join(codexHome, 'sessions', '2026', '10', '29'), { recursive: true });
    await mkdir(path.join(claudeHome, 'projects', 'project'), { recursive: true });
    await writeFile(path.join(codexHome, 'sessions', '2026', '10', '29', 'one.jsonl'), JSON.stringify({ type: 'session_meta', payload: { cwd: project, base_instructions: 'private text' } }) + '\n');
    await writeFile(path.join(claudeHome, 'projects', 'project', 'two.jsonl'), JSON.stringify({ type: 'system', content: 'private text' }) + '\n' + JSON.stringify({ type: 'user', cwd: path.join(project, 'subfolder'), message: 'private text' }) + '\n');
    const result = await discoverProjects({ codexHome, claudeHome });
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].path, project);
    assert.deepEqual(result.projects[0].sources.sort(), ['claude', 'codex']);
    assert.ok(!JSON.stringify(result).includes('private text'));
    assert.deepEqual(result.warnings, []);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('ignores non-Git, missing and malformed session records', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'vault-discovery-'));
  try {
    const codexHome = path.join(temp, 'codex'), claudeHome = path.join(temp, 'claude');
    await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
    await writeFile(path.join(codexHome, 'sessions', 'bad.jsonl'), 'not JSON\n' + JSON.stringify({type:'session_meta',payload:{cwd:path.join(temp,'missing')}}));
    assert.deepEqual(await discoverProjects({codexHome, claudeHome}), {projects:[], warnings:[]});
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('local discovery endpoint returns candidates from its configured session roots', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'vault-discovery-api-'));
  let server;
  try {
    const project = path.join(temp, 'sample'), codexHome = path.join(temp, 'codex'), claudeHome = path.join(temp, 'claude');
    await mkdir(path.join(project, '.git'), { recursive: true });
    await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
    await writeFile(path.join(codexHome, 'sessions', 'one.jsonl'), JSON.stringify({ type:'session_meta', payload:{ cwd:project, secret:'do-not-return' } }));
    server = createServer({ discoveryOptions:{ codexHome, claudeHome } });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/discovered-projects`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].name, 'sample');
    assert.ok(!JSON.stringify(result).includes('do-not-return'));
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); }
});
