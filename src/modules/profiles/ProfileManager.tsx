"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ProfileData } from "./schema";

type Relationship = "self" | "spouse" | "child" | "parent" | "relative";
type Basis = "consent" | "legal_authority";
type Profile = { id: string; relationship: Relationship; data: ProfileData };

const emptyData: ProfileData = {
  fullName: "", arabicName: "", latinName: "", dateOfBirth: "", nationality: "", email: "", phone: "",
  addressTunisia: "", addressAbroad: "", profession: "", maritalStatus: "", cin: "", passportNumber: "",
};

export function ProfileManager({ locale }: { locale: "fr" | "ar" }) {
  const isArabic = locale === "ar";
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [relationship, setRelationship] = useState<Relationship>("self");
  const [basis, setBasis] = useState<Basis>("consent");
  const [confirmed, setConfirmed] = useState(false);
  const [data, setData] = useState<ProfileData>(emptyData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/me/profiles", { cache: "no-store" });
    if (!response.ok) throw new Error(isArabic ? "تعذر تحميل الملفات." : "Impossible de charger les profils.");
    const result = await response.json() as { profiles: Profile[] };
    setProfiles(result.profiles);
  }, [isArabic]);

  useEffect(() => {
    refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Erreur"))
      .finally(() => setLoading(false));
  }, [refresh]);

  function resetForm() {
    setRelationship("self"); setBasis("consent"); setConfirmed(false); setData(emptyData); setEditingId(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setStatus("");
    const method = editingId ? "PATCH" : "POST";
    const url = editingId ? `/api/v1/me/profiles/${editingId}` : "/api/v1/me/profiles";
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ relationship, authorizationBasis: relationship === "self" ? "self" : basis, authorizationConfirmed: relationship === "self" || confirmed, data }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? (isArabic ? "تعذر حفظ الملف." : "Impossible d’enregistrer ce profil.")); return; }
    await refresh(); resetForm(); setStatus(isArabic ? "تم حفظ الملف." : "Profil enregistré.");
  }

  function edit(profile: Profile) {
    setEditingId(profile.id); setRelationship(profile.relationship); setData(profile.data); setConfirmed(profile.relationship === "self");
    setBasis("consent"); setError(""); setStatus("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(profileId: string) {
    if (!window.confirm(isArabic ? "هل تريد حذف هذا الملف نهائياً؟" : "Supprimer définitivement ce profil ?")) return;
    const response = await fetch(`/api/v1/me/profiles/${profileId}`, { method: "DELETE" });
    if (!response.ok) { setError(isArabic ? "تعذر حذف الملف." : "Impossible de supprimer ce profil."); return; }
    setProfiles((current) => current.filter((profile) => profile.id !== profileId));
    if (editingId === profileId) resetForm();
  }

  const relationLabel = (value: Relationship) => ({
    self: isArabic ? "ملفي الشخصي" : "Mon profil",
    spouse: isArabic ? "الزوج أو الزوجة" : "Conjoint·e",
    child: isArabic ? "طفل أو طفلة" : "Enfant",
    parent: isArabic ? "أحد الوالدين" : "Parent",
    relative: isArabic ? "قريب أو قريبة" : "Proche",
  })[value];

  const fields: Array<[keyof ProfileData, string, string]> = [
    ["fullName", "الاسم الكامل", "Nom complet"], ["arabicName", "الاسم بالعربية", "Nom en arabe"],
    ["latinName", "الاسم باللاتينية", "Nom en alphabet latin"], ["dateOfBirth", "تاريخ الميلاد", "Date de naissance"],
    ["nationality", "الجنسية", "Nationalité"], ["email", "البريد الإلكتروني", "Email"], ["phone", "الهاتف", "Téléphone"],
    ["addressTunisia", "العنوان في تونس", "Adresse en Tunisie"], ["addressAbroad", "العنوان بالخارج", "Adresse à l’étranger"],
    ["profession", "المهنة", "Profession"], ["cin", "رقم بطاقة التعريف (اختياري)", "CIN (facultatif)"],
    ["maritalStatus", "الحالة العائلية", "Situation familiale"],
    ["passportNumber", "رقم جواز السفر (اختياري)", "Passeport (facultatif)"],
  ];

  return <div className="profile-layout">
    <section className="auth-card profile-form-card">
      <div className="eyebrow">{isArabic ? "ملفات محمية" : "PROFILS PROTÉGÉS"}</div>
      <h1>{editingId ? (isArabic ? "تعديل الملف" : "Modifier un profil") : (isArabic ? "إضافة ملف شخصي" : "Ajouter un profil")}</h1>
      <p className="auth-intro">{isArabic ? "تُشفّر المعلومات الحساسة عند حفظها ولا يطلع عليها إلا صاحب الحساب." : "Les données sensibles sont chiffrées avant leur enregistrement. Seul votre compte peut les consulter."}</p>
      <form className="auth-form profile-fields" onSubmit={submit}>
        <label htmlFor="relationship">{isArabic ? "صلة القرابة" : "Personne concernée"}</label>
        <select id="relationship" value={relationship} onChange={(event) => setRelationship(event.target.value as Relationship)}>
          {(["self", "spouse", "child", "parent", "relative"] as const).map((item) => <option value={item} key={item}>{relationLabel(item)}</option>)}
        </select>
        {relationship !== "self" && <>
          <label htmlFor="basis">{isArabic ? "أساس الإذن" : "Base d’autorisation"}</label>
          <select id="basis" value={basis} onChange={(event) => setBasis(event.target.value as Basis)}><option value="consent">{isArabic ? "موافقة الشخص" : "Consentement de la personne"}</option><option value="legal_authority">{isArabic ? "صلاحية قانونية" : "Autorité légale"}</option></select>
          <label className="consent-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />{isArabic ? "أؤكد أن لدي موافقة الشخص أو صلاحية قانونية مناسبة." : "Je confirme disposer de l’accord de cette personne ou d’une autorité légale appropriée."}</label>
        </>}
        {fields.map(([key, arabic, french]) => <div className="profile-field" key={key}><label htmlFor={`profile-${key}`}>{isArabic ? arabic : french}</label>{key === "maritalStatus" ? <select id={`profile-${key}`} value={data[key]} onChange={(event) => setData({ ...data, [key]: event.target.value as ProfileData[typeof key] })}><option value="">{isArabic ? "غير محدد" : "Non renseigné"}</option>{(["single", "married", "divorced", "widowed"] as const).map((item) => <option key={item} value={item}>{isArabic ? ({ single: "أعزب/عزباء", married: "متزوج/ة", divorced: "مطلق/ة", widowed: "أرمل/ة" }[item]) : ({ single: "Célibataire", married: "Marié·e", divorced: "Divorcé·e", widowed: "Veuf·ve" }[item])}</option>)}</select> : <input id={`profile-${key}`} type={key === "dateOfBirth" ? "date" : key === "email" ? "email" : "text"} required={key === "fullName"} maxLength={500} value={data[key]} onChange={(event) => setData({ ...data, [key]: event.target.value })} />}</div>)}
        {error && <p className="form-message form-error" role="alert">{error}</p>}{status && <p className="form-message form-success" role="status">{status}</p>}
        <div className="profile-actions"><button className="button" type="submit">{isArabic ? "حفظ" : editingId ? "Mettre à jour" : "Enregistrer le profil"}</button>{editingId && <button className="button button-quiet" type="button" onClick={resetForm}>{isArabic ? "إلغاء" : "Annuler"}</button>}</div>
      </form>
    </section>
    <section className="profile-list"><div className="section-heading"><div className="eyebrow">{isArabic ? "ملفاتك" : "VOS PROFILS"}</div><h2>{isArabic ? "الأشخاص" : "Personnes"}</h2></div>{loading ? <p>{isArabic ? "جارٍ التحميل…" : "Chargement…"}</p> : profiles.length === 0 ? <div className="empty-state"><div className="category-icon">♙</div><h2>{isArabic ? "لا توجد ملفات بعد" : "Aucun profil enregistré"}</h2><p>{isArabic ? "أضف ملفك الشخصي لتسهيل إعداد وثائقك." : "Ajoutez votre profil pour préparer plus facilement vos documents."}</p></div> : profiles.map((profile) => <article className="profile-item" key={profile.id}><div><span className="profile-relation">{relationLabel(profile.relationship)}</span><h3>{profile.data.fullName}</h3><p>{profile.data.email || profile.data.phone || (isArabic ? "لا توجد معلومات اتصال" : "Aucune coordonnée")}</p></div><div className="profile-item-actions"><button className="text-link" onClick={() => edit(profile)}>{isArabic ? "تعديل" : "Modifier"}</button><button className="text-link destructive" onClick={() => remove(profile.id)}>{isArabic ? "حذف" : "Supprimer"}</button></div></article>)}</section>
  </div>;
}
