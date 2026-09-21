import { createFileRoute } from "@tanstack/react-router";
import { DreamDesktop } from "../components/DreamDesktop";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dreamscape 95 — Juego dreamcore 3D" },
      { name: "description", content: "Explorá un sueño 3D atrapado dentro de una vieja computadora Windows 95." },
      { property: "og:title", content: "Dreamscape 95 — Juego dreamcore 3D" },
      { property: "og:description", content: "Un mundo dreamcore explorable con ojos voladores, señales perdidas y estética Windows 95." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <DreamDesktop />;
}
