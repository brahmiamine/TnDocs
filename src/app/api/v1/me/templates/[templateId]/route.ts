import { readJsonBody } from "@/modules/identity/http";
import { updatePrivateTemplateSchema } from "@/modules/private-templates/model";
import { getPrivateTemplate, updatePrivateTemplate, deletePrivateTemplate } from "@/modules/private-templates/service";
import { privateTemplateAccess, privateError, privateJson, modelFailure } from "@/modules/private-templates/http";
type Context={params:Promise<{templateId:string}>};
export async function GET(request:Request,{params}:Context){
 const {user,response}=await privateTemplateAccess();if(response)return response;const {templateId}=await params;
 const value=new URL(request.url).searchParams.get("version");const version=value===null?undefined:Number(value);
 if(version!==undefined&&(!Number.isSafeInteger(version)||version<1))return privateError("INVALID_INPUT",400);
 try{const template=await getPrivateTemplate(user.id,templateId,version);return template?privateJson({template}):privateError("NOT_FOUND",404);}catch(error){return modelFailure(error);}
}
export async function PATCH(request:Request,{params}:Context){
 const {user,response}=await privateTemplateAccess(request);if(response)return response;const {templateId}=await params;
 const parsed=updatePrivateTemplateSchema.safeParse(await readJsonBody(request,160*1024));if(!parsed.success)return privateError("INVALID_INPUT",400);
 const {expectedVersion,confirmSanitized,...changes}=parsed.data;void confirmSanitized;
 try{const template=await updatePrivateTemplate(user.id,templateId,expectedVersion,changes);return template?privateJson(template):privateError("NOT_FOUND",404);}catch(error){return modelFailure(error);}
}
export async function DELETE(request:Request,{params}:Context){
 const {user,response}=await privateTemplateAccess(request);if(response)return response;const {templateId}=await params;
 try{return await deletePrivateTemplate(user.id,templateId)?privateJson({deleted:true}):privateError("NOT_FOUND",404);}catch(error){return modelFailure(error);}
}
