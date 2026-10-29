"use client";

export function LogoutButton({ locale }: { locale: "fr" | "ar" }) {
  const isArabic = locale === "ar";
  async function logout() {
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          try { await fetch("/api/v1/me/notifications/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }), signal: AbortSignal.timeout(4000) }); }
          finally { await subscription.unsubscribe(); }
        }
      }
    } catch { /* A failed push cleanup never prevents terminating the server session. */ }
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.assign(`/${locale}`);
  }
  return <button className="logout-button" onClick={logout}>{isArabic ? "تسجيل الخروج" : "Se déconnecter"}</button>;
}
