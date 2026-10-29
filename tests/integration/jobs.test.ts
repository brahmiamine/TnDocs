import test, {after} from 'node:test';import assert from 'node:assert/strict';
after(async()=>{if(enabled){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
const enabled=!!process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1));
test('MariaDB queue atomically deduplicates, leases once and rejects stale acknowledgements',{skip:!enabled},async()=>{
 const {enqueueJob,enqueueRegenerableExport,claimJob,completeJob}=await import('../../src/platform/jobs/queue');
 const {database}=await import('../../src/platform/database/client');const {jobs}=await import('../../src/platform/jobs/schema');const {eq}=await import('drizzle-orm');const {randomUUID}=await import('node:crypto');
 const kind=`test.${randomUUID()}`;const key=`test:${randomUUID()}`;
 const results=await Promise.all(Array.from({length:8},()=>enqueueJob({kind,key,payload:{fixture:true}})));
 assert.equal(new Set(results.map(r=>r.id)).size,1);
 const claims=await Promise.all(Array.from({length:6},()=>claimJob([kind])));const leased=claims.filter(Boolean);assert.equal(leased.length,1);const job=leased[0]!;
 assert.equal(await completeJob(job.id,'stale-token',{}),false);assert.equal(await completeJob(job.id,job.leaseToken,{success:true}),true);assert.equal(await claimJob([kind]),null);
 const fresh=await enqueueRegenerableExport({kind,key,payload:{fixture:true}});assert.notEqual(fresh.id,job.id);await database!.delete(jobs).where(eq(jobs.id,job.id));await database!.delete(jobs).where(eq(jobs.id,fresh.id));
});
