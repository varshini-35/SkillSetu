import {useState} from 'react';

type Props={assessmentId:string;item:any;criterionLabel?:string;onClose:()=>void;onDecision:(decision:'ACCEPTED'|'CHANGES_REQUESTED',remarks:string)=>Promise<void>};

export default function EvidenceReviewDialog({assessmentId,item,criterionLabel,onClose,onDecision}:Props){
  const [remarks,setRemarks]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const src=`/api/assessments/${assessmentId}/evidence/${item.id}`;
  async function submit(decision:'ACCEPTED'|'CHANGES_REQUESTED'){setBusy(true);setError('');try{await onDecision(decision,remarks)}catch(e){setError(e instanceof Error?e.message:'Could not save the evidence decision.')}finally{setBusy(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="workflow-dialog evidence-review-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-review-title"><header><h2 id="evidence-review-title">Review Evidence</h2><button className="secondary" disabled={busy} onClick={onClose}>Close</button></header>
    <div className="evidence-review-media">{item.mediaType?.startsWith('video/')?<video controls preload="metadata" src={src}>Video playback is not supported in this browser.</video>:item.mediaType?.startsWith('image/')?<img src={src} alt={item.fileName||'Skill Holder evidence'}/>:<a href={src} target="_blank" rel="noreferrer">Open {item.fileName||'uploaded file'}</a>}</div>
    <p><b>Skill:</b> {item.skillLabel||'Not specified'}</p><p><b>Evidence description:</b> {item.description||'No description supplied.'}</p><p><b>Related criterion:</b> {criterionLabel||'General evidence'}</p><p><b>Status:</b> {(item.status||'PENDING_REVIEW').replaceAll('_',' ')} · {item.fileName} · {item.mediaType} · {Math.ceil((item.size||0)/1024)} KB</p>{item.sha256&&<p className="muted">SHA-256 integrity hash recorded</p>}{item.reviewHistory?.[0]?.remarks&&<p><b>Previous assessor remarks:</b> {item.reviewHistory[0].remarks}</p>}
    {item.status==='ACCEPTED'?<p className="notice">This evidence has been accepted and is locked.</p>:<><label>Assessor remarks<textarea maxLength={2000} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Explain the decision or any changes needed"/></label>{error&&<p className="error-msg" role="alert">{error}</p>}<div className="button-row"><button className="primary" disabled={busy} onClick={()=>void submit('ACCEPTED')}>{busy?'Saving…':'Accept Evidence'}</button><button className="secondary" disabled={busy||remarks.trim().length<3} onClick={()=>void submit('CHANGES_REQUESTED')}>{busy?'Saving…':'Request Changes'}</button></div></>}
  </section></div>;
}
