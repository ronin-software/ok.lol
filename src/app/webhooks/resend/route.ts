import { generateText } from "ai";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * POST /api/resend/webhook
 *
 * Receives inbound email events from Resend. Verifies the Svix
 * signature, resolves the target bot, fetches the email body,
 * queues a message row, and signals the bot's workflow.
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
    // Acknowledge non-inbound events without processing.
    return new Response("ok");
  }

  // The webhook payload omits the body; fetch it via the receiving API.
  const { data: email, error } = await resend.emails.receiving.get(
    event.data.email_id,
  );
  if (error) {
    return Response.json({ message: "Error getting received email via Resend", error }, { status: 500 });
  }

  // Write response
  const emailResponse = await generateText({
    model: "anthropic/claude-sonnet-4.5",
    system: `You are Dan Scanlon's assistant.
Dan is a software engineer and drummer.
He co-owns Ronin Software (ronindevs.com) with Dan Stepanov.

You speak casually and confidently. Your prompts are emails. For each prompt, output a reply.
Incoming email:
  - Subject: "${email.subject}"
  - From: "${email.from}"`, 
    prompt: email.text ?? "(no body)",
  });

  // Send response reply
  await resend.emails.send({
    to: email.from,
    from: "Scanlon's Lil Guy <bot@ok.lol>",
    subject: email.subject,
    text: emailResponse.text,
  })

  return new Response("ok");
}
