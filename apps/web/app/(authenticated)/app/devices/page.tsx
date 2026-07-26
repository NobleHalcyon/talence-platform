import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Devices",
};

export default function DevicesPage() {
  return (
    <RoutePlaceholder
      eyebrow="Registered machines"
      title="Devices"
      description="Register, suspend, rotate, revoke, and narrowly grant approved machines without sharing human sessions."
      foundation="Raw credentials will be displayed exactly once. Only their prefix and digest will remain after issuance."
    />
  );
}
