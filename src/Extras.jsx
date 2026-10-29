import React, { useState } from 'react';

export function qualityHints(goal, issue, nextStep) {
  const vague = /^(finish|continue|fix|do|complete)(\s+(this|it|work|project|task))?[.! ]*$/i.test(nextStep.trim());
  return [!goal.trim() && 'Add what you were trying to do.', !issue.trim() && 'Note an unresolved issue, or write “none”.', !nextStep.trim() && 'Add a concrete first step for when you return.', vague && 'Make the next step more specific: name a file, test, or question to investigate first.'].filter(Boolean);
}

export function ReviewTools({ inspection, goal, issue, nextStep, setNotes, excludedFiles, setExcludedFiles, disabled, checkTasks }) {
  const [agentText, setAgentText] = useState('');
  const [knownTasks, setKnownTasks] = useState('');
  const [pids, setPids] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [message, setMessage] = useState('');
  const git = inspection?.git || {};
  const changes = [...(git.staged || []).map(p => `Staged: ${p}`), ...(git.unstaged || []).map(p => `Unstaged: ${p}`), ...(git.untracked || []).map(p => `Untracked: ${p}`)];
  const hints = qualityHints(goal, issue, nextStep);
  const importDraft = async () => {
    try {
      const value = agentText.trim() || await navigator.clipboard.readText();
      const parsed = JSON.parse(value);
      if (!parsed || ['goal', 'issue', 'nextStep'].some(k => typeof parsed[k] !== 'string')) throw new Error('Expected JSON with goal, issue and nextStep text.');
      setNotes(parsed); setMessage('Draft imported. Review it before saving.');
    } catch (e) { setMessage(e.message || 'Paste the agent draft into the field first.'); }
  };
  const inspectPids = async () => {
    const values = pids.split(/[\s,]+/).filter(Boolean);
    if (!values.length || values.some(v => !/^\d+$/.test(v))) { setTaskStatus('Enter one or more positive process IDs.'); return; }
    try { const result = await checkTasks(values.map(Number)); setTaskStatus(result.tasks.map(t => `PID ${t.pid}: ${t.status}`).join('; ') + '. ' + result.note); }
    catch (e) { setTaskStatus(e.message); }
  };
  return <>
    <div className="form-divider"/><h3>Before you stop</h3>
    <p className="help">{changes.length ? `${changes.length} Git change(s) found. They remain in the original project; Git staging is not restored.` : 'No staged, unstaged or untracked Git changes found.'}</p>
    {changes.length > 0 && <details><summary>Review Git changes</summary><ul>{changes.map((v,i)=><li key={i}>{v}</li>)}</ul></details>}
    <label htmlFor="known-tasks">Tasks or agents you know are still running</label><textarea id="known-tasks" value={knownTasks} onChange={e=>setKnownTasks(e.target.value)} disabled={disabled} placeholder="List anything to check before you stop"/><p className="help">{knownTasks.trim() ? "Check each item above yourself before stopping." : "No tasks listed. Check your terminals and agents before stopping."} This list is a temporary reminder and is not saved. The Vault does not discover or pause running processes.</p><label htmlFor="known-pids">Known process IDs (optional)</label><input id="known-pids" value={pids} onChange={e=>{setPids(e.target.value);setTaskStatus('')}} placeholder="e.g. 1234, 5678" disabled={disabled}/><button type="button" className="secondary" disabled={disabled} onClick={inspectPids}>Check listed process IDs</button>{taskStatus && <p className="help" role="status">{taskStatus}</p>}
    <h3>Choose files to capture</h3><p className="help">Uncheck files you do not want saved; they cannot be recovered from this snapshot. The service will recheck the entire reviewed project before capture. Review for secrets; automatic exclusions cannot identify every secret.</p>
    <details><summary>{inspection.capturePreview.files.length - excludedFiles.length} of {inspection.capturePreview.files.length} eligible files selected</summary><div className="file-choices">{inspection.capturePreview.files.map(file=><label className="confirm-context" key={file}><input type="checkbox" disabled={disabled} checked={!excludedFiles.includes(file)} onChange={e=>setExcludedFiles(e.target.checked ? excludedFiles.filter(p=>p!==file) : [...excludedFiles,file])}/><span>{file}</span></label>)}</div></details>
    <div className="form-divider"/><h3>Bring notes from Codex or Claude Code</h3><p className="help">Ask the unfinished-work-vault skill to prepare a JSON draft from your current conversation. Paste it below, or copy it and use the button. Nothing is sent to a model by this step.</p>
    <label htmlFor="agent-draft">Agent draft JSON</label><textarea id="agent-draft" value={agentText} onChange={e=>setAgentText(e.target.value)} disabled={disabled} placeholder={'{"goal":"...","issue":"...","nextStep":"..."}'}/><button className="secondary" type="button" disabled={disabled} onClick={importDraft}>Import agent draft</button>{message && <p className="help" role="status">{message}</p>}
    <div className="form-divider"/><h3>Handover quality</h3><p className="help">{hints.length ? hints.join(' ') : 'Goal, unresolved issue and next step are present. Check they are accurate and useful.'}</p>
  </>;
}

export function resumePrompt(item) {
  return `Help me resume this project. First read the restored VAULT-RESUME note and inspect the current files. Verify the saved context against the project; do not assume the snapshot has dependencies, credentials, Git history, or running processes. Explain any discrepancies, then propose the smallest next step before making changes.\n\nProject: ${item.projectName || 'Untitled'}\nSaved handover:\n${item.handover || 'No handover saved.'}`;
}

export function ReturnTools({ item, busy, run, result }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [exportPath, setExportPath] = useState('');
  const copy = async () => { try { await navigator.clipboard.writeText(resumePrompt(item)); setCopyStatus('Prompt copied. Paste it into Codex or Claude Code after restoring.'); } catch { setCopyStatus('Clipboard unavailable. Select and copy the prompt below.'); } };
  return <div className="panel form"><div className="panel-heading"><span className="step-number">↗</span><div><h2>Pick up or hand over</h2><p>Keep the context useful for your future self or a teammate.</p></div></div>
    <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>run('compare')}>Compare with current project</button><button type="button" className="secondary" disabled={busy} onClick={()=>run('confidence')}>Check resume readiness</button></div>
    {result?.kind==='compare' && <div className="notice" role="status"><div><strong>Changes since this snapshot</strong>{['added','changed','missing'].map(k=><p key={k}>{k}: {result.data[k].length ? result.data[k].join(', ') : 'none'}</p>)}<p>{result.data.note}</p></div></div>}
    {result?.kind==='confidence' && <div className={result.data.integrity.ok ? 'notice' : 'notice error'} role="status"><div><strong>{result.data.integrity.ok ? 'Snapshot integrity verified' : 'Snapshot needs attention'}</strong><p>{result.data.integrity.checkedFiles} files checked. {result.data.integrity.issues.join('; ')}</p><p>Setup files: {result.data.setup.length ? result.data.setup.map(s=>`${s.name} (${s.captured ? 'captured' : 'not captured'})`).join(', ') : 'none detected'}</p>{result.data.limitations.map(l=><p key={l}>{l}</p>)}</div></div>}
    <div className="form-divider"/><label htmlFor="resume-prompt">Resume prompt for Codex or Claude Code</label><textarea id="resume-prompt" className="handover" readOnly value={resumePrompt(item)}/><button type="button" className="secondary" onClick={copy}>Copy resume prompt</button>{copyStatus && <p className="help" role="status">{copyStatus}</p>}
    <div className="form-divider"/><form onSubmit={e=>{e.preventDefault();run('export', {destination: exportPath});}}><label htmlFor="export-path">Portable handoff folder</label><input id="export-path" value={exportPath} onChange={e=>setExportPath(e.target.value)} placeholder="Absolute path to a new folder" required/><p className="help">Creates a new local folder with the snapshot, resume note, SHA-256 manifest, and decision entries and issue links for this snapshot. The note includes the original project path. Review all contents before sharing.</p><button className="secondary" disabled={busy}>Create handoff folder</button></form>{result?.kind==='export' && <div className="notice" role="status"><div><strong>Handoff folder created</strong><p>{result.data.destination}</p><p>Resume note: {result.data.resumeFile}; manifest: {result.data.manifestFile}.</p><p>{result.data.note}</p></div></div>}
  </div>;
}
