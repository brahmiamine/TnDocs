import {readJsonBody} from "@/modules/identity/http";
import {createOrganization,listOrganizations,updateOrganization} from "@/modules/catalog/taxonomy";
import {taxonomyAccess,taxonomyJson,taxonomyFailure} from "@/modules/catalog/taxonomy-http";
export async function GET(){const {response}=await taxonomyAccess();if(response)return response;try{return taxonomyJson({organizations:await listOrganizations()});}catch(error){return taxonomyFailure(error);}}
export async function POST(request:Request){const {user,response}=await taxonomyAccess(request);if(response)return response;try{return taxonomyJson(await createOrganization(user.id,await readJsonBody(request,32*1024)),201);}catch(error){return taxonomyFailure(error);}}
export async function PATCH(request:Request){const {user,response}=await taxonomyAccess(request);if(response)return response;try{const result=await updateOrganization(user.id,await readJsonBody(request,32*1024));return result?taxonomyJson(result):taxonomyJson({code:"NOT_FOUND"},404);}catch(error){return taxonomyFailure(error);}}
