import { customType, foreignKey, index, int, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users, personalDocuments } from "@/platform/database/schema";
const mediumtext = customType<{ data: string }>({ dataType: () => "mediumtext" });
const id = (name: string) => varchar(name, {length:36});
export const privateTemplates = mysqlTable("private_templates", {
  id: id("id").primaryKey(),
  ownerUserId: id("owner_user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  currentVersion: int("current_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table)=>[index("private_templates_owner_updated_idx").on(table.ownerUserId,table.updatedAt)]);
export const privateTemplateVersions = mysqlTable("private_template_versions", {
  id: id("id").primaryKey(),
  templateId: id("template_id").notNull().references(()=>privateTemplates.id,{onDelete:"cascade"}),
  version: int("version").notNull(),
  contentCiphertext:mediumtext("content_ciphertext").notNull(),
  encryptionKeyVersion:varchar("encryption_key_version",{length:8}).notNull(),
  createdAt:timestamp("created_at").notNull().defaultNow(),
},(table)=>[uniqueIndex("private_template_versions_version_unique").on(table.templateId,table.version)]);
/** Independent encrypted snapshot: removing/updating a model cannot alter an existing document. */
export const privateDocumentModels = mysqlTable("private_document_models", {
  documentId:id("document_id").primaryKey().references(()=>personalDocuments.id,{onDelete:"cascade"}),
  sourceTemplateId:id("source_template_id"),
  sourceVersion:int("source_version").notNull(),
  contentCiphertext:mediumtext("content_ciphertext").notNull(),
  encryptionKeyVersion:varchar("encryption_key_version",{length:8}).notNull(),
  createdAt:timestamp("created_at").notNull().defaultNow(),
},(table)=>[foreignKey({name:"private_doc_source_template_fk",columns:[table.sourceTemplateId],foreignColumns:[privateTemplates.id]}).onDelete("set null")]);
