import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TaxTrax Consulting",
    short_name: "TaxTrax",
    description: "Tax filing, company registration and cross-border compliance.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#FF0404",
    icons: [{ src: "/logo/taxtrax-mark.png", sizes: "any", type: "image/png" }],
  };
}
