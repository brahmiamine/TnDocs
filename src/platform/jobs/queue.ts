import { and, eq, gt, lt, lte, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { database } from '@/platform/database/client';
import { jobs } from './schema';
import { retryDelayMs } from './policy';
type Db = NonNullable<typeof database>;
export type JobTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type JobInput={kind:string;key:string;ownerUserId?:string;payload:Record<string,unknown>;maxAttempts?:number};
export async function enqueueJob(input:JobInput, db:Db|JobTransaction = requireDb()) {
 const id=randomUUID();
 await db.insert(jobs).values({id,kind:input.kind,deduplicationKey:input.key,ownerUserId:input.ownerUserId,payload:input.payload,maxAttempts:input.maxAttempts??5}).onDuplicateKeyUpdate({set:{deduplicationKey:input.key}});
 const [row]=await db.select().from(jobs).where(eq(jobs.deduplicationKey,input.key)).limit(1);
 if(!row)throw new Error('JOB_ENQUEUE_FAILED'); return row;
}
function requireDb(){if(!database)throw new Error('DATABASE_NOT_CONFIGURED');return database;}
export async function claimJob(kinds:string[],leaseMs=120000){
 if(!kinds.length)return null;
 const db=requireDb(); const now=new Date();
 return db.transaction(async tx=>{
  await tx.update(jobs).set({status:'dead',errorCode:'ATTEMPTS_EXHAUSTED',leaseToken:null,leaseExpiresAt:null}).where(and(eq(jobs.status,'leased'),lte(jobs.leaseExpiresAt,now),sql`${jobs.attempts} >= ${jobs.maxAttempts}`));
  const [row]=await tx.select().from(jobs).where(and(
   or(...kinds.map(kind=>eq(jobs.kind,kind))),lt(jobs.attempts,jobs.maxAttempts),
   or(and(or(eq(jobs.status,'pending'),eq(jobs.status,'retrying')),lte(jobs.availableAt,now)),and(eq(jobs.status,'leased'),lte(jobs.leaseExpiresAt,now)))
  )).orderBy(jobs.availableAt).limit(1).for('update',{skipLocked:true});
  if(!row)return null;
  const token=randomUUID();const expires=new Date(now.getTime()+leaseMs);
  await tx.update(jobs).set({status:'leased',leaseToken:token,leaseExpiresAt:expires,attempts:row.attempts+1}).where(eq(jobs.id,row.id));
  return {...row,status:'leased' as const,leaseToken:token,leaseExpiresAt:expires,attempts:row.attempts+1};
 });
}
function liveLease(id:string,token:string){return and(eq(jobs.id,id),eq(jobs.status,'leased'),eq(jobs.leaseToken,token),gt(jobs.leaseExpiresAt,new Date()));}
export async function heartbeatJob(id:string,token:string,leaseMs=120000){ const r=await requireDb().update(jobs).set({leaseExpiresAt:new Date(Date.now()+leaseMs)}).where(liveLease(id,token));return r[0].affectedRows===1;}
export async function completeJob(id:string,token:string,result:Record<string,unknown>){const r=await requireDb().update(jobs).set({status:'done',result,leaseToken:null,leaseExpiresAt:null,errorCode:null}).where(liveLease(id,token));return r[0].affectedRows===1;}
export async function failJob(job:{id:string;leaseToken:string;attempts:number;maxAttempts:number},code='TASK_FAILED'){
 const r=await requireDb().update(jobs).set({status:job.attempts>=job.maxAttempts?'dead':'retrying',availableAt:new Date(Date.now()+retryDelayMs(job.attempts)),errorCode:/^[A-Z_]{1,80}$/.test(code)?code:'TASK_FAILED',leaseToken:null,leaseExpiresAt:null}).where(liveLease(job.id,job.leaseToken));return r[0].affectedRows===1;
}

/** Active requests deduplicate; completed-expired or failed exports may be regenerated. */
export async function enqueueRegenerableExport(input:JobInput){
 return requireDb().transaction(async tx=>{
  const [existing]=await tx.select().from(jobs).where(eq(jobs.deduplicationKey,input.key)).limit(1).for('update');
  if(existing&&(existing.status==='dead'||existing.status==='cancelled'||existing.status==='done'&&!existing.result?.storageKey)){
   await tx.update(jobs).set({deduplicationKey:`retired:${existing.id}`}).where(eq(jobs.id,existing.id));
  }
  return enqueueJob(input,tx);
 });
}
