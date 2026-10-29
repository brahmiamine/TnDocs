import { getPublicSettings } from './service';
export async function PublicSupportLinks({ locale }: { locale: 'fr' | 'ar' }) {
  const settings = await getPublicSettings();
  if (!settings.donationUrl && settings.partners.length === 0) return null;
  return <aside aria-label={locale === 'ar' ? 'دعم اختياري وشركاء معلنون' : 'Soutien facultatif et partenaires identifiés'}>{settings.donationUrl && <p><a href={settings.donationUrl} target="_blank" rel="noopener noreferrer nofollow">{locale === 'ar' ? 'تبرع اختياري عبر خدمة خارجية' : 'Don facultatif via un service externe'}</a> — {locale === 'ar' ? 'الخدمة مجانية دون اشتراك.' : 'Le service reste gratuit, sans abonnement.'}</p>}{settings.partners.map(partner => <p key={partner.url}><span>{locale === 'ar' ? 'شراكة معلنة' : 'Partenariat identifié'} : </span><a href={partner.url} target="_blank" rel="noopener noreferrer sponsored nofollow">{partner.name}</a> — {locale === 'ar' ? partner.labelAr : partner.labelFr}</p>)}</aside>;
}
