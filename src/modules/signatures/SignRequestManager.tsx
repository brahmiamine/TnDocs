"use client";
import { useCallback, useEffect, useState } from "react";
type RequestRow={id:string;revision:number;contentHash:string;expiresAt:string;revokedAt:string|null;participants:Array<{id:string;email:string;status:string;signedAt:string|null}>};
export function SignRequestManager({documentId,revision,locale,disabled=false}:{documentId:string;revision:number;locale:"fr"|"ar";disabled?:boolean}) {
  const ar=locale==="ar";
  const [requests,setRequests]=useState<RequestRow[]>([]),[emails,setEmails]=useState(""),[expires,setExpires]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[downloadUrl,setDownloadUrl]=useState("");
  const refresh=useCallback(async()=>{const response=await fetch(`/api/v1/me/documents/${documentId}/sign-requests`,{cache:"no-store"});if(!response.ok)throw new Error(ar?"تعذر تحميل الدعوات.":"Impossible de charger les invitations.");const result=await response.json();setRequests(result.requests);},[documentId,ar]);
  useEffect(()=>{void refresh().catch(error=>setMessage(error.message));},[refresh]);
  async function create(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setMessage("");
    try {
      const response=await fetch(`/api/v1/me/documents/${documentId}/sign-requests`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:revision,locale,expiresAt:new Date(expires).toISOString(),recipients:emails.split(/[\n,;]+/).map(value=>value.trim()).filter(Boolean)})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.code==="REVISION_CONFLICT"?(ar?"تغيرت النسخة. أعد تحميل الوثيقة.":"La révision a changé. Rechargez le document."):(ar?"تعذر إرسال الدعوات. تحقق من البريد وتاريخ الانتهاء وإعداد SMTP.":"Envoi impossible. Vérifiez les emails, l’expiration et la configuration SMTP."));
      setMessage(result.request.deliveryFailures?(ar?"تم إنشاء الطلب لكن بعض رسائل الدعوة لم ترسل. ألغ الطلب وأعد المحاولة بعد إصلاح البريد.":"Demande créée, mais certains emails n’ont pas été envoyés. Révoquez-la puis réessayez après réparation du SMTP."):(ar?"تمت جدولة رسائل الدعوة. يجب تأكيد بريد كل مستلم.":"Emails d’invitation en cours d’envoi. Chaque destinataire doit vérifier son email."));
      setEmails("");await refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Erreur");}finally{setBusy(false);}
  }
  async function revoke(id:string) {setBusy(true);try{const response=await fetch(`/api/v1/me/documents/${documentId}/sign-requests/${id}`,{method:"DELETE"});if(!response.ok)throw new Error(ar?"تعذر الإلغاء.":"Révocation impossible.");await refresh();}catch(error){setMessage(error instanceof Error?error.message:"Erreur");}finally{setBusy(false);}}
  async function exportSigned(requestId:string,format:"pdf"|"docx"){
    setBusy(true);setDownloadUrl("");setMessage(ar?"جار إعداد الملف الموقّع…":"Préparation du document signé…");
    try{
      const response=await fetch(`/api/v1/me/documents/${documentId}/sign-requests/${requestId}/exports`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({format})});const result=await response.json();
      if(!response.ok)throw new Error(result.code==="SIGNATURES_STILL_PENDING"?(ar?"لم يقرر جميع المدعوين بعد.":"Tous les invités n’ont pas encore répondu."):(ar?"التصدير غير متاح. تحقق من إعدادات PDF.":"Export indisponible. Vérifiez la configuration PDF."));
      for(let attempt=0;attempt<60;attempt++){
        const statusResponse=await fetch(`/api/v1/me/exports/${result.jobId}`,{cache:"no-store"});const status=await statusResponse.json();
        if(!statusResponse.ok)throw new Error(ar?"تعذر متابعة التصدير.":"Suivi d’export indisponible.");
        if(status.downloadUrl){setDownloadUrl(status.downloadUrl);setMessage(ar?"الملف الموقّع جاهز.":"Document signé prêt.");return;}
        if(status.status==="dead"||status.status==="cancelled")throw new Error(ar?"فشل التصدير.":"La génération a échoué.");
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
      setMessage(ar?"ما زال التصدير قيد الإعداد. أعد الضغط لاحقاً لمتابعته.":"L’export est encore en préparation. Cliquez à nouveau plus tard pour le récupérer.");
    }catch(error){setMessage(error instanceof Error?error.message:"Erreur");}finally{setBusy(false);}
  }
  const statuses:Record<string,string>=ar?{invited:"مدعو",viewed:"تم الاطلاع",signed:"موقّع",declined:"مرفوض",expired:"منتهي",revoked:"ملغى"}:{invited:"Invité",viewed:"Consulté",signed:"Signé",declined:"Refusé",expired:"Expiré",revoked:"Révoqué"};
  return <section className="revision-history"><h2>{ar?"طلبات التوقيع":"Demandes de signature"}</h2><p>{ar?"يوقع المدعوون نسخة ثابتة محددة بالبصمة. أي تعديل لاحق ينشئ نسخة أخرى. صورة التوقيع ليست توقيعاً إلكترونياً مؤهلاً.":"Les invités signent une révision figée identifiée par son empreinte. Une modification ultérieure crée une autre révision. Une image de signature ne constitue pas une signature électronique qualifiée."}</p>
    <form onSubmit={create}><label>{ar?"البريد الإلكتروني للموقّعين، سطر لكل مستلم":"Emails des signataires, un par ligne"}<textarea value={emails} onChange={event=>setEmails(event.target.value)} required disabled={disabled||busy}/></label><label>{ar?"انتهاء الدعوة (التوقيت المحلي)":"Expiration des invitations (heure locale)"}<input type="datetime-local" value={expires} onChange={event=>setExpires(event.target.value)} required disabled={disabled||busy}/></label><button className="button" disabled={disabled||busy}>{ar?"إرسال الدعوات":"Envoyer les invitations"}</button></form>
    <p role="status">{message}</p>{downloadUrl&&<a className="button" href={downloadUrl}>{ar?"تنزيل الملف":"Télécharger le fichier"}</a>}<button type="button" className="button button-quiet" onClick={()=>void refresh().catch(error=>setMessage(error.message))}>{ar?"تحديث الحالة":"Actualiser le suivi"}</button>
    {requests.map(request=><article key={request.id}><h3>{ar?"النسخة":"Révision"} {request.revision}</h3><p><code style={{overflowWrap:"anywhere"}}>{request.contentHash}</code></p><p>{new Date(request.expiresAt).toLocaleString(ar?"ar-TN":"fr-FR")}</p><ul>{request.participants.map(participant=><li key={participant.id}><bdi>{participant.email}</bdi> — {statuses[participant.status]??participant.status}{participant.signedAt?` · ${new Date(participant.signedAt).toLocaleString(ar?"ar-TN":"fr-FR")}`:""}</li>)}</ul>{request.participants.every(participant=>["signed","declined"].includes(participant.status))&&request.participants.some(participant=>participant.status==="signed")&&<div><button className="button button-quiet" disabled={busy} onClick={()=>void exportSigned(request.id,"pdf")}>PDF {ar?"موقّع":"signé"}</button> <button className="button button-quiet" disabled={busy} onClick={()=>void exportSigned(request.id,"docx")}>DOCX + {ar?"أدلة":"preuves"}</button></div>}{!request.revokedAt&&<button className="button button-quiet" disabled={busy} onClick={()=>void revoke(request.id)}>{ar?"إلغاء الدعوة":"Révoquer la demande"}</button>}</article>)}
  </section>;
}
