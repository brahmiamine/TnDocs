import test from 'node:test';
import assert from 'node:assert/strict';
import { retryDelayMs, canClaimJob, ownsLease } from '../src/platform/jobs/policy';
test('pending due jobs and expired leases recover, terminal jobs never run', () => {
 const now=10000;
 assert.equal(canClaimJob({status:'pending',availableAt:now,leaseExpiresAt:null,attempts:0,maxAttempts:3},now),true);
 assert.equal(canClaimJob({status:'pending',availableAt:now+1,leaseExpiresAt:null,attempts:0,maxAttempts:3},now),false);
 assert.equal(canClaimJob({status:'leased',availableAt:0,leaseExpiresAt:now-1,attempts:1,maxAttempts:3},now),true);
 for(const status of ['done','dead','cancelled']) assert.equal(canClaimJob({status,availableAt:0,leaseExpiresAt:0,attempts:1,maxAttempts:3},now),false);
 assert.equal(canClaimJob({status:'leased',availableAt:0,leaseExpiresAt:now+1,attempts:1,maxAttempts:3},now),false);
});
test('stale worker cannot acknowledge a reclaimed lease',()=> {
 assert.equal(ownsLease({status:'leased',leaseToken:'new',leaseExpiresAt:200},'old',100),false);
 assert.equal(ownsLease({status:'leased',leaseToken:'new',leaseExpiresAt:200},'new',200),false);
 assert.equal(ownsLease({status:'leased',leaseToken:'new',leaseExpiresAt:200},'new',100),true);
});
test('backoff is exponential and bounded',()=>{assert.equal(retryDelayMs(1),1000); assert.equal(retryDelayMs(2),2000);assert.equal(retryDelayMs(20),3600000)});
