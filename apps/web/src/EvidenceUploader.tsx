import {useEffect,useState} from 'react';
import {Language,t} from './i18n';
import {evidenceBytesBase64,evidenceFileError} from './evidence-client';

type Criterion={id:string;description:string};
type Skill={id:string;label:string};
type Props={assessmentId:string;criteria:Criterion[];skills:Skill[];lang:Language;onUploaded:()=>Promise<void>|void};
async function sendEvidence(assessmentId:string,file:File,skillId:string,criterionId:string,description:string,onProgress:(value:number)=>void){
  const payload=JSON.stringify({fileName:file.name,mediaType:file.type,dataBase64:await evidenceBytesBase64(file),skillId,criterionId:criterionId||undefined,description});
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`/api/assessments/${assessmentId}/evidence`);xhr.withCredentials=true;xhr.setRequestHeader('Content-Type','application/json');xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.min(100,Math.round(event.loaded/event.total*100)))};xhr.onload=()=>{const result=JSON.parse(xhr.responseText||'{}');if(xhr.status<200||xhr.status>=300)reject(new Error(result.error||`Upload failed (${xhr.status})`));else resolve(result)};xhr.onerror=()=>reject(new Error('Evidence upload failed. Check your connection and retry.'));xhr.send(payload)});
}

export default function EvidenceUploader({assessmentId,criteria,skills,lang,onUploaded}:Props){
  const [file,setFile]=useState<File|null>(null),[skillId,setSkillId]=useState(skills.length===1?skills[0].id:''),[progress,setProgress]=useState(0),[criterionId,setCriterionId]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const valid=!!file&&!evidenceFileError(file);
  const needsDescription=file?.type.startsWith('video/')||false;
  const previewUrl=file&&file.type.startsWith('video/')?URL.createObjectURL(file):'';
  useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl)},[previewUrl]);
  function choose(next:File|null){setMessage('');setFile(next);setProgress(0);setSkillId(skills.length===1?skills[0].id:'');setCriterionId('');setDescription('');if(next)setMessage(evidenceFileError(next)||'');}
  async function upload(){if(!file||!valid||busy||!skillId)return;if(needsDescription&&description.trim().length<3){setMessage('Describe what you are demonstrating in the video.');return}setBusy(true);setMessage('Uploading evidence…');try{await sendEvidence(assessmentId,file,skillId,criterionId,description,setProgress);setMessage('Evidence uploaded and attached to this skill.');setFile(null);setDescription('');await onUploaded()}catch(error){setMessage(error instanceof Error?error.message:'Evidence upload failed. You can retry.')}finally{setBusy(false)}}
  return <section className="evidence-uploader" aria-label={t(lang,'uploadEvidence')}>
    <label>{t(lang,'uploadEvidence')}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm" onChange={event=>choose(event.currentTarget.files?.[0]||null)}/><small>Images, PDF, or video up to 8 MB. Choose safe, supervised demonstrations only.</small></label>
    {file&&<div className="evidence-selection"><b>{file.name}</b><small>{file.type||'Unknown file type'} · {(file.size/1024/1024).toFixed(2)} MB</small></div>}
    <label>{t(lang,'skillDemonstrated')}<select required value={skillId} onChange={event=>setSkillId(event.target.value)}><option value="">Choose a declared skill</option>{skills.map(skill=><option key={skill.id} value={skill.id}>{skill.label}</option>)}</select></label>
    <label>Related assessment criterion (optional)<select value={criterionId} onChange={event=>setCriterionId(event.target.value)}><option value="">General evidence</option>{criteria.map(criterion=><option key={criterion.id} value={criterion.id}>{criterion.description}</option>)}</select></label>
    {busy&&<progress className="upload-progress" max="100" value={progress}>{progress}%</progress>}{previewUrl&&<video className="evidence-preview" controls preload="metadata" src={previewUrl}>Video preview is not supported by this browser.</video>}
    {file&&(file.type.startsWith('video/')||file.type.startsWith('image/'))&&<label>{t(lang,'evidenceDescription')}{needsDescription&&<span aria-hidden="true"> *</span>}<textarea maxLength={3000} required={needsDescription} value={description} onChange={event=>setDescription(event.target.value)} placeholder={t(lang,'evidenceDescriptionHint')}/><small>{needsDescription?'Required for video evidence.':'Optional for image evidence.'} You may write in the language you prefer.</small></label>}
    {file&&<button className="primary" type="button" disabled={!valid||busy||!skillId||(needsDescription&&description.trim().length<3)} onClick={()=>void upload()}>{busy?'Uploading…':t(lang,'uploadEvidence')}</button>}
    {message&&<p className={message.includes('uploaded')?'success-msg':'evidence-message'} role="status">{message}</p>}
  </section>;
}
