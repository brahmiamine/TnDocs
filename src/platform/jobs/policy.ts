export function retryDelayMs(attempts: number) { return Math.min(3_600_000, 1000 * 2 ** Math.max(0, attempts - 1)); }
export function canClaimJob(job: {status:string; availableAt:number; leaseExpiresAt:number|null;attempts:number;maxAttempts:number}, now:number) {
 return (job.status === 'pending' || job.status === 'retrying') ? job.availableAt <= now && job.attempts < job.maxAttempts
 : job.status === 'leased' && job.leaseExpiresAt !== null && job.leaseExpiresAt <= now && job.attempts < job.maxAttempts;
}
export function ownsLease(job:{status:string;leaseToken:string|null;leaseExpiresAt:number|null},token:string,now:number){return job.status==='leased' && job.leaseToken===token && job.leaseExpiresAt!==null && job.leaseExpiresAt>now;}
