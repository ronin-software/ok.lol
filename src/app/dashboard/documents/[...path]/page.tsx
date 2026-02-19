import { TOOL_NAMES, withDefaults } from "@/capabilities/documents/defaults";
import { currentDocuments } from "@/db/documents";
import { notFound } from "next/navigation";
import { requirePrincipal } from "../../auth";
import Editor from "../editor";
import { serialize, unpackExtra } from "../frontmatter";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { pal } = await requirePrincipal();
  const segments = (await params).path;
  const docPath = segments.join("/");

  const toolSpecs = TOOL_NAMES.map((name) => ({ description: "", name }));
  const all = withDefaults(await currentDocuments(pal.id), toolSpecs);
  const doc = all.find((d) => d.path === docPath);
  if (!doc) notFound();

  const activation = doc.activation
    ? { negative: doc.activation.negative, positive: doc.activation.positive }
    : undefined;

  const { body, extra } = unpackExtra(doc.contents);
  const text = serialize(body, doc.priority ?? 0, activation, extra);

  return (
    <Editor
      isDefault={doc.default ?? false}
      path={doc.path}
      principalId={pal.id}
      text={text}
      updatedAt={doc.updatedAt}
      updatedBy={doc.updatedBy}
    />
  );
}
