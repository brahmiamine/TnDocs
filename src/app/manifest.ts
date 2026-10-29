import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/fr",
    name: "TnDocs — documents et démarches",
    short_name: "TnDocs",
    description: "Préparez vos documents et démarches en français ou en arabe.",
    start_url: "/fr",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f7f4",
    theme_color: "#c43835",
    lang: "fr-TN",
    dir: "ltr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
