import { TOOL_NAMES, withDefaults } from "@/capabilities/documents/defaults";
import { currentDocuments } from "@/db/documents";
import { requirePrincipal } from "../auth";
import type { DocumentData } from "../document-editor";
import DocumentsSection from "../document-editor";

export default async function DocumentsPage() {
  const { pal } = await requirePrincipal();
  const documents = await resolveDocuments(pal.id);

  return (
    <div className="mx-auto max-w-2xl px-4">
      <DocumentsSection documents={documents} principalId={pal.id} />
    </div>
  );
}

// –
// Resolve
// –

/** Specs for origin capabilities that have tool doc templates. */
const toolSpecs = TOOL_NAMES.map((name) => ({ description: "", name }));

/** Merge user documents with system defaults (including tool docs). */
async function resolveDocuments(principalId: string): Promise<DocumentData[]> {
  const docs = await currentDocuments(principalId);
  const merged = withDefaults(docs, toolSpecs);

  return merged
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((d) => ({
      activation: d.activation
        ? { negative: d.activation.negative, positive: d.activation.positive }
        : undefined,
      content: d.contents,
      isDefault: d.default ?? false,
      path: d.path,
      priority: d.priority ?? 0,
      updatedAt: d.updatedAt,
      updatedBy: d.updatedBy,
    }));
}
