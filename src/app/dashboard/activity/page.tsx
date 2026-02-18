import { db } from "@/db";
import { log, usage as usageTable } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import ActivityTable, { type ActivityEntry } from "../activity";
import { requirePrincipal } from "../auth";

export default async function ActivityPage() {
  const { accountId, pal } = await requirePrincipal();

  const [logRows, usageRows] = await Promise.all([
    db
      .select({
        capability: log.capability,
        createdAt: log.createdAt,
        input: log.input,
      })
      .from(log)
      .where(eq(log.principalId, pal.id))
      .orderBy(desc(log.createdAt))
      .limit(50),
    db
      .select({
        amount: usageTable.amount,
        cost: usageTable.cost,
        createdAt: usageTable.createdAt,
        resource: usageTable.resource,
      })
      .from(usageTable)
      .where(eq(usageTable.accountId, accountId))
      .orderBy(desc(usageTable.createdAt))
      .limit(50),
  ]);

  const activity: ActivityEntry[] = [
    ...logRows.map(
      (r) =>
        ({
          capability: r.capability,
          createdAt: r.createdAt.toISOString(),
          input: r.input,
          kind: "log",
        }) as const,
    ),
    ...usageRows.map(
      (r) =>
        ({
          cost: Number(r.cost) / 1_000_000,
          createdAt: r.createdAt.toISOString(),
          detail: `${Number(r.amount).toLocaleString()} tokens`,
          kind: "usage",
          resource: r.resource,
        }) as const,
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto max-w-2xl px-4">
      <ActivityTable rows={activity} />
    </div>
  );
}
