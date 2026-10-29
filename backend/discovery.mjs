import os from 'node:os';
import path from 'node:path';
import { open, readdir, lstat, realpath } from 'node:fs/promises';

// Read only bounded session metadata. Conversation text is never returned.
async function recentFiles(root, maxFiles, maxDepth) {
  const files = []; let visited = 0;
  async function walk(dir, depth) {
    if (++visited > 1000 || depth > maxDepth) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (files.length >= 10000) break;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try { const stat = await lstat(full); files.push({ path: full, mtime: stat.mtimeMs }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
  }
  await walk(root, 0);
  return files.sort((a, b) => b.mtime - a.mtime).slice(0, maxFiles);
}

async function metadata(file, source) {
  let handle;
  try {
    handle = await open(file.path, 'r');
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n');
    for (const line of lines.slice(0, 100)) {
      let item; try { item = JSON.parse(line); } catch { continue; }
      if (source === 'codex' && item.type === 'session_meta' && typeof item.payload?.cwd === 'string') return item.payload.cwd;
      if (source === 'claude' && ['user', 'assistant', 'system'].includes(item.type) && typeof item.cwd === 'string') return item.cwd;
    }
  } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EACCES') throw error; }
  finally { await handle?.close(); }
  return null;
}

async function gitRoot(cwd) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || cwd.includes('\0')) return null;
  let current;
  try { current = await realpath(cwd); if (!(await lstat(current)).isDirectory()) return null; } catch { return null; }
  for (;;) {
    try { const git = await lstat(path.join(current, '.git')); if (git.isDirectory() || git.isFile()) return current; } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return null; }
    const parent = path.dirname(current); if (parent === current) return null; current = parent;
  }
}

export async function discoverProjects({ codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), claudeHome = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), maxFiles = 200 } = {}) {
  const roots = [ ['codex', path.join(codexHome, 'sessions'), 5], ['claude', path.join(claudeHome, 'projects'), 3] ];
  const result = new Map(); const warnings = [];
  for (const [source, root, depth] of roots) {
    let files;
    try { files = await recentFiles(root, maxFiles, depth); } catch { warnings.push(`Could not read ${source === 'codex' ? 'Codex' : 'Claude Code'} session metadata.`); continue; }
    for (const file of files) {
      let cwd; try { cwd = await metadata(file, source); } catch { continue; }
      const projectPath = await gitRoot(cwd); if (!projectPath) continue;
      const key = process.platform === 'win32' ? projectPath.toLowerCase() : projectPath;
      const entry = result.get(key) || { path: projectPath, name: path.basename(projectPath), sources: [], lastSeen: 0 };
      if (!entry.sources.includes(source)) entry.sources.push(source);
      entry.lastSeen = Math.max(entry.lastSeen, file.mtime); result.set(key, entry);
    }
  }
  return { projects: [...result.values()].sort((a, b) => b.lastSeen - a.lastSeen).map(p => ({ ...p, lastSeen: new Date(p.lastSeen).toISOString() })), warnings };
}
