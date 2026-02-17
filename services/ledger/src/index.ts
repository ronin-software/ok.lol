import type { Account } from "tigerbeetle-node";
import * as tb from "./tb";

const SECRET = process.env.LEDGER_SECRET;
if (!SECRET) throw new Error("LEDGER_SECRET is required");

// Bootstrap platform account on startup.
await tb.bootstrap();

// –
// Serialization
// –

/** Convert a TB Account to a JSON-safe shape (bigints → strings). */
function serializeAccount(a: Account) {
  return {
    code: a.code,
    credits_pending: String(a.credits_pending),
    credits_posted: String(a.credits_posted),
    debits_pending: String(a.debits_pending),
    debits_posted: String(a.debits_posted),
    flags: a.flags,
    id: String(a.id),
    ledger: a.ledger,
    reserved: a.reserved,
    timestamp: String(a.timestamp),
    user_data_128: String(a.user_data_128),
    user_data_32: a.user_data_32,
    user_data_64: String(a.user_data_64),
  };
}

// –
// Routes
// –

type Handler = (body: Record<string, unknown>) => Promise<Response>;

const routes: Record<string, Handler> = {
  "/accounts": async (body) => {
    await tb.createAccount(BigInt(body.accountId as string));
    return Response.json({ ok: true });
  },

  "/accounts/lookup": async (body) => {
    const account = await tb.lookupAccount(BigInt(body.accountId as string));
    if (!account) return Response.json(null, { status: 404 });
    return Response.json(serializeAccount(account));
  },

  "/accounts/lookup-many": async (body) => {
    const ids = (body.accountIds as string[]).map(BigInt);
    const accounts = await tb.lookupAccounts(ids);
    return Response.json(accounts.map(serializeAccount));
  },

  "/bootstrap": async () => {
    await tb.bootstrap();
    return Response.json({ ok: true });
  },

  "/debit": async (body) => {
    await tb.debit(
      BigInt(body.accountId as string),
      BigInt(body.amount as string),
    );
    return Response.json({ ok: true });
  },

  "/fund": async (body) => {
    await tb.fund(
      BigInt(body.creditAccountId as string),
      BigInt(body.amount as string),
    );
    return Response.json({ ok: true });
  },

  "/post": async (body) => {
    await tb.post(
      BigInt(body.pendingId as string),
      BigInt(body.amount as string),
    );
    return Response.json({ ok: true });
  },

  "/reserve": async (body) => {
    const transferId = await tb.reserve(
      BigInt(body.debitAccountId as string),
      BigInt(body.amount as string),
      body.timeout != null ? Number(body.timeout) : undefined,
      body.code != null ? Number(body.code) : undefined,
    );
    return Response.json({ transferId: String(transferId) });
  },

  "/transfer": async (body) => {
    await tb.transfer(
      BigInt(body.fromId as string),
      BigInt(body.toId as string),
      BigInt(body.amount as string),
    );
    return Response.json({ ok: true });
  },

  "/void": async (body) => {
    await tb.void_(BigInt(body.pendingId as string));
    return Response.json({ ok: true });
  },
};

// –
// Server
// –

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  async fetch(req) {
    // Auth
    const header = req.headers.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token !== SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Dispatch
    const { pathname } = new URL(req.url);
    const handler = routes[pathname];
    if (!handler || req.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return await handler(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${pathname}:`, message);
      return Response.json({ error: message }, { status: 500 });
    }
  },
});

console.log(`Ledger service listening on :${port}`);
