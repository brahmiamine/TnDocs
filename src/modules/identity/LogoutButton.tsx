"use client";

export function LogoutButton({ locale }: { locale: "fr" | "ar" }) {
  const isArabic = locale === "ar";
  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    window.location.assign(`/${locale}`);
  }
  return <button className="logout-button" onClick={logout}>{isArabic ? "تسجيل الخروج" : "Se déconnecter"}</button>;
}
