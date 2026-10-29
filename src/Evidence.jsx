import React from 'react';

const labelFor = key => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
const present = value => value !== undefined && value !== null && value !== '';

function Value({ value }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span className="evidence-muted">None reported</span>;
    return <ul className="evidence-list">{value.map((item, index) => <li key={index}><Value value={item}/></li>)}</ul>;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, entry]) => present(entry));
    if (!entries.length) return <span className="evidence-muted">None reported</span>;
    return <dl className="evidence-fields nested">{entries.map(([key, entry]) => <div key={key}><dt>{labelFor(key)}</dt><dd><Value value={entry}/></dd></div>)}</dl>;
  }
  return <span className="evidence-value">{String(value)}</span>;
}

// Values are attributed only where the service explicitly supplies that category.
function Category({ title, description, value }) {
  if (!present(value)) return null;
  return <section className="evidence-category"><h3>{title}</h3><p>{description}</p><Value value={value}/></section>;
}

function parseNotes(notes) {
  if (typeof notes !== 'string') return notes;
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : notes;
  } catch {
    return notes;
  }
}

export function InspectionEvidence({ inspection }) {
  if (!inspection || typeof inspection !== 'object' || Array.isArray(inspection)) {
    return <pre className="evidence">{typeof inspection === 'string' ? inspection : JSON.stringify(inspection, null, 2)}</pre>;
  }
  if (!Object.keys(inspection).length) return <p className="evidence-muted">The service did not report any inspection details.</p>;
  const context = inspection.contextPreview || {};
  const capture = inspection.capturePreview;
  const project = {
    projectName: inspection.projectName ?? context.projectName,
    projectPath: inspection.projectPath,
    git: inspection.git ?? context.git,
    setupEvidence: inspection.setupEvidence ?? context.setupEvidence,
  };
  return <div className="evidence-overview">
    <p className="evidence-intro">Reported by the local service. Review the project, every capture and skipped path, exclusions, and limitations before continuing.</p>
    <Category title="Project and Git" description="Project details and working-tree status." value={project}/>
    <Category title="Limitations" description="What this capture and restore cannot preserve or guarantee." value={inspection.limitations}/>
    <Category title="Files to capture" description="Review every path: files may contain sensitive information even when their names look safe." value={capture?.files ?? 'Not reported by the service'}/>
    <Category title="Skipped paths" description="Paths omitted from capture; a skipped directory may represent its contents." value={capture?.skipped ?? 'Not reported by the service'}/>
    <Category title="Exclusion names" description="Names excluded from capture by the service." value={inspection.exclusions ?? context.exclusions}/>
    <details className="raw-evidence"><summary>View all inspection data, including hashes</summary><pre className="evidence">{JSON.stringify(inspection, null, 2)}</pre></details>
  </div>;
}

export function HandoverEvidence({ vault }) {
  const facts = vault?.checkedFacts ?? vault?.checked_facts;
  const notes = vault?.userNotes ?? vault?.user_notes;
  const interpretation = vault?.aiInterpretation ?? vault?.ai_interpretation;
  const categorized = present(facts) || present(notes) || present(interpretation);
  if (!categorized) return <><p className="evidence-intro">The service has not separated checked facts, user notes, and AI interpretation. Review the returned data carefully.</p><pre className="evidence">{JSON.stringify(vault, null, 2)}</pre></>;
  return <div className="evidence-overview"><Category title="Checked facts" description="Facts explicitly identified as checked by the local service." value={facts}/><Category title="Your notes" description="Notes supplied by the user." value={parseNotes(notes)}/><Category title="AI interpretation" description="A generated interpretation; review it against the evidence." value={interpretation}/><details className="raw-evidence"><summary>View all service data</summary><pre className="evidence">{JSON.stringify(vault, null, 2)}</pre></details></div>;
}