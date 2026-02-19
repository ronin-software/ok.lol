"use server";

import { db } from "@/db";
import { account, principal } from "@/db/schema";
import { MAX_RELOAD_MICRO, MIN_RELOAD_MICRO } from "@/lib/billing";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAccount, requirePrincipal } from "../auth";

export async function updatePalName(formData: FormData) {
  const { pal } = await requirePrincipal();
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return;
  await db.update(principal).set({ name }).where(eq(principal.id, pal.id));
  revalidatePath("/dashboard/more");
}

/** Parse a dollar string from form input into micro-USD. Returns null on blank. */
function parseDollars(raw: string | null): bigint | null {
  if (!raw || raw.trim() === "") return null;
  const dollars = parseFloat(raw);
  if (Number.isNaN(dollars) || dollars < 0) return null;
  return BigInt(Math.round(dollars * 1_000_000));
}

export async function updateBillingConfig(formData: FormData) {
  const { accountId } = await requireAccount();

  const threshold = parseDollars(formData.get("threshold") as string);
  const target = parseDollars(formData.get("target") as string);
  const limit = parseDollars(formData.get("limit") as string);

  // Validate ranges.
  if (!threshold || threshold < MIN_RELOAD_MICRO || threshold > MAX_RELOAD_MICRO) return;
  if (!target || target < MIN_RELOAD_MICRO || target > MAX_RELOAD_MICRO) return;
  if (target <= threshold) return;
  if (!limit || limit < MIN_RELOAD_MICRO || limit > MAX_RELOAD_MICRO) return;

  await db
    .update(account)
    .set({
      autoReloadTarget: target,
      autoReloadThreshold: threshold,
      monthlySpendLimit: limit,
    })
    .where(eq(account.id, accountId));

  revalidatePath("/dashboard/more");
}
