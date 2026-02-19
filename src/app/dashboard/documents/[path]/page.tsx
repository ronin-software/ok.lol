import { withDefaults } from "@/capabilities/documents/defaults";
import { db } from "@/db";
import { currentDocuments } from "@/db/documents";
import { document } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requirePrincipal } from "../../auth";
import DocumentDetail from "../../document-detail";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { pal } = await requirePrincipal();
  const docPath = decodeURIComponent((await params).path);

  const all = withDefaults(await currentDocuments(pal.id));
  const doc = all.find((d) => d.path === docPath);
  if (!doc) notFound();

  const versions = await db
    .select({
      content: document.content,
      createdAt: document.createdAt,
      editedBy: document.editedBy,
    })
    .from(document)
    .where(
      and(
        eq(document.principalId, pal.id),
        eq(document.path, docPath),
      ),
    )
    .orderBy(desc(document.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <DocumentDetail
        activation={
          doc.activation
            ? { negative: doc.activation.negative, positive: doc.activation.positive }
            : undefined
        }
        content={doc.contents}
        isDefault={doc.default ?? false}
        path={doc.path}
        principalId={pal.id}
        priority={doc.priority ?? 0}
        updatedAt={doc.updatedAt}
        updatedBy={doc.updatedBy}
        versions={versions.map((v) => ({
          content: v.content,
          createdAt: v.createdAt.toISOString(),
          editedBy: v.editedBy,
        }))}
      />
    </div>
  );
}
