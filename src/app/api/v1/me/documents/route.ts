import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogTemplateTranslations, catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { encryptDocumentData } from "@/modules/documents/crypto";
import { createDocumentSchema, type DocumentContent } from "@/modules/documents/schema";
import { parseFormSchema } from "@/modules/documents/form-schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const documents = await database.select({
    id: personalDocuments.id, templateId: personalDocuments.templateId, templateVersionId: personalDocuments.templateVersionId,
    title: personalDocuments.title, status: personalDocuments.status, currentRevision: personalDocuments.currentRevision,
    createdAt: personalDocuments.createdAt, updatedAt: personalDocuments.updatedAt,
  }).from(personalDocuments).where(and(eq(personalDocuments.ownerUserId, user.id), ne(personalDocuments.status, "trash"))).orderBy(desc(personalDocuments.updatedAt)).limit(100);
  return NextResponse.json({ documents }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const parsed = createDocumentSchema.safeParse(await readJsonBody(request, 8 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "A published template and locale are required.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  const [template] = await db.select().from(catalogTemplates).where(and(eq(catalogTemplates.id, parsed.data.templateId), eq(catalogTemplates.status, "published"))).limit(1);
  if (!template?.publishedVersionId) return NextResponse.json({ code: "NOT_FOUND", message: "Published template not found." }, { status: 404 });
  if (template.documentType === "official") return NextResponse.json({ code: "OFFICIAL_SOURCE_ONLY", message: "Official documents must be completed using the original form from its source." }, { status: 409 });
  const [version] = await db.select({ formSchema: catalogTemplateVersions.formSchema }).from(catalogTemplateVersions)
    .where(and(eq(catalogTemplateVersions.id, template.publishedVersionId), eq(catalogTemplateVersions.status, "published"))).limit(1);
  if (!version) return NextResponse.json({ code: "TEMPLATE_VERSION_UNAVAILABLE", message: "The published template version is unavailable." }, { status: 409 });
  const parsedFormSchema = parseFormSchema(version.formSchema);
  if (version.formSchema && !parsedFormSchema) return NextResponse.json({ code: "TEMPLATE_SCHEMA_INVALID", message: "This published template has an invalid form schema." }, { status: 409 });
  const [translation] = await db.select().from(catalogTemplateTranslations).where(and(
    eq(catalogTemplateTranslations.versionId, template.publishedVersionId), eq(catalogTemplateTranslations.locale, parsed.data.locale),
  )).limit(1);
  if (!translation) return NextResponse.json({ code: "LOCALE_UNAVAILABLE", message: "This template is not available in that language." }, { status: 409 });

  const documentId = randomUUID();
  const content: DocumentContent = { title: translation.title, locale: parsed.data.locale, body: translation.body, answers: {} };
  try {
    const encrypted = encryptDocumentData(content, user.id, documentId, 1);
    await db.transaction(async (tx) => {
      await tx.insert(personalDocuments).values({
        id: documentId, ownerUserId: user.id, templateId: template.id, templateVersionId: template.publishedVersionId,
        title: translation.title, currentRevision: 1,
      });
      await tx.insert(documentRevisions).values({
        id: randomUUID(), documentId, revision: 1, contentCiphertext: encrypted.ciphertext,
        encryptionKeyVersion: encrypted.keyVersion, createdBy: user.id,
      });
    });
    return NextResponse.json({ id: documentId, title: translation.title, revision: 1, formSchema: parsedFormSchema }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The draft could not be created. Check the encryption configuration." }, { status: 503 });
  }
}
