import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "TnDocs — Vos démarches, plus simples", template: "%s | TnDocs" },
  description: "Trouvez, préparez et personnalisez vos documents administratifs tunisiens en français et en arabe.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
