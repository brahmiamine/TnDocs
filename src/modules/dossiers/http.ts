import { NextResponse } from "next/server";
import { DossierShareError } from "./sharing";
export const dossierPrivateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export function dossierFailure(error: unknown) {
  if (error instanceof DossierShareError) return NextResponse.json({ code: error.code }, { status: error.status, headers: dossierPrivateHeaders });
  const code = error instanceof Error ? error.message : "DOSSIER_UNAVAILABLE";
  const inputErrors = ["COUNTRY_NOT_SUPPORTED", "CHECKLIST_NOT_AVAILABLE", "PROCEDURE_SOURCE_UNAVAILABLE", "PROCEDURE_VERSION_UNAVAILABLE", "DOSSIER_CHANGED"];
  return NextResponse.json({ code: code === "STORAGE_QUOTA_EXCEEDED" || inputErrors.includes(code) ? code : "DOSSIER_UNAVAILABLE" }, { status: code === "STORAGE_QUOTA_EXCEEDED" ? 413 : inputErrors.includes(code) ? 409 : 503, headers: dossierPrivateHeaders });
}
