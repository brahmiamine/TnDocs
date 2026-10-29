import {randomUUID} from "node:crypto";
import {and,asc,desc,eq} from "drizzle-orm";
import {database} from "@/platform/database/client";
import {catalogCategories,catalogCategoryTranslations,catalogOrganizations,catalogOrganizationTranslations,platformMetadata} from "@/platform/database/schema";
import {systemAuditEvents} from "@/modules/administration/db-schema";
import type {JobTransaction} from "@/platform/jobs/queue";
import {categoryCreateSchema,categoryUpdateSchema,organizationCreateSchema,organizationUpdateSchema,assertCategoryParent,mergeTaxonomyTranslations,type TaxonomyTranslations} from "./taxonomy-schema";
export type CategoryRecord={id:string;slug:string;parentId:string|null;sortOrder:number;active:boolean;translations:TaxonomyTranslations};
export type OrganizationRecord={id:string;slug:string;officialUrl:string|null;active:boolean;translations:TaxonomyTranslations};
function db(){if(!database)throw new Error("SERVICE_UNAVAILABLE");return database;}
/** Every writer takes this mutex BEFORE reading taxonomy. This avoids stale repeatable-read graphs and concurrent reparent cycles. */
export async function lockCatalogTaxonomy(tx:JobTransaction){
 await tx.insert(platformMetadata).values({key:"catalog_taxonomy_lock",value:"v1"}).onDuplicateKeyUpdate({set:{value:"v1"}});
 await tx.select().from(platformMetadata).where(eq(platformMetadata.key,"catalog_taxonomy_lock")).for("update").limit(1);
}
async function audit(tx:JobTransaction,actorId:string,resourceId:string,action:"category_created"|"category_updated"|"organization_created"|"organization_updated"){
 const [last]=await tx.select({revision:systemAuditEvents.revision}).from(systemAuditEvents).where(eq(systemAuditEvents.resourceId,resourceId)).orderBy(desc(systemAuditEvents.revision)).limit(1);
 await tx.insert(systemAuditEvents).values({id:randomUUID(),actorUserId:actorId,resourceId,action,revision:(last?.revision??0)+1});
}
async function categoryTranslations(tx:JobTransaction,id:string):Promise<TaxonomyTranslations>{
 const rows=await tx.select().from(catalogCategoryTranslations).where(eq(catalogCategoryTranslations.categoryId,id));const result:TaxonomyTranslations={fr:null,ar:null};for(const row of rows)result[row.locale]={name:row.name,description:row.description};return result;
}
async function organizationTranslations(tx:JobTransaction,id:string):Promise<TaxonomyTranslations>{
 const rows=await tx.select().from(catalogOrganizationTranslations).where(eq(catalogOrganizationTranslations.organizationId,id));const result:TaxonomyTranslations={fr:null,ar:null};for(const row of rows)result[row.locale]={name:row.name,description:row.description};return result;
}
async function writeCategoryTranslations(tx:JobTransaction,id:string,values:TaxonomyTranslations){for(const locale of ["fr","ar"] as const){const value=values[locale];if(value)await tx.insert(catalogCategoryTranslations).values({categoryId:id,locale,...value}).onDuplicateKeyUpdate({set:value});else await tx.delete(catalogCategoryTranslations).where(and(eq(catalogCategoryTranslations.categoryId,id),eq(catalogCategoryTranslations.locale,locale)));}}
async function writeOrganizationTranslations(tx:JobTransaction,id:string,values:TaxonomyTranslations){for(const locale of ["fr","ar"] as const){const value=values[locale];if(value)await tx.insert(catalogOrganizationTranslations).values({organizationId:id,locale,...value}).onDuplicateKeyUpdate({set:value});else await tx.delete(catalogOrganizationTranslations).where(and(eq(catalogOrganizationTranslations.organizationId,id),eq(catalogOrganizationTranslations.locale,locale)));}}
function translationView(rows:Array<{locale:"fr"|"ar";name:string;description:string}>):TaxonomyTranslations{const result:TaxonomyTranslations={fr:null,ar:null};for(const row of rows)result[row.locale]={name:row.name,description:row.description};return result;}
export async function listCategories():Promise<CategoryRecord[]>{
 const [rows,translated]=await Promise.all([db().select().from(catalogCategories).orderBy(asc(catalogCategories.sortOrder),asc(catalogCategories.slug)),db().select().from(catalogCategoryTranslations)]);
 return rows.map(row=>({id:row.id,slug:row.slug,parentId:row.parentId,sortOrder:row.sortOrder,active:row.active===1,translations:translationView(translated.filter(item=>item.categoryId===row.id))}));
}
export async function listOrganizations():Promise<OrganizationRecord[]>{
 const [rows,translated]=await Promise.all([db().select().from(catalogOrganizations).orderBy(asc(catalogOrganizations.slug)),db().select().from(catalogOrganizationTranslations)]);
 return rows.map(row=>({id:row.id,slug:row.slug,officialUrl:row.officialUrl,active:row.active===1,translations:translationView(translated.filter(item=>item.organizationId===row.id))}));
}
export async function createCategory(actorId:string,value:unknown){
 const input=categoryCreateSchema.parse(value);const id=randomUUID();
 return db().transaction(async tx=>{await lockCatalogTaxonomy(tx);
  const [duplicate]=await tx.select({id:catalogCategories.id}).from(catalogCategories).where(eq(catalogCategories.slug,input.slug)).limit(1);if(duplicate)throw new Error("SLUG_EXISTS");
  const graph=await tx.select({id:catalogCategories.id,parentId:catalogCategories.parentId}).from(catalogCategories).for("update");assertCategoryParent(id,input.parentId,graph);
  await tx.insert(catalogCategories).values({id,slug:input.slug,parentId:input.parentId,sortOrder:input.sortOrder,active:input.active?1:0});
  await writeCategoryTranslations(tx,id,{fr:input.translations.fr??null,ar:input.translations.ar??null});await audit(tx,actorId,id,"category_created");return {id,slug:input.slug};
 });
}
export async function updateCategory(actorId:string,value:unknown){
 const input=categoryUpdateSchema.parse(value);
 return db().transaction(async tx=>{await lockCatalogTaxonomy(tx);const [row]=await tx.select().from(catalogCategories).where(eq(catalogCategories.id,input.id)).for("update").limit(1);if(!row)return null;
  const parentId=input.parentId===undefined?row.parentId:input.parentId;const graph=await tx.select({id:catalogCategories.id,parentId:catalogCategories.parentId}).from(catalogCategories).for("update");assertCategoryParent(input.id,parentId,graph);
  const translated=mergeTaxonomyTranslations(await categoryTranslations(tx,input.id),input.translations??{});
  await tx.update(catalogCategories).set({parentId,sortOrder:input.sortOrder??row.sortOrder,active:input.active===undefined?row.active:input.active?1:0}).where(eq(catalogCategories.id,input.id));
  await writeCategoryTranslations(tx,input.id,translated);await audit(tx,actorId,input.id,"category_updated");return {id:input.id,slug:row.slug};
 });
}
export async function createOrganization(actorId:string,value:unknown){
 const input=organizationCreateSchema.parse(value);const id=randomUUID();
 return db().transaction(async tx=>{await lockCatalogTaxonomy(tx);const [duplicate]=await tx.select({id:catalogOrganizations.id}).from(catalogOrganizations).where(eq(catalogOrganizations.slug,input.slug)).limit(1);if(duplicate)throw new Error("SLUG_EXISTS");
  await tx.insert(catalogOrganizations).values({id,slug:input.slug,officialUrl:input.officialUrl,active:input.active?1:0});await writeOrganizationTranslations(tx,id,{fr:input.translations.fr??null,ar:input.translations.ar??null});await audit(tx,actorId,id,"organization_created");return {id,slug:input.slug};
 });
}
export async function updateOrganization(actorId:string,value:unknown){
 const input=organizationUpdateSchema.parse(value);
 return db().transaction(async tx=>{await lockCatalogTaxonomy(tx);const [row]=await tx.select().from(catalogOrganizations).where(eq(catalogOrganizations.id,input.id)).for("update").limit(1);if(!row)return null;
  const translated=mergeTaxonomyTranslations(await organizationTranslations(tx,input.id),input.translations??{});
  await tx.update(catalogOrganizations).set({officialUrl:input.officialUrl===undefined?row.officialUrl:input.officialUrl,active:input.active===undefined?row.active:input.active?1:0}).where(eq(catalogOrganizations.id,input.id));await writeOrganizationTranslations(tx,input.id,translated);await audit(tx,actorId,input.id,"organization_updated");return {id:input.id,slug:row.slug};
 });
}
