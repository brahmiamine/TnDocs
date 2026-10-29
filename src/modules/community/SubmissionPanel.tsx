'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { canTransition, type SubmissionStatus } from './schema';

type Submission = { id: string; kind: string; title: string; body: string; sourceUrl?: string; locale: 'fr' | 'ar'; status: SubmissionStatus; createdAt: string; events: { id: string; status: SubmissionStatus; createdAt: string; comment: string | null }[] };
const labels = {
  fr: { submitted: 'Envoyé', triaged: 'En cours de revue', revision_requested: 'Corrections demandées', accepted: 'Accepté pour préparation éditoriale', rejected: 'Refusé', closed: 'Clôturé' },
  ar: { submitted: 'مرسل', triaged: 'قيد المراجعة', revision_requested: 'تصحيحات مطلوبة', accepted: 'مقبول للإعداد التحريري', rejected: 'مرفوض', closed: 'مغلق' },
};
export function SubmissionPanel({ locale, support = false, moderation = false }: { locale: 'fr' | 'ar'; support?: boolean; moderation?: boolean }) {
  const ar = locale === 'ar';
  const [rows, setRows] = useState<Submission[]>([]);
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [kind, setKind] = useState('template_request'); const [sourceUrl, setSourceUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [viewSupport, setViewSupport] = useState(false); const [comments, setComments] = useState<Record<string, string>>({}); const [editing, setEditing] = useState<string | null>(null);
  const endpoint = moderation ? `/api/v1/admin/moderation?support=${viewSupport}` : support ? '/api/v1/contact' : '/api/v1/me/contributions';
  async function load() {
    try { const response = await fetch(endpoint, { cache: 'no-store' }); if (!response.ok) throw new Error(); const data = await response.json(); setRows(data.submissions); }
    catch { setError(ar ? 'تعذر تحميل الطلبات. حاول مجددًا.' : 'Impossible de charger les demandes. Réessayez.'); }
  }
  useEffect(() => { let active = true; fetch(endpoint, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => { if (active) { setRows(data.submissions); setError(''); } }).catch(() => { if (active) setError(ar ? 'تعذر تحميل الطلبات.' : 'Impossible de charger les demandes.'); }); return () => { active = false; }; }, [endpoint, ar]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(editing ? `/api/v1/me/contributions/${editing}` : endpoint, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, locale, privacyConfirmed: confirmed, ...(!support ? { kind, ...(sourceUrl ? { sourceUrl } : {}) } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code);
      setTitle(''); setBody(''); setSourceUrl(''); setConfirmed(false); setEditing(null);
      setMessage(ar ? 'تم حفظ الطلب. يمكنك متابعة الرد هنا.' : 'Demande enregistrée. Vous pouvez suivre la réponse ici.'); await load();
    } catch (caught) { setError(caught instanceof Error && caught.message === 'INVALID_INPUT' ? ar ? 'تحقق من الحقول والموافقة. استخدم نصًا عاديًا دون معلومات شخصية في المقترح.' : 'Vérifiez les champs et la confirmation. Utilisez du texte simple et retirez les données personnelles des contributions.' : ar ? 'تعذر حفظ الطلب. حاول لاحقًا.' : 'Enregistrement impossible. Réessayez plus tard.'); }
    finally { setBusy(false); }
  }
  async function update(row: Submission, status: SubmissionStatus) {
    if (!comments[row.id]?.trim()) { setError(ar ? 'أضف تعليقًا يوضح القرار.' : 'Ajoutez un commentaire expliquant la décision.'); return; }
    setBusy(true); setError('');
    try { const response = await fetch(`/api/v1/admin/moderation/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedStatus: row.status, status, comment: comments[row.id] }) }); if (!response.ok) throw new Error(); setComments(value => ({ ...value, [row.id]: '' })); await load(); }
    catch { setError(ar ? 'تعذر التحديث. أعد تحميل القائمة للتحقق من أحدث حالة.' : 'Mise à jour impossible. Rechargez pour consulter le statut actuel.'); } finally { setBusy(false); }
  }
  return <div>{error && <p role="alert" className="form-message">{error}</p>}{message && <p role="status">{message}</p>}
    {moderation ? <label>{ar ? 'نوع الطلبات' : 'Afficher'} <select value={viewSupport ? 'support' : 'contributions'} onChange={e => setViewSupport(e.target.value === 'support')}><option value="contributions">{ar ? 'المساهمات' : 'Contributions'}</option><option value="support">{ar ? 'المساعدة' : 'Assistance'}</option></select></label> : <form className="auth-card admin-editor" onSubmit={submit}>
      <p>{support ? (ar ? 'طلبك خاص ويمكن لفريق المساعدة الاطلاع عليه. لا ترسل وثائق أو أرقام هوية أو كلمات مرور.' : 'Votre demande est privée et accessible à l’équipe d’assistance. N’envoyez ni documents, ni identifiants personnels, ni mots de passe.') : (ar ? 'أرسل نصًا عامًا فقط مع متغيرات بدل البيانات الشخصية، دون توقيع. المراجعة لا تعني النشر.' : 'Proposez uniquement du texte générique avec des variables, sans données personnelles ni signature. L’acceptation ne vaut pas publication.')}</p>
      {!support && <label>{ar ? 'النوع' : 'Type'}<select value={kind} onChange={e => setKind(e.target.value)} disabled={!!editing}><option value="template_request">{ar ? 'طلب نموذج' : 'Demande de modèle'}</option><option value="proposal">{ar ? 'اقتراح نص' : 'Proposition de texte'}</option><option value="report">{ar ? 'بلاغ عن خطأ' : 'Signaler une erreur'}</option></select></label>}
      <label>{ar ? 'الموضوع' : 'Sujet'}<input required minLength={3} maxLength={180} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>{ar ? 'النص' : 'Message'}<textarea required rows={7} minLength={3} maxLength={5000} value={body} onChange={e => setBody(e.target.value)} /></label>
      {!support && <label>{ar ? 'رابط المصدر (اختياري)' : 'Lien source (facultatif)'}<input type="url" maxLength={2048} value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} dir="ltr" /></label>}
      <label className="consent-check"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{ar ? 'أؤكد أنني لم أدرج بيانات شخصية أو توقيعًا، وأوافق على مراجعة الفريق لهذا النص.' : 'Je confirme avoir retiré les données personnelles et signatures, et j’autorise l’équipe à examiner ce texte.'}</label>
      <button className="button" disabled={busy}>{editing ? ar ? 'إرسال التصحيح' : 'Envoyer la correction' : ar ? 'إرسال' : 'Envoyer'}</button>{editing && <button className="text-link" type="button" onClick={() => { setEditing(null); setTitle(''); setBody(''); setSourceUrl(''); }}>{ar ? 'إلغاء التصحيح' : 'Annuler la correction'}</button>}
    </form>}
    <h2>{ar ? 'الطلبات والمتابعة' : 'Demandes et suivi'}</h2><button type="button" className="text-link" onClick={load}>{ar ? 'تحديث' : 'Actualiser'}</button>
    {rows.length === 0 && <p>{ar ? 'لا توجد طلبات في هذه القائمة.' : 'Aucune demande dans cette liste.'}</p>}
    {rows.map(row => <article className="detail-section" key={row.id}><h3>{row.title}</h3><p><span className="status-badge">{labels[locale][row.status]}</span> <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleDateString(locale)}</time></p><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.body}</p>{row.sourceUrl && <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" dir="ltr">{ar ? 'المصدر المقترح' : 'Source proposée'}</a>}
      <details><summary>{ar ? 'سجل الطلب والتعليقات' : 'Historique et commentaires'}</summary><ol>{row.events.map(event => <li key={event.id}><span>{labels[locale][event.status]}</span>{event.comment && <p style={{ whiteSpace: 'pre-wrap' }}>{event.comment}</p>}</li>)}</ol></details>
      {!moderation && !support && row.status === 'revision_requested' && <button type="button" className="text-link" onClick={() => { setEditing(row.id); setTitle(row.title); setBody(row.body); setKind(row.kind); setSourceUrl(row.sourceUrl ?? ''); setConfirmed(false); }}>{ar ? 'تعديل وإعادة إرسال' : 'Corriger et renvoyer'}</button>}
      {moderation && <div className="admin-editor"><label>{ar ? 'تعليق مرئي لصاحب الطلب' : 'Commentaire visible par le demandeur'}<textarea maxLength={2000} value={comments[row.id] ?? ''} onChange={e => setComments(value => ({ ...value, [row.id]: e.target.value }))} /></label><div className="admin-item-actions">{(['triaged', 'revision_requested', 'accepted', 'rejected', 'closed'] as const).filter(status => canTransition(row.status, status) && !(row.kind === 'support' && status === 'accepted')).map(status => <button type="button" className="text-link" key={status} disabled={busy} onClick={() => update(row, status)}>{labels[locale][status]}</button>)}</div></div>}
    </article>)}<p>{ar ? 'تظهر أحدث 100 طلب. قبول الاقتراح لا يتجاوز مراجعة المصادر والترجمات المطلوبة للنشر.' : 'Les 100 demandes les plus récentes sont affichées. Une proposition acceptée reste soumise aux contrôles de sources et de traduction avant publication.'}</p>
  </div>;
}
