import {normalizeStoreData, StoreData} from './store';

const collections=['users','candidates','declarations','assessments','evidence','reports','audit','notifications','calibrationRatings','mappingReviews','offlineSyncReceipts'] as const;
type Collection=typeof collections[number];

/** Validate imported identities and known cross-record references without printing record values. */
export function validateStoreData(input:unknown):{data:StoreData;errors:string[]}{
  const errors:string[]=[];
  if(!input||typeof input!=='object'||Array.isArray(input))return {data:{} as StoreData,errors:['Store root must be a JSON object']};
  const data=normalizeStoreData(input as StoreData);
  const ids=new Map<Collection,Set<string>>();
  for(const collection of collections){
    const records=(data as any)[collection];
    if(!Array.isArray(records)){errors.push(`${collection}: expected an array`);ids.set(collection,new Set());continue}
    const seen=new Set<string>();ids.set(collection,seen);
    records.forEach((record:any,index:number)=>{
      if(!record||typeof record!=='object'||Array.isArray(record)){errors.push(`${collection}[${index}]: expected an object`);return}
      const id=typeof record.id==='string'?record.id.trim():'';
      if(!id){errors.push(`${collection}[${index}]: required id is missing`);return}
      if(seen.has(id))errors.push(`${collection}[${index}]: duplicate id in ${collection}`);
      seen.add(id);
    });
  }
  const has=(collection:Collection,id:unknown)=>typeof id==='string'&&!!id&&ids.get(collection)?.has(id);
  const reference=(collection:Collection,field:string,target:Collection,optional=false)=>{
    for(const [index,record] of ((data as any)[collection]||[]).entries()){
      const value=record?.[field];if((value===null||value===undefined||value==='')&&optional)continue;
      if(!has(target,value))errors.push(`${collection}[${index}]: ${field} refers to a missing ${target} record`);
    }
  };
  reference('users','candidateId','candidates',true);
  reference('candidates','ownerUserId','users',true);
  reference('declarations','candidateId','candidates');
  reference('assessments','candidateId','candidates');
  reference('assessments','assessorId','users',true);
  reference('assessments','declarationId','declarations',true);
  reference('assessments','previousAssessmentId','assessments',true);
  reference('assessments','reviewerId','users',true);
  reference('evidence','assessmentId','assessments',true);
  reference('evidence','candidateId','candidates',true);
  reference('evidence','uploadedBy','users',true);
  reference('reports','assessmentId','assessments');
  reference('reports','candidateId','candidates',true);
  reference('notifications','userId','users');
  reference('calibrationRatings','userId','users');
  reference('mappingReviews','reviewerId','users',true);
  reference('offlineSyncReceipts','userId','users');
  reference('offlineSyncReceipts','assessmentId','assessments');
  const usernames=new Set<string>();
  for(const [index,user] of data.users.entries())if(user.username){if(usernames.has(user.username))errors.push(`users[${index}]: duplicate username`);usernames.add(user.username)}
  return {data,errors};
}
