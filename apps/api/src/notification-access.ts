export type NotificationRecord = { id:string; userId:string; [key:string]:unknown };
export type NotificationDeleteResult = {status:'deleted';index:number;item:NotificationRecord}|{status:'missing'}|{status:'forbidden'};
export function notificationsForUser<T extends NotificationRecord>(items:readonly T[],userId:string):T[]{return items.filter(item=>item.userId===userId)}
export function removeOwnedNotification<T extends NotificationRecord>(items:T[],id:string,userId:string):NotificationDeleteResult{const index=items.findIndex(item=>item.id===id);if(index<0)return {status:'missing'};if(items[index].userId!==userId)return {status:'forbidden'};return {status:'deleted',index,item:items.splice(index,1)[0]}}
