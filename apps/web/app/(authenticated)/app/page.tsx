import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <RoutePlaceholder
      eyebrow="Personal workspace"
      title="Dashboard"
      description="A trusted overview of collection quantity, valuation context, recent transactions, decks, and device health."
      foundation="Database aggregate functions and workspace-scoped reads arrive after the identity and catalog foundations. This shell reserves explicit loading, empty, error, permission, and freshness states."
    />
  );
}
