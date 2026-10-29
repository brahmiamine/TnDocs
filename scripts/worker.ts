import 'dotenv/config';
import {releaseCommittedArtifact} from '../src/platform/jobs/artifacts';
import {performIdentityMail} from '../src/modules/identity/mailer';
import {performSignatureMail} from '../src/modules/signatures/mailer';
import {runRetentionSweep,performStorageDelete} from '../src/platform/retention/sweep';
import {setTimeout} from 'node:timers/promises';
import {claimJob,completeJob,failJob,heartbeatJob} from '../src/platform/jobs/queue';
import {performSignatureExport} from '../src/modules/signatures/export-service';
import {deleteStoredAttachment} from '../src/modules/dossiers/file-storage';
import {sourceObservationJob,scheduleDueSources} from '../src/modules/sources/service';
import {deliverWebPush,deliverNotificationEmail} from '../src/modules/notifications/delivery';
import {performDocumentExport} from '../src/modules/documents/export-service';
import {syncPublishedTemplateToSearch,rebuildPublishedTemplateIndex} from '../src/modules/catalog/search-index';
let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
async function main(){
 let lastSchedule=0;
 while(!stopping){
  if(Date.now()-lastSchedule>60000){await scheduleDueSources();await runRetentionSweep();lastSchedule=Date.now();}
  const job=await claimJob(['catalog.sync','catalog.rebuild','document.export','signature.export','source.observe','notification.push','notification.email','storage.delete','signature.mail','identity.mail']);if(!job){await setTimeout(1000);continue;}
  const heartbeat=setInterval(()=>{void heartbeatJob(job.id,job.leaseToken).catch(()=>undefined)},30000);
  try{let result:Record<string,unknown>;
   if(job.kind==='catalog.sync'){if(typeof job.payload.templateId!=='string')throw new Error('INVALID_JOB');if(!await syncPublishedTemplateToSearch(job.payload.templateId))throw new Error('SEARCH_UNAVAILABLE');result={synced:true};}
   else if(job.kind==='catalog.rebuild'){result=await rebuildPublishedTemplateIndex();if(!result.configured)throw new Error('SEARCH_UNAVAILABLE');}
   else if(job.kind==='identity.mail')result=await performIdentityMail(job);
   else if(job.kind==='signature.mail')result=await performSignatureMail(job);
   else if(job.kind==='storage.delete'){await performStorageDelete(job.payload);result={deleted:true};}
   else if(job.kind==='signature.export')result=await performSignatureExport(job);
   else if(job.kind==='source.observe')result=await sourceObservationJob(job.payload);
   else if(job.kind==='notification.push')result=await deliverWebPush(String(job.payload.notificationId));
   else if(job.kind==='notification.email')result=await deliverNotificationEmail(String(job.payload.notificationId));
   else result=await performDocumentExport(job);
   if(!await completeJob(job.id,job.leaseToken,result)){if(typeof result.storageKey==='string')await deleteStoredAttachment(result.storageKey);console.warn(JSON.stringify({event:'job_lease_lost',jobId:job.id}));}else if(typeof result.storageKey==='string'){await releaseCommittedArtifact(job.id,result.storageKey);}
  }catch(error){const code=error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:'TASK_FAILED';await failJob(job,code);console.warn(JSON.stringify({event:'job_retry',jobId:job.id,code}));}
  finally{clearInterval(heartbeat);}
 }
}
main().catch(()=>{console.error(JSON.stringify({event:'worker_unavailable'}));process.exitCode=1});
