import { db } from "@/db";
import { worker } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { probeWorkers } from "../actions";
import { requirePrincipal } from "../auth";
import Workers from "../workers";

export default async function WorkersPage() {
  const { accountId } = await requirePrincipal();

  const [workerRows, probeNames] = await Promise.all([
    db
      .select({
        createdAt: worker.createdAt,
        id: worker.id,
        name: worker.name,
        secret: worker.secret,
        url: worker.url,
      })
      .from(worker)
      .where(eq(worker.accountId, accountId))
      .orderBy(desc(worker.createdAt)),
    probeWorkers(),
  ]);

  const workerData = workerRows.map((w) => ({
    ...w,
    createdAt: w.createdAt.toISOString(),
    name: probeNames[w.id] ?? w.name,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4">
      <Workers workers={workerData} />
    </div>
  );
}
