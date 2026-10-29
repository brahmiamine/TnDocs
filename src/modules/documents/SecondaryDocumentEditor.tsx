"use client";
import type {DocumentContent} from "./schema";
import {RichDocumentEditor} from "./RichDocumentEditor";
import {richDocumentFromText,richDocumentHtml,richDocumentText} from "./rich-document";
import {renderTemplateText} from "./form-schema";
type Props={value:DocumentContent["secondary"];answers:Record<string,unknown>;locale:"fr"|"ar";editable:boolean;disabled?:boolean;onChange:(value:NonNullable<DocumentContent["secondary"]>)=>void};
/** The source language is pinned; only an existing editable section can be changed. */
export function SecondaryDocumentEditor({value,answers,locale,editable,disabled=false,onChange}:Props){
 if(!value)return null;const ar=locale==="ar";const label=ar?"النسخة اللغوية الثانية":"Seconde version linguistique";
 return <section className="document-secondary" aria-label={label}><h2>{label} — {value.locale==="ar"?"العربية":"Français"}</h2><p className="form-hint">{ar?"تستخدم هذه النسخة نفس إجابات النموذج. اللغة مأخوذة من النسخة المنشورة المعتمدة؛ لا تُنشأ ترجمة تلقائية.":"Cette version utilise les mêmes réponses. Son texte provient de la traduction publiée du modèle ; aucune traduction automatique n’est créée."}</p>
  {editable&&<fieldset disabled={disabled}><legend>{ar?"تحرير النص الثاني":"Modifier le second texte"}</legend><label>{ar?"العنوان":"Titre"}<input dir={value.locale==="ar"?"rtl":"ltr"} maxLength={240} value={value.title??""} onChange={event=>onChange({...value,title:event.target.value})}/></label>
   {value.richDocument?<RichDocumentEditor value={value.richDocument} locale={value.locale} answers={answers} onChange={richDocument=>onChange({...value,richDocument,body:richDocumentText(richDocument)})}/>:<><label>{ar?"النص":"Texte"}<textarea rows={10} dir={value.locale==="ar"?"rtl":"ltr"} maxLength={50000} value={value.body} onChange={event=>onChange({...value,body:event.target.value})}/></label><button type="button" className="button button-quiet" onClick={()=>onChange({...value,richDocument:richDocumentFromText(value.body)})}>{ar?"تنسيق النص":"Mettre le texte en forme"}</button></>}
  </fieldset>}
  <article className="template-body document-page" lang={value.locale} dir={value.locale==="ar"?"rtl":"ltr"}><h3>{value.title}</h3>{value.richDocument?<div dangerouslySetInnerHTML={{__html:richDocumentHtml(value.richDocument,answers,value.locale)}}/>:<div style={{whiteSpace:"pre-wrap"}}>{renderTemplateText(value.body,answers)}</div>}</article>
 </section>;
}
