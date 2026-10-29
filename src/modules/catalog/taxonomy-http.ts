import {NextResponse} from "next/server";
import {ZodError} from "zod";
import {database} from "@/platform/database/client";
import {userHasRole} from "@/modules/identity/authorization";
import {requireSameOrigin} from "@/modules/identity/http";
export function taxonomyJson(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Robots-Tag":"noindex, nofollow"}});}
export async function taxonomyAccess(request?:Request){
 if(request){const error=requireSameOrigin(request);if(error)return {user:null,response:error};}
 const {user,reason}=await userHasRole("admin");if(!user)return {user:null,response:taxonomyJson({code:reason==="unauthenticated"?"UNAUTHENTICATED":"FORBIDDEN"},reason==="unauthenticated"?401:403)};
 if(!database)return {user:null,response:taxonomyJson({code:"SERVICE_UNAVAILABLE"},503)};
 return {user,response:null};
}
export function taxonomyFailure(error:unknown){
 if(error instanceof ZodError)return taxonomyJson({code:"INVALID_INPUT",fields:error.flatten().fieldErrors},400);
 const code=error instanceof Error?error.message:"";
 if(["CATEGORY_CYCLE","SLUG_EXISTS"].includes(code))return taxonomyJson({code},409);
 if(["PARENT_NOT_FOUND","TRANSLATION_REQUIRED"].includes(code))return taxonomyJson({code},400);
 return taxonomyJson({code:"CATALOG_UNAVAILABLE"},503);
}
