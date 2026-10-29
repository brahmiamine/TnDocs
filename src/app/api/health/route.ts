import {NextResponse} from 'next/server';import {sql} from 'drizzle-orm';import {database} from '@/platform/database/client';
export const dynamic='force-dynamic';
/** Liveness remains independent; readiness explicitly probes the required database. */
export async function GET(request:Request){
 if(new URL(request.url).searchParams.get('ready')!=='1')return NextResponse.json({status:'ok',service:'web'},{headers:{'Cache-Control':'no-store'}});
 if(!database)return NextResponse.json({status:'not_ready',database:'not_configured'},{status:503,headers:{'Cache-Control':'no-store'}});
 try{await database.execute(sql`select 1`);return NextResponse.json({status:'ready',database:'available'},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({status:'not_ready',database:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
