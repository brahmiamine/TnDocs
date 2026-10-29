import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { encryptDossierData, decryptDossierData } from "@/modules/documents/crypto";
import { assertStorageQuota,lockStorageOwner } from "@/platform/storage/quota";
import { signatureAssets } from "./db-schema";
import { validateSignaturePng } from "./protocol";
import { isFeatureEnabled } from "@/modules/administration/service";
import { SignatureError } from "./service";
export const signatureAssetSchema=z.object({label:z.string().trim().min(1).max(120),kind:z.enum(["signature","stamp"]),png:z.string().max(350000),consent:z.literal(true)});
export async function getSignatureAsset(ownerId:string,assetId:string){
  if(!database)throw new SignatureError("SERVICE_UNAVAILABLE",503);
  const [asset]=await database.select().from(signatureAssets).where(and(eq(signatureAssets.id,assetId),eq(signatureAssets.ownerUserId,ownerId))).limit(1);
  if(!asset)throw new SignatureError("NOT_FOUND",404);
  return {id:asset.id,kind:asset.kind,...decryptDossierData<{label:string;png:string}>(asset.dataCiphertext,asset.encryptionKeyVersion,ownerId,asset.id)};
}
export async function listSignatureAssets(ownerId:string){
  if(!database)throw new SignatureError("SERVICE_UNAVAILABLE",503);
  const rows=await database.select().from(signatureAssets).where(eq(signatureAssets.ownerUserId,ownerId));
  return rows.map(asset=>({id:asset.id,kind:asset.kind,...decryptDossierData<{label:string;png:string}>(asset.dataCiphertext,asset.encryptionKeyVersion,ownerId,asset.id)}));
}
export async function createSignatureAsset(ownerId:string,input:z.infer<typeof signatureAssetSchema>){
  if(!await isFeatureEnabled("signatures"))throw new SignatureError("FEATURE_DISABLED",503);
  if(!database)throw new SignatureError("SERVICE_UNAVAILABLE",503);
  if(!input.png.startsWith("data:image/png;base64,"))throw new SignatureError("INVALID_SIGNATURE_PNG");
  const bytes=Buffer.from(input.png.slice(22),"base64");
  try{validateSignaturePng(bytes);}catch{throw new SignatureError("INVALID_SIGNATURE_PNG");}
  const id=randomUUID(),encrypted=encryptDossierData({label:input.label,png:`data:image/png;base64,${bytes.toString("base64")}`},ownerId,id);
  await database.transaction(async tx=>{
    await assertStorageQuota(tx,ownerId,Buffer.byteLength(encrypted.ciphertext,"utf8"));
    await tx.insert(signatureAssets).values({id,ownerUserId:ownerId,kind:input.kind,dataCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion});
  });
  return {id,kind:input.kind,label:input.label};
}
export async function deleteSignatureAsset(ownerId:string,assetId:string){
  if(!database)throw new SignatureError("SERVICE_UNAVAILABLE",503);
  await database.transaction(async tx=>{await lockStorageOwner(tx,ownerId);await tx.delete(signatureAssets).where(and(eq(signatureAssets.id,assetId),eq(signatureAssets.ownerUserId,ownerId)));});
}
