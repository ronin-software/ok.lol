import { getExecutionContext } from "@/capabilities/context";
import emailReceive from "@/capabilities/email/email.receive";
import { db } from "@/db";
import { principal } from "@/db/schema";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { eq } from "drizzle-orm";
import type { GetReceivingEmailResponseSuccess } from "resend";

/**
 * POST /api/resend/webhook
 *
 * Receives inbound email events from Resend. Verifies the Svix
 * signature, resolves the target principal, fetches the email body,
 * and invokes the email-receive capability.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing signature headers", { status: 400 });
  }

  let event;
  try {
    event = resend.webhooks.verify({
      headers: {
        id: svixId,
        signature: svixSignature,
        timestamp: svixTimestamp,
      },
      payload: body,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "email.received") {
    return new Response("ok");
  }

  // Resolve target principal from the "to" address.
  const toAddress = event.data.to?.[0];
  if (!toAddress) {
    return new Response("No recipient", { status: 400 });
  }

  // Guard: ignore emails for domains that don't match this environment.
  if (!toAddress.endsWith(`@${env.EMAIL_DOMAIN}`)) {
    return new Response("ok");
  }

  const username = toAddress.split("@")[0]!;

  const [row] = await db
    .select({ id: principal.id })
    .from(principal)
    .where(eq(principal.username, username))
    .limit(1);
  if (!row) {
    return new Response("Unknown principal", { status: 404 });
  }

  // Fetch the full email body (the webhook payload omits it).
  const { data: email, error } = await resend.emails.receiving.get(
    event.data.email_id,
  );
  if (error) {
    return Response.json({ message: "Error getting received email via Resend", error }, { status: 500 });
  }

  try {
    const ectx = await getExecutionContext({ principalId: row.id });
    await emailReceive(ectx, email as GetReceivingEmailResponseSuccess);
    return new Response("ok");
  } catch (error) {
    return Response.json({ message: "email-receive capability call failed", error }, { status: 500 });
  }
}
