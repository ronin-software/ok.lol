import { db } from "@/db";
import { log } from "@/db/schema";
import type { OriginExecutionContext } from "./context";

/** Record a capability invocation in the log table. */
export async function logCall(
  ectx: OriginExecutionContext,
  capability: string,
  input: unknown,
) {
  await db.insert(log).values({
    capability,
    input,
    principalId: ectx.principal.id,
  });
}
