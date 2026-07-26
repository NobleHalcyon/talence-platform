import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <RoutePlaceholder
      eyebrow="Account preferences"
      title="Settings"
      description="Profile, workspace defaults, preferred currency, and presentation preferences."
      foundation="Settings are constrained-width forms. Authorization and canonical business state will never be stored in the low-risk preferences object."
      constrained
    />
  );
}
