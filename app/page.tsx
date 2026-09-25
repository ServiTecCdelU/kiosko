import { Landing } from "@/components/landing/landing";
import { HomeGate } from "@/components/home/home-gate";

export default function HomePage() {
  return <HomeGate landing={<Landing />} />;
}
