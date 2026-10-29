"use client";

import { useId, useState } from "react";
import { type FormSchema, type FormField, getFormAnswerErrors, isFieldVisible, resolveFormAnswers } from "./form-schema";

export type RichFormFieldsProps = {
  schema: FormSchema;
  answers: Record<string, unknown>;
  locale: "fr" | "ar";
  onChange: (answers: Record<string, unknown>) => void;
  disabled?: boolean;
  showErrors?: boolean;
};
const messages = {
  fr: { required: "Ce champ est obligatoire.", invalid_type: "Le format de cette réponse est incorrect.", invalid_value: "Vérifiez cette valeur.", too_long: "Cette réponse est trop longue.", unknown_field: "Champ inconnu.", invalid_calculation: "Calcul impossible. Vérifiez les valeurs utilisées.", add: "Ajouter une ligne", remove: "Retirer cette ligne", calculated: "Valeur calculée", choose: "Sélectionner…" },
  ar: { required: "هذا الحقل مطلوب.", invalid_type: "صيغة الإجابة غير صحيحة.", invalid_value: "يرجى التحقق من القيمة.", too_long: "هذه الإجابة طويلة جداً.", unknown_field: "حقل غير معروف.", invalid_calculation: "تعذّر الحساب. تحقّق من القيم المستخدمة.", add: "إضافة سطر", remove: "حذف السطر", calculated: "قيمة محسوبة", choose: "اختر…" },
};

/** Shared renderer for both preview and authenticated editing. No HTML supplied by a model is executed. */
export function RichFormFields({ schema, answers, locale, onChange, disabled = false, showErrors = false }: RichFormFieldsProps) {
  const prefix = useId();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const t = messages[locale];
  let computed = answers;
  try { computed = resolveFormAnswers(schema, answers); } catch { /* Keep editable inputs available while a formula is incomplete. */ }
  const errors = getFormAnswerErrors(schema, answers);
  function change(key: string, value: unknown) {
    const next = { ...answers, [key]: value };
    // Calculated fields are always recomputed together, never a stale client override.
    for (const field of schema.fields) if (field.kind === "calculated") delete next[field.key];
    try { onChange(resolveFormAnswers(schema, next)); } catch { onChange(next); }
  }
  function render(field: FormField) {
    if (!isFieldVisible(field, computed)) return null;
    const id = `${prefix}-${field.key}`;
    const label = `${field.label[locale]}${field.required ? " *" : ""}`;
    const value = computed[field.key];
    const error = (showErrors || touched[field.key]) ? errors[field.key] : undefined;
    const common = { id, disabled, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined, onBlur: () => setTouched((current) => ({ ...current, [field.key]: true })) };
    const text = typeof value === "string" ? value : "";
    let control;
    if (field.kind === "repeat") {
      const rows = Array.isArray(value) ? value as Record<string, unknown>[] : [];
      return <fieldset key={field.key} disabled={disabled} className="form-repeat"><legend>{label}</legend>
        {rows.map((row, index) => <fieldset key={index}><legend>{index + 1}</legend><RichFormFields schema={{ schemaVersion: 1, fields: field.itemFields ?? [] }} answers={row} locale={locale} disabled={disabled} showErrors={showErrors} onChange={(next) => change(field.key, rows.map((item, current) => current === index ? next : item))} /><button type="button" className="text-link destructive" onClick={() => change(field.key, rows.filter((_, current) => current !== index))}>{t.remove}</button></fieldset>)}
        <button type="button" className="button button-quiet" disabled={disabled || rows.length >= (field.maxItems ?? 100)} onClick={() => change(field.key, [...rows, {}])}>{t.add}</button>
        {(showErrors || touched[field.key]) && error && <p role="alert">{t[error]}</p>}
      </fieldset>;
    }
    if (field.kind === "radio" || field.kind === "multiselect") {
      return <fieldset key={field.key} disabled={disabled} aria-describedby={error ? `${id}-error` : undefined}><legend>{label}</legend>{field.options?.map((option, index) => <label className="consent-check" key={option.value}><input id={`${id}-${index}`} name={id} type={field.kind === "radio" ? "radio" : "checkbox"} checked={field.kind === "radio" ? text === option.value : Array.isArray(value) && value.includes(option.value)} onChange={(event) => field.kind === "radio" ? change(field.key, option.value) : change(field.key, event.target.checked ? [...(Array.isArray(value) ? value : []), option.value] : (Array.isArray(value) ? value : []).filter((item) => item !== option.value))} onBlur={common.onBlur} />{option.label[locale]}</label>)}{error && <p id={`${id}-error`} role="alert">{t[error]}</p>}</fieldset>;
    }
    if (field.kind === "checkbox") return <div key={field.key}><label className="consent-check" htmlFor={id}><input {...common} type="checkbox" checked={value === true} onChange={(event) => change(field.key, event.target.checked)} />{label}</label>{error && <p id={`${id}-error`} role="alert">{t[error]}</p>}</div>;
    if (field.kind === "select") control = <select {...common} value={text} onChange={(event) => change(field.key, event.target.value)}><option value="">{t.choose}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label[locale]}</option>)}</select>;
    else if (field.kind === "textarea") control = <textarea {...common} rows={4} value={text} maxLength={field.maxLength ?? 2000} placeholder={field.placeholder?.[locale]} onChange={(event) => change(field.key, event.target.value)} />;
    else if (field.kind === "calculated") control = <input {...common} readOnly value={text} placeholder={t.calculated} />;
    else control = <input {...common} type={field.kind === "date" ? "date" : field.kind === "email" ? "email" : field.kind === "tel" ? "tel" : "text"} inputMode={field.kind === "number" || field.kind === "currency" ? "decimal" : undefined} value={text} maxLength={field.maxLength ?? 2000} placeholder={field.placeholder?.[locale]} onChange={(event) => change(field.key, event.target.value)} />;
    return <div key={field.key} className="form-field"><label htmlFor={id}>{label}</label>{control}{error && <p id={`${id}-error`} role="alert">{t[error]}</p>}</div>;
  }
  return <div className="document-form-fields" dir={locale === "ar" ? "rtl" : "ltr"}>{schema.fields.map(render)}{errors._form && <p role="status">{t.invalid_calculation}</p>}</div>;
}
