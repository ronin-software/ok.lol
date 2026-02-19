"use server";

import { db } from "@/db";
import { principal } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requirePrincipal } from "../auth";

export async function updatePalName(formData: FormData) {
  const { pal } = await requirePrincipal();
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return;
  await db.update(principal).set({ name }).where(eq(principal.id, pal.id));
  revalidatePath("/dashboard/more");
}
