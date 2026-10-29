import { readJsonBody } from "@/modules/identity/http";
import { privateTemplateInputSchema, sanitizeReusableTemplate } from "@/modules/private-templates/model";
import { createPrivateTemplate, listPrivateTemplates } from "@/modules/private-templates/service";
import { privateTemplateAccess, privateError, privateJson, modelFailure } from "@/modules/private-templates/http";
export async function GET(){const {user,response}=await privateTemplateAccess();if(response)return response;try{return privateJson({templates:await listPrivateTemplates(user.id)});}catch(error){return modelFailure(error);}}
export async function POST(request:Request){
 const {user,response}=await privateTemplateAccess(request);if(response)return response;
 const parsed=privateTemplateInputSchema.safeParse(await readJsonBody(request,160*1024));if(!parsed.success)return privateError("INVALID_INPUT",400);
 try{return privateJson(await createPrivateTemplate(user.id,sanitizeReusableTemplate(parsed.data)),201);}catch(error){return modelFailure(error);}
}
