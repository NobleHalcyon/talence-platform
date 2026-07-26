import { RoutePlaceholder } from "@/components/shell/page-frame";

export const metadata = {
  title: "Catalog administration",
};

export default function AdminCatalogPage() {
  return (
    <RoutePlaceholder
      eyebrow="Platform administration"
      title="Catalog operations"
      description="Inspect source files, imports, counts, active catalog state, failures, and published snapshot version."
      foundation="A manual sync request will queue worker activity; bulk provider ingestion will never run inside this web request."
    />
  );
}
