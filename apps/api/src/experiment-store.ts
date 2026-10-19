import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { weightedCohenKappa } from './metrics';

export type ExperimentCase = { id:string; candidate:{id:string;name:string;fictional:true}; skill:string; taskId:string; qualificationPackId:string; criterion:{id:string;nosId:string;mappingStatus:string}; evidence:{practicalObservation:string;vivaQuestion:string;vivaResponse:string}; manualInstructions:string; anchors:{score:number;label:string}[]; validScoreRange:[number,number]; qualityChecks:string[] };
export type ExperimentDataset = {id:string;version:string;label:string;classification:'SYNTHETIC_DEMO';occupationId:string;contentSetId:string;rubricVersion:string;scoreScale:{min:number;max:number;label:string};cases:ExperimentCase[]};
export type ScoringAttempt = {id:string;caseId:string;assessorId:string;condition:'MANUAL'|'ASSISTED';assignedOrder:number;status:'ASSIGNED'|'SUBMITTED';score:number|null;rationale:string|null;submittedAt:string|null;correctionHistory:any[]};
export type Experiment = {id:string;datasetId:string;datasetVersion:string;label:string;classification:'SYNTHETIC_DEMO'|'REAL_STUDY';rubricVersion:string;mappingVersion:string;metricVersion:string;datasetSnapshot?:ExperimentDataset;status:'READY'|'IN_PROGRESS'|'COMPLETED'|'RESULTS_CALCULATED';createdAt:string;createdBy:string;assessorIds:string[];attempts:ScoringAttempt[];corrections:any[];results:any|null};
type State={schemaVersion:1;experiments:Experiment[];audit:any[]};

export function validateExperimentDataset(value:any):string[] {
  const errors:string[]=[];
  if(!value||typeof value!=='object')return ['Dataset must be an object'];
  for(const key of ['id','version','label','contentSetId','rubricVersion','occupationId'])if(typeof value[key]!=='string'||!value[key].trim())errors.push(`Dataset field "${key}" is required`);
  if(value.classification!=='SYNTHETIC_DEMO')errors.push('This isolated Phase 3 dataset must be explicitly classified SYNTHETIC_DEMO');
  if(value.scoreScale?.min!==0||!Number.isInteger(value.scoreScale?.max)||value.scoreScale.max<1)errors.push('Score scale must have integer bounds beginning at 0');
  if(!Array.isArray(value.cases)||!value.cases.length)errors.push('Dataset must contain at least one case');
  const ids=new Set<string>();
  for(const [index,item] of (Array.isArray(value.cases)?value.cases:[]).entries()){
    const where=`Case ${index+1}`;
    if(!item?.id||ids.has(item.id))errors.push(`${where}: ID is missing or duplicated`);else ids.add(item.id);
    if(item?.candidate?.fictional!==true||!item.candidate.name)errors.push(`${where}: candidate must have a fictional identity and name`);
    if(!item?.criterion?.id||!item?.criterion?.nosId)errors.push(`${where}: criterion and NOS references are required`);
    if(!item?.evidence?.practicalObservation||!item?.evidence?.vivaQuestion||!item?.evidence?.vivaResponse)errors.push(`${where}: practical observation and viva evidence are required`);
    if(!Array.isArray(item?.anchors)||item.anchors.length!==value.scoreScale?.max+1||item.anchors.some((a:any,i:number)=>a.score!==i||!a.label))errors.push(`${where}: anchors must cover every score in the shared scale`);
  }
  return errors;
}
export function validateExperimentDatasetAgainstContent(value:ExperimentDataset,bundle:any):string[]{
  const errors:string[]=[];if(!bundle||bundle.contentSet?.id!==value.contentSetId)errors.push('Dataset contentSetId does not match a loaded versioned content bundle');
  if(bundle?.contentSet?.classification!=='SYNTHETIC_DEMO')errors.push('Synthetic experiment cases may use only an explicitly synthetic content bundle');
  if(bundle?.contentSet?.version&&value.rubricVersion!==`${bundle.contentSet.version}-rubric`)errors.push('Dataset rubricVersion does not match its content bundle version');
  for(const item of value.cases||[]){const criterion=(bundle?.performanceCriteria||[]).find((x:any)=>x.id===item.criterion.id),nos=(bundle?.standards||[]).find((x:any)=>x.id===item.criterion.nosId),mapping=(bundle?.taskMappings||[]).find((x:any)=>x.taskId===item.taskId&&x.nosId===item.criterion.nosId&&(x.criterionIds||[]).includes(item.criterion.id));if(!criterion)errors.push(`${item.id}: criterion ${item.criterion.id} is absent from the versioned bundle`);if(!nos)errors.push(`${item.id}: NOS ${item.criterion.nosId} is absent from the versioned bundle`);if(!mapping)errors.push(`${item.id}: task, NOS, and criterion relationship is unsupported by the loaded bundle`);if(criterion&&criterion.nosId!==item.criterion.nosId)errors.push(`${item.id}: criterion belongs to another NOS`);if(criterion&&JSON.stringify(item.anchors)!==JSON.stringify(criterion.anchors.map((a:any)=>({score:a.score,label:a.description}))))errors.push(`${item.id}: score anchors do not match the referenced rubric criterion`);if(!['VERIFIED','PROVISIONAL','UNMAPPED','REJECTED'].includes(item.criterion.mappingStatus))errors.push(`${item.id}: mapping status is invalid`);}
  return errors;
}

export class ExperimentStore {
  readonly file:string; private state:State; private chain:Promise<void>=Promise.resolve();
  constructor(file=path.resolve(process.cwd(),process.env.SKILLSETU_EXPERIMENT_STORE_FILE||'data/assessor-experiments.json')){
    this.file=path.resolve(file);fs.mkdirSync(path.dirname(this.file),{recursive:true});
    if(fs.existsSync(this.file)){const loaded=JSON.parse(fs.readFileSync(this.file,'utf8'));this.state={schemaVersion:1,experiments:Array.isArray(loaded.experiments)?loaded.experiments:[],audit:Array.isArray(loaded.audit)?loaded.audit:[]}}
    else this.state={schemaVersion:1,experiments:[],audit:[]};
  }
  get data():State{return structuredClone(this.state)}
  async transact<T>(fn:(draft:State)=>T|Promise<T>):Promise<T>{
    const operation=this.chain.then(async()=>{const draft=structuredClone(this.state),result=await fn(draft),snapshot=JSON.stringify(draft,null,2)+'\n',temp=`${this.file}.${randomUUID()}.tmp`,backup=`${this.file}.${randomUUID()}.bak`;let backedUp=false;try{fs.writeFileSync(temp,snapshot,{flag:'wx',mode:0o600});if(fs.existsSync(this.file)){fs.copyFileSync(this.file,backup);backedUp=true;fs.writeFileSync(this.file,snapshot,{encoding:'utf8',mode:0o600})}else fs.writeFileSync(this.file,snapshot,{flag:'wx',mode:0o600});fs.rmSync(temp,{force:true});if(backedUp)fs.rmSync(backup,{force:true})}catch(error){try{fs.rmSync(temp,{force:true})}catch{}if(backedUp&&fs.existsSync(backup))try{fs.copyFileSync(backup,this.file);fs.rmSync(backup,{force:true})}catch{}throw error}this.state=draft;return result});this.chain=operation.then(()=>undefined,()=>undefined);return operation;
  }
}

export function experimentMetrics(experiment:Experiment,dataset:ExperimentDataset){
  const casesById=new Map(dataset.cases.map(item=>[item.id,item]));
  const conditions=(['MANUAL','ASSISTED'] as const).map(condition=>{
      const submitted=experiment.attempts.filter(a=>a.condition===condition&&a.status==='SUBMITTED'&&Number.isInteger(a.score));
      const grouped=new Map<string,ScoringAttempt[]>();for(const a of submitted){const list=grouped.get(a.caseId)||[];list.push(a);grouped.set(a.caseId,list)}
      const comparisons:[number,number,string][]=[];for(const [caseId,list] of grouped)for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)comparisons.push([list[i].score!,list[j].score!,caseId]);
      const exact=comparisons.length?comparisons.filter(x=>x[0]===x[1]).length/comparisons.length:null;
      const criterionGroups=new Map<string,typeof comparisons>();for(const row of comparisons){const criterion=casesById.get(row[2])?.criterion.id||'unknown';const list=criterionGroups.get(criterion)||[];list.push(row);criterionGroups.set(criterion,list)}
      const kappas:any[]=[];const assessors=[...new Set(submitted.map(a=>a.assessorId))];for(let i=0;i<assessors.length;i++)for(let j=i+1;j<assessors.length;j++){const right=new Map(submitted.filter(a=>a.assessorId===assessors[j]).map(a=>[a.caseId,a.score!]));const paired=submitted.filter(a=>a.assessorId===assessors[i]&&right.has(a.caseId));const left=paired.map(a=>a.score!),other=paired.map(a=>right.get(a.caseId)!);const kappa=weightedKappa(left,other,4);kappas.push({assessorA:assessors[i],assessorB:assessors[j],...kappa})}
      return {condition,submittedAttempts:submitted.length,assignedAttempts:experiment.attempts.filter(a=>a.condition===condition).length,assessorCount:assessors.length,casesWithComparisons:grouped.size,comparablePairs:comparisons.length,exactAgreement:exact,exactAgreementExplanation:'Identical score pairs divided by all within-case assessor pairs; unit is assessor-pair by case.',kappas,byCase:[...grouped].map(([caseId,list])=>{const pairs=comparisons.filter(x=>x[2]===caseId);return{caseId,assessorCount:list.length,pairs:pairs.length,identicalPairs:pairs.filter(x=>x[0]===x[1]).length}}),byCriterion:[...criterionGroups].map(([criterionId,rows])=>({criterionId,comparablePairs:rows.length,exactAgreement:rows.length?rows.filter(x=>x[0]===x[1]).length/rows.length:null,nosId:casesById.get(rows[0]?.[2])?.criterion.nosId||null,mappingStatus:casesById.get(rows[0]?.[2])?.criterion.mappingStatus||'UNAVAILABLE'})),missingOrIncomplete:experiment.attempts.filter(a=>a.condition===condition&&a.status!=='SUBMITTED').length};
    });
  const manual=conditions.find(c=>c.condition==='MANUAL')!,assisted=conditions.find(c=>c.condition==='ASSISTED')!,assistedCases=new Set(assisted.byCase.map(x=>x.caseId)),commonCases=manual.byCase.filter(x=>assistedCases.has(x.caseId)).map(x=>x.caseId),aligned=(condition:any)=>{const rows=condition.byCase.filter((x:any)=>commonCases.includes(x.caseId));const pairs=rows.reduce((sum:number,x:any)=>sum+x.pairs,0),same=rows.reduce((sum:number,x:any)=>sum+x.identicalPairs,0);return{exactAgreement:pairs?same/pairs:null,comparablePairs:pairs}};const manualAligned=aligned(manual),assistedAligned=aligned(assisted),enough=conditions.every(c=>c.assessorCount>=2)&&commonCases.length>=2&&manualAligned.comparablePairs>0&&assistedAligned.comparablePairs>0,difference=manualAligned.exactAgreement===null||assistedAligned.exactAgreement===null?null:Number(((assistedAligned.exactAgreement-manualAligned.exactAgreement)*100).toFixed(1));
  return {version:experiment.metricVersion,classification:experiment.classification,simulated:experiment.classification==='SYNTHETIC_DEMO',
    rubricVersion:experiment.rubricVersion,mappingVersion:experiment.mappingVersion,
    conditions,comparison:{manualExactAgreement:manualAligned.exactAgreement,assistedExactAgreement:assistedAligned.exactAgreement,manualComparablePairs:manualAligned.comparablePairs,assistedComparablePairs:assistedAligned.comparablePairs,matchedCaseCount:commonCases.length,differencePercentagePoints:difference,conclusion:!enough?'Insufficient evidence':difference!>0?'Higher observed agreement in the assisted condition':difference===0?'No observed difference in exact agreement':'Lower observed agreement in the assisted condition'},excluded:experiment.attempts.filter(a=>a.status==='SUBMITTED'&&!Number.isInteger(a.score)).map(a=>({attemptId:a.id,reason:'Submitted score is missing or invalid'})),
    conclusion:enough?'Observed consistency comparison; not evidence of accuracy or causal effectiveness':'Insufficient evidence: at least two assessors and two matched cases in both conditions are required.',limitations:['Synthetic case evidence cannot establish real-world effectiveness.','NOS references in this demo dataset are provisional; criterion-level results are descriptive only.','Study allocation is small and does not establish causal effectiveness.']};
}
function weightedKappa(a:number[],b:number[],max:number){return weightedCohenKappa(a,b,max)}
