import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Role = 'WORKER' | 'ASSESSOR' | 'REVIEWER' | 'ADMIN';
export type User = {id:string;username:string|null;passwordHash:string|null;role:Role;phone:string|null;displayName:string;candidateId:string|null;authorizedOccupationIds?:string[];createdAt:string};
export type Candidate = {id:string;ownerUserId:string|null;phone:string|null;name:string;language:string;yearsExperience:number;occupationId?:string;experienceSource?:string;experienceSummary?:string;taskIds:string[];description:string;consent:boolean;synthetic:boolean;createdAt:string;updatedAt:string};
export type Assessment = {id:string;candidateId:string;assessorId:string|null;status:'REQUESTED'|'IN_PROGRESS'|'AWAITING_REVIEW'|'APPROVED'|'RETURNED'|'CANCELLED';declarationId:string|null;contentSetId:string;qualificationPackId?:string|null;scopeTaskIds?:string[];skillId?:string;contentVersion:string;rubricVersion:string;mappingSnapshot?:any;preferredMethod?:'IN_PERSON'|'VIDEO'|'PORTFOLIO';modeDetails?:{location?:string;availability?:string;connectivity?:string;sessionNotes?:string};previousAssessmentId?:string|null;revisions?:any[];scores:any[];viva:any[];draftResult:any|null;humanDecision:string|null;reviewerId:string|null;reviewReason:string|null;createdAt:string;updatedAt:string;synthetic:boolean};
export type StoreData = {users:User[];candidates:Candidate[];declarations:any[];assessments:Assessment[];evidence:any[];reports:any[];audit:any[];notifications?:any[];occupationAvailability?:Record<string,boolean>;calibrationRatings?:any[];mappingReviews?:any[];offlineSyncReceipts?:any[]};

export class JsonStore {
  readonly file: string;
  data: StoreData;
  private writeChain: Promise<void> = Promise.resolve();
  private transactionChain: Promise<void> = Promise.resolve();
  private committedData!: StoreData;
  constructor(seed:any, contentSet:any) {
    this.file=path.resolve(process.cwd(),process.env.SKILLSETU_STORE_FILE||'data/skillsetu-demo-store.json');
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    if (fs.existsSync(this.file)) {
      this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));
      // Additive defaults keep existing JSON stores and profile/assessment records intact.
      this.data.users ||= []; this.data.candidates ||= []; this.data.declarations ||= [];
      this.data.assessments ||= []; this.data.evidence ||= []; this.data.reports ||= []; this.data.audit ||= [];
      this.data.occupationAvailability ||= {};
      this.data.calibrationRatings ||= []; this.data.notifications ||= []; this.data.mappingReviews ||= []; this.data.offlineSyncReceipts ||= [];
    }
    else {
      const now=new Date().toISOString();
      const candidates=(seed.candidates||[]).map((c:any,i:number)=>({id:`SS-${2048-i}`,ownerUserId:null,phone:null,name:c.name,language:c.language||'English',yearsExperience:c.yearsExperience||0,taskIds:c.taskIds||[],description:'',consent:true,synthetic:true,createdAt:now,updatedAt:now}));
      this.data={users:[],candidates,declarations:[],assessments:[],evidence:[],reports:[],audit:[],notifications:[],occupationAvailability:{},calibrationRatings:[],mappingReviews:[],offlineSyncReceipts:[]};
      for(const ex of seed.assessmentExamples||[]) {
        const source=(seed.candidates||[]).find((c:any)=>c.id===ex.candidateId);
        const index=(seed.candidates||[]).indexOf(source);
        const candidate=candidates[index];
        if(!candidate) continue;
        const approved=ex.humanSignoff==='APPROVED';
        this.data.assessments.push({id:ex.id,candidateId:candidate.id,assessorId:null,status:approved?'APPROVED':'AWAITING_REVIEW',declarationId:null,contentSetId:contentSet.id,contentVersion:contentSet.version,rubricVersion:`${contentSet.version}-rubric`,scores:ex.scores||[],viva:[],draftResult:null,humanDecision:approved?'APPROVED':null,reviewerId:null,reviewReason:null,createdAt:now,updatedAt:now,synthetic:true});
      }
      this.persistSync();
    }
    this.committedData=structuredClone(this.data);
  }
  async save(): Promise<void> {
    const next=structuredClone(this.data);
    try {
      await this.enqueueWrite(next);
      this.committedData=structuredClone(next);
    } catch (error) {
      this.data=structuredClone(this.committedData);
      throw error;
    }
  }
  /** Apply one isolated change set and publish it in memory only after the atomic file replacement succeeds. */
  async transact<T>(mutate:(draft:StoreData)=>T|Promise<T>):Promise<T>{
    const operation=this.transactionChain.then(async()=>{
      const draft=structuredClone(this.committedData);
      const result=await mutate(draft);
      await this.enqueueWrite(draft);
      this.data=draft;
      this.committedData=structuredClone(draft);
      return result;
    });
    this.transactionChain=operation.then(()=>undefined,()=>undefined);
    return operation;
  }
  private enqueueWrite(data:StoreData):Promise<void>{
    const snapshot=JSON.stringify(data,null,2)+'\n';
    const operation=this.writeChain.then(()=>this.writeAtomically(snapshot));
    this.writeChain=operation.then(()=>undefined,()=>undefined);
    return operation;
  }
  private writeAtomically(snapshot:string){
    const suffix=randomUUID(),temp=`${this.file}.${suffix}.tmp`,backup=`${this.file}.${suffix}.bak`;
    let backedUp=false;
    try {
      const fd=fs.openSync(temp,'wx',0o600);
      try { fs.writeFileSync(fd,snapshot,{encoding:'utf8'}); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      // Keep a recoverable copy while replacing the target. Synchronous file operations
      // keep this single-process JSON store from serving reads during the replacement.
      if(fs.existsSync(this.file)){
        fs.copyFileSync(this.file,backup);backedUp=true;
        const target=fs.openSync(this.file,'w',0o600);
        try{fs.writeFileSync(target,snapshot,{encoding:'utf8'});fs.fsyncSync(target)}finally{fs.closeSync(target)}
      }else fs.renameSync(temp,this.file);
      fs.rmSync(temp,{force:true});
      if(backedUp)fs.rmSync(backup,{force:true});
    } catch(error) {
      try { fs.rmSync(temp,{force:true}); } catch { /* Preserve the original persistence error. */ }
      if(backedUp&&fs.existsSync(backup))try{fs.copyFileSync(backup,this.file);fs.rmSync(backup,{force:true})}catch{/* Preserve backup for recovery if restore itself fails. */}
      throw error;
    }
  }
  private persistSync(){fs.writeFileSync(this.file,JSON.stringify(this.data,null,2)+'\n',{encoding:'utf8',mode:0o600});}
}
