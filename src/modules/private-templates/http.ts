import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { database } from "@/platform/database/client";
export function privateJson(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});}
export function privateError(code:string,status:number){return privateJson({code,message:code},status);}
export function modelFailure(error:unknown){if(error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED")return privateError("STORAGE_QUOTA_EXCEEDED",413);return error instanceof Error&&error.message==="REVISION_CONFLICT"?privateError("REVISION_CONFLICT",409):privateError("PRIVATE_TEMPLATE_UNAVAILABLE",503);}
export async function privateTemplateAccess(request?:Request){
  if(request){const origin=requireSameOrigin(request);if(origin)return {response:origin,user:null};}
  const user=await getCurrentUser();if(!user)return {response:privateError("UNAUTHENTICATED",401),user:null};
  if(!database)return {response:privateError("SERVICE_UNAVAILABLE",503),user:null};
  return {response:null,user};
}
