import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WeightWise",
    short_name: "WeightWise",
    description: "Personal weight, nutrition and hydration tracker with an AI coach.",
    start_url: "/",
    display: "standalone",
    background_color: "#090c0b",
    theme_color: "#090c0b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
