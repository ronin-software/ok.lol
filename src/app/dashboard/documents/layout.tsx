import { TOOL_NAMES, withDefaults } from "@/capabilities/documents/defaults";
import { currentDocuments } from "@/db/documents";
import { requirePrincipal } from "../auth";
import type { DocEntry } from "./sidebar";
import DocumentsShell from "./shell";

/** Wraps document pages in the sidebar + editor shell. */
export default async function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pal } = await requirePrincipal();
  const docs = await resolveDocs(pal.id);

  return (
    <DocumentsShell docs={docs} principalId={pal.id}>
      {children}
    </DocumentsShell>
  );
}

// –
// Resolve
// –

const toolSpecs = TOOL_NAMES.map((name) => ({ description: "", name }));

async function resolveDocs(principalId: string): Promise<DocEntry[]> {
  const raw = await currentDocuments(principalId);
  const merged = withDefaults(raw, toolSpecs);

  return merged
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((d) => ({
      isDefault: d.default ?? false,
      path: d.path,
    }));
}
