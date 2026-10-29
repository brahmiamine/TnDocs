import { z } from "zod";
import { reusableSourceFromDocument } from "@/modules/private-templates/service";
import { privateTemplateAccess, privateError, privateJson, modelFailure } from "@/modules/private-templates/http";
export async function GET(request:Request){
 const {user,response}=await privateTemplateAccess();if(response)return response;
 const query=Object.fromEntries(new URL(request.url).searchParams);const parsed=z.object({documentId:z.string().uuid(),locale:z.enum(["fr","ar"])}).strict().safeParse(query);if(!parsed.success)return privateError("INVALID_INPUT",400);
 try{const blueprint=await reusableSourceFromDocument(user.id,parsed.data.documentId,parsed.data.locale);return blueprint?privateJson({blueprint}):privateError("EDITABLE_SOURCE_NOT_FOUND",404);}catch(error){return modelFailure(error);}
}
