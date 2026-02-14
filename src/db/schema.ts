import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * A funded account backed by a TigerBeetle ledger entry.
 * The primary key is the TigerBeetle account ID (u128 as text).
 */
export const account = pgTable("account", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  email: text("email").notNull().unique(),
  /** TigerBeetle account ID (u128, stored as text). */
  id: text("id").primaryKey(),
  name: text("name"),
  /** Argon2id hash of the account password. */
  passwordHash: text("password_hash").notNull(),
  /** Stripe Connect account ID. Non-null when payouts are enabled. */
  stripeConnectId: text("stripe_connect_id"),
  /** Stripe Customer ID for saved payment methods. */
  stripeCustomerId: text("stripe_customer_id"),
});

// –
// Bot
// –

/** A bot bound to an account. Address is `username@ok.lol`. */
export const bot = pgTable("bot", {
  accountId: text("account_id")
    .references(() => account.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Unique handle; the bot's email is `username@ok.lol`. */
  username: text("username").notNull().unique(),
});

// –
// Bot Document
// –

/**
 * Named document injected into a bot's system prompt.
 * Examples: soul, identity, user, memory.
 * One document per kind per bot, ordered by priority during assembly.
 */
export const botDocument = pgTable(
  "bot_document",
  {
    botId: uuid("bot_id")
      .references(() => bot.id)
      .notNull(),
    /** Document body injected into the system prompt. */
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    /** Document type: soul, identity, user, memory, etc. */
    kind: text("kind").notNull(),
    /** Injection order. Lower values are included first. */
    priority: integer("priority").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("bot_document_bot_kind").on(t.botId, t.kind)],
);

// –
// Message
// –

/** Inbound event from any channel, routed to a bot for processing. */
export const message = pgTable("message", {
  botId: uuid("bot_id")
    .references(() => bot.id)
    .notNull(),
  /** Source channel (e.g. "email", "api"). */
  channel: text("channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Channel-specific payload. */
  payload: jsonb("payload").notNull(),
});

// –
// Payout
// –

/** Payout saga coordination log. Tracks state across TigerBeetle and Stripe. */
export const payout = pgTable("payout", {
  accountId: text("account_id")
    .references(() => account.id)
    .notNull(),
  /** Withdrawal amount in micro-USD. */
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Platform fee in micro-USD. */
  fee: bigint("fee", { mode: "bigint" }).notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** TigerBeetle pending transfer ID (u128 as text). */
  pendingTransferId: text("pending_transfer_id"),
  /** reserved → transferred → completed | failed */
  status: text("status").notNull().default("reserved"),
  /** Stripe Transfer ID for the net payout. */
  stripeTransferId: text("stripe_transfer_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// –
// Usage
// –

/** Per-request token usage and cost log. */
export const usage = pgTable("usage", {
  accountId: text("account_id")
    .references(() => account.id)
    .notNull(),
  /** Cost in micro-USD (1e-6 USD). */
  cost: bigint("cost", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  inputTokens: integer("input_tokens").notNull(),
  model: text("model").notNull(),
  outputTokens: integer("output_tokens").notNull(),
});
