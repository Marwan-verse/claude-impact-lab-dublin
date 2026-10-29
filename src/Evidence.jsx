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

export function InspectionEvidence({ inspection }) {
  if (!inspection || typeof inspection !== 'object' || Array.isArray(inspection)) {
    return <pre className="evidence">{typeof inspection === 'string' ? inspection : JSON.stringify(inspection, null, 2)}</pre>;
  }
  const entries = Object.entries(inspection).filter(([, value]) => present(value));
  if (!entries.length) return <p className="evidence-muted">The service did not report any inspection details.</p>;
  return <div className="evidence-overview"><p className="evidence-intro">Reported by the local service. Review the available details and exclusions before continuing.</p><dl className="evidence-fields">{entries.map(([key, value]) => <div key={key}><dt>{labelFor(key)}</dt><dd><Value value={value}/></dd></div>)}</dl></div>;
}

export function HandoverEvidence({ vault }) {
  const facts = vault?.checkedFacts ?? vault?.checked_facts;
  const notes = vault?.userNotes ?? vault?.user_notes;
  const interpretation = vault?.aiInterpretation ?? vault?.ai_interpretation;
  const categorized = present(facts) || present(notes) || present(interpretation);
  if (!categorized) return <><p className="evidence-intro">The service has not separated checked facts, user notes, and AI interpretation. Review the returned data carefully.</p><pre className="evidence">{JSON.stringify(vault, null, 2)}</pre></>;
  return <div className="evidence-overview"><Category title="Checked facts" description="Facts explicitly identified as checked by the local service." value={facts}/><Category title="Your notes" description="Notes supplied by the user." value={notes}/><Category title="AI interpretation" description="A generated interpretation; review it against the evidence." value={interpretation}/><details className="raw-evidence"><summary>View all service data</summary><pre className="evidence">{JSON.stringify(vault, null, 2)}</pre></details></div>;
}
