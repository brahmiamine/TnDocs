import { instantiatePrivateTemplate } from "@/modules/private-templates/service";
import { privateTemplateAccess, privateError, privateJson, modelFailure } from "@/modules/private-templates/http";
export async function POST(request:Request,{params}:{params:Promise<{templateId:string}>}){
 const {user,response}=await privateTemplateAccess(request);if(response)return response;const {templateId}=await params;
 try{const draft=await instantiatePrivateTemplate(user.id,templateId);return draft?privateJson(draft,201):privateError("NOT_FOUND",404);}catch(error){return modelFailure(error);}
}
