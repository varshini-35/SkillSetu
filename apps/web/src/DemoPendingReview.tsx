import { FormEvent, useCallback, useEffect, useState } from 'react';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

type DemoReport = {
  report: { id: string; version: number; status: string };
  snapshot: { skillHolder?: { name?: string; occupation?: string; declaredSkills?: Array<{ label?: string; id?: string }> }; qualification?: { title?: string }; assessment?: { method?: string } };
  assessorSignoff?: { name?: string; simulated?: boolean };
  reviewerSignoff?: { name?: string; simulated?: boolean } | null;
  assessmentStatus: string;
  snapshotHash: string;
  synthetic: boolean;
  reviewReason?: string | null;
  reviewedAt?: string | null;
  reviewerRole?: string | null;
};

async function request(path: string, init: RequestInit = {}) {
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

export default function DemoPendingReview() {
  const [data, setData] = useState<DemoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await request('/api/admin/demo-review');
      setData(next);
      setError('');
    } catch (cause: any) {
      setError(cause.message || 'Synthetic report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function review(decision: 'APPROVED' | 'RETURNED', event?: FormEvent) {
    event?.preventDefault();
    if (!data || busy) return;
    if (decision === 'RETURNED' && reason.trim().length < 3) {
      setMessage('Enter at least 3 characters explaining what needs correction.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await request('/api/admin/demo-review/review', {
        method: 'POST',
        body: JSON.stringify({ reportId: data.report.id, reportVersion: data.report.version, decision, reason }),
      });
      setData(updated);
      setReason('');
      setReturning(false);
      setMessage(decision === 'APPROVED' ? 'SIMULATED OUTCOME: Accept & Sign recorded for this synthetic report.' : 'SIMULATED OUTCOME: Return for Changes recorded for this synthetic report.');
    } catch (cause: any) {
      setError(cause.message || 'Demo review could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setData(await request('/api/admin/demo-review/reset', { method: 'POST', body: '{}' }));
      setReason('');
      setReturning(false);
      setMessage('Synthetic report reset to Awaiting Review. No real records were changed.');
    } catch (cause: any) {
      setError(cause.message || 'Demo could not be reset.');
    } finally {
      setBusy(false);
    }
  }

  const isPending = data?.assessmentStatus === 'AWAITING_REVIEW';
  const skillLabels = data?.snapshot.skillHolder?.declaredSkills?.map((skill) => skill.label || skill.id).filter(Boolean).join(', ') || 'Skills not listed';
  const previewUrl = `/api/admin/demo-review/preview?state=${encodeURIComponent(data?.reviewedAt || 'pending')}`;

  return <>
    <article className="demo-pending-row" aria-label="Synthetic demo report awaiting review">
      <div className="demo-pending-copy">
        <b>SYNTHETIC DEMO · {data?.snapshot.skillHolder?.name || 'Loading candidate'} · {data?.snapshot.skillHolder?.occupation || 'Domestic Electrician'}</b>
        <small>{skillLabels}</small>
        <small>Assessor: {data?.assessorSignoff?.name || 'Loading'} (simulated) · {isPending ? 'Awaiting independent review' : `Simulated ${data?.assessmentStatus?.toLowerCase()} outcome`} · Report v{data?.report.version ?? '—'}</small>
      </div>
      <button className="secondary" type="button" disabled={loading || !data} onClick={() => { setOpen(true); setMessage(''); setError(''); }}>View Report</button>
      {loading && <small role="status">Loading synthetic report…</small>}
      {error && !open && <small className="error-msg" role="alert">{error}</small>}
    </article>

    {open && data && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="demo-review-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-review-title">
        <header><div><p className="demo-review-label">SYNTHETIC DEMONSTRATION · ISOLATED STATE</p><h2 id="demo-review-title">Assessment report awaiting review</h2><p>{data.snapshot.skillHolder?.name} · {data.snapshot.qualification?.title} · Version {data.report.version}</p></div><button className="secondary" type="button" onClick={() => setOpen(false)}>Close</button></header>
        <p className="notice"><b>This is a synthetic demonstration.</b> Its simulated assessor sign-off and review outcome are not real signatures, assessment decisions, or certification. Actions here do not change candidate records.</p>
        {error && <p className="error-msg" role="alert">{error}</p>}
        {message && <p className="demo-review-message" role="status">{message}</p>}
        <div className="demo-review-actions">
          <a className="secondary" href={`${API_BASE}/api/admin/demo-review/download`}>Download demo PDF</a>
          {isPending ? <>
            <button className="primary" type="button" disabled={busy} onClick={() => void review('APPROVED')}>{busy ? 'Saving…' : 'Accept & Sign'}</button>
            {!returning ? <button className="secondary" type="button" disabled={busy} onClick={() => { setReturning(true); setMessage(''); }}>Return for Changes</button> : <form onSubmit={(event) => void review('RETURNED', event)}><label>Explain what needs correction or reassessment<textarea required minLength={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="secondary" type="submit" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : 'Return for Changes'}</button><button className="secondary" type="button" onClick={() => { setReturning(false); setReason(''); }}>Cancel</button></form>}
          </> : <><span className="demo-review-outcome">SIMULATED OUTCOME · {data.assessmentStatus}</span><button className="secondary" type="button" disabled={busy} onClick={() => void reset()}>{busy ? 'Resetting…' : 'Reset demo to Awaiting Review'}</button></>}
        </div>
        {data.reviewReason && <p><b>Simulated correction reason:</b> {data.reviewReason}</p>}
        <iframe key={previewUrl} className="demo-review-preview" title="Full synthetic assessment report preview" src={previewUrl} />
      </section>
    </div>}
  </>;
}
