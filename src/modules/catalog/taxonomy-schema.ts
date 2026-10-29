import {z} from "zod";
const slug=z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const translation=z.object({name:z.string().trim().min(1).max(180),description:z.string().trim().max(500).default("")}).strict();
const translations=z.object({fr:translation.optional(),ar:translation.optional()}).strict().refine(value=>Boolean(value.fr||value.ar),"At least one explicit translation is required.");
const translationPatch=z.object({fr:translation.nullable().optional(),ar:translation.nullable().optional()}).strict();
const officialUrl=z.string().url().max(2048).refine(value=>{try{const url=new URL(value);return url.protocol==="https:"&&!url.username&&!url.password;}catch{return false;}},"Use HTTPS without URL credentials.");
export const categoryCreateSchema=z.object({slug,parentId:z.string().uuid().nullable().default(null),sortOrder:z.number().int().min(-2147483648).max(2147483647).default(0),active:z.boolean().default(true),translations}).strict();
export const categoryUpdateSchema=z.object({id:z.string().uuid(),parentId:z.string().uuid().nullable().optional(),sortOrder:z.number().int().min(-2147483648).max(2147483647).optional(),active:z.boolean().optional(),translations:translationPatch.optional()}).strict().refine(value=>Object.keys(value).length>1,"At least one change is required.");
export const organizationCreateSchema=z.object({slug,officialUrl:officialUrl.nullable().default(null),active:z.boolean().default(true),translations}).strict();
export const organizationUpdateSchema=z.object({id:z.string().uuid(),officialUrl:officialUrl.nullable().optional(),active:z.boolean().optional(),translations:translationPatch.optional()}).strict().refine(value=>Object.keys(value).length>1,"At least one change is required.");
export type TaxonomyTranslation=z.infer<typeof translation>;
export type TaxonomyTranslations={fr:TaxonomyTranslation|null;ar:TaxonomyTranslation|null};
export function mergeTaxonomyTranslations(current:TaxonomyTranslations,patch:Partial<TaxonomyTranslations>):TaxonomyTranslations{
 const result={...current};for(const locale of ["fr","ar"] as const)if(patch[locale]!==undefined)result[locale]=patch[locale];if(!result.fr&&!result.ar)throw new Error("TRANSLATION_REQUIRED");return result;
}
export function assertCategoryParent(id:string,parentId:string|null,graph:ReadonlyArray<{id:string;parentId:string|null}>){
 if(parentId===null)return;
 const parents=new Map(graph.map(node=>[node.id,node.parentId]));if(!parents.has(parentId))throw new Error("PARENT_NOT_FOUND");
 const seen=new Set<string>([id]);let current:string|null=parentId;
 while(current!==null){if(seen.has(current))throw new Error("CATEGORY_CYCLE");seen.add(current);current=parents.get(current)??null;}
}
