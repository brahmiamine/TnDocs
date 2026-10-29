import { and, desc, eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { privateTemplates,privateTemplateVersions } from "@/modules/private-templates/db-schema";
import { privateTemplateAccess, privateJson, modelFailure } from "@/modules/private-templates/http";
export async function GET(_request:Request,{params}:{params:Promise<{templateId:string}>}){
 const {user,response}=await privateTemplateAccess();if(response)return response;const {templateId}=await params;
 try{const versions=await database!.select({version:privateTemplateVersions.version,createdAt:privateTemplateVersions.createdAt}).from(privateTemplateVersions).innerJoin(privateTemplates,eq(privateTemplates.id,privateTemplateVersions.templateId)).where(and(eq(privateTemplates.id,templateId),eq(privateTemplates.ownerUserId,user.id))).orderBy(desc(privateTemplateVersions.version));return privateJson({versions});}catch(error){return modelFailure(error);}
}
