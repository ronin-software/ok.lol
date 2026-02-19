import { withDefaults } from "@/capabilities/documents/defaults";
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

/** Merge user documents with system defaults. */
async function resolveDocuments(principalId: string): Promise<DocumentData[]> {
  const docs = await currentDocuments(principalId);
  const merged = withDefaults(docs);

  return merged
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((d) => ({
      // Strip embeddings — only pass phrase lists to the client.
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
