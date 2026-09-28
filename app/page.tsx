import { Landing } from "@/components/landing/landing";

// "/" es siempre la landing publica. El panel de cada comercio vive en
// /<slug> (app/[comercio]/page.tsx).
export default function HomePage() {
  return <Landing />;
}
