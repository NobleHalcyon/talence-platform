import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Invitation administration",
};

export default function AdminInvitesPage() {
  return (
    <RoutePlaceholder
      eyebrow="Platform administration"
      title="Invitations"
      description="Issue, inspect, resend, and revoke global private-beta invitations through trusted server operations."
      foundation="This route is intentionally absent from ordinary navigation. Phase 1 adds the platform-admin role check and private admission ledger workflow."
      constrained
    />
  );
}
