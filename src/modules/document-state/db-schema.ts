import { int,mysqlEnum,mysqlTable,timestamp,varchar } from "drizzle-orm/mysql-core";
import { personalDocuments } from "@/platform/database/schema";
export const documentStateMetadata=mysqlTable("document_state_metadata",{
 documentId:varchar("document_id",{length:36}).primaryKey().references(()=>personalDocuments.id,{onDelete:"cascade"}),
 favorite:int("favorite").notNull().default(0),
 preArchiveStatus:mysqlEnum("pre_archive_status",["draft","finalized"]).notNull().default("draft"),
 preTrashStatus:mysqlEnum("pre_trash_status",["draft","finalized","archived"]).notNull().default("draft"),
 updatedAt:timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
