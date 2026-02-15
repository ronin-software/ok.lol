import emailReceive from "@/capabilities/email-receive";
import { getExecutionContext } from "@/capabilities/_execution-context";
import { db } from "@/db";
import { principal } from "@/db/schema";
import { secret } from "@/lib/session";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * POST /webhooks/resend/email.received
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
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "email.received") {
    return new Response("ok");
  }

  // Resolve target principal from the "to" address
  const toAddress = event.data.to?.[0];
  if (!toAddress) {
    return new Response("No recipient", { status: 400 });
  }
  const username = toAddress.split("@")[0]!;

  const [row] = await db
    .select()
    .from(principal)
    .where(eq(principal.username, username))
    .limit(1);
  if (!row) {
    return new Response("Unknown principal", { status: 404 });
  }

  // Issue a short-lived JWT for this execution
  const jwt = await new SignJWT({ sub: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secret());

  // The webhook payload omits the body; fetch it via the receiving API.
  const { data: email, error } = await resend.emails.receiving.get(
    event.data.email_id,
  );
  if (error) {
    return Response.json({ message: "Error getting received email via Resend", error }, { status: 500 });
  }

  try {
    const ectx = await getExecutionContext(jwt);
    await emailReceive.call(ectx, email);
    return new Response("ok");
  } catch (error) {
    return Response.json({ message: "email-receive capability call failed", error }, { status: 500 });
  }
}
