export type DatedHistoryRecord = { at: string; id: string };
export function newestFirst<T extends DatedHistoryRecord>(records: readonly T[]): T[] {
  return [...records].sort((a,b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
export function numberedNewestFirst<T extends DatedHistoryRecord>(records: readonly T[]): Array<{number:number;record:T}> {
  return newestFirst(records).map((record,index)=>({number:index+1,record}));
}
