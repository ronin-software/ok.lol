import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
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
// Principal
// –

/** An always-on AI agent bound to an account. Address is `username@ok.lol`. */
export const principal = pgTable("principal", {
  accountId: text("account_id")
    .references(() => account.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Unique handle; the principal's email is `username@ok.lol`. */
  username: text("username").notNull().unique(),
});

// –
// Document
// –

/**
 * Append-only document versions. Each edit inserts a new row.
 * The current version of a document is the latest row per (principalId, path).
 * Rollback = insert a new row with old content.
 *
 * Paths are hierarchical: "soul", "identity", "skills/email-handling", etc.
 */
export const document = pgTable("document", {
  /** Document body injected into the system prompt. */
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Who created this version */
  editedBy: text("edited_by", { enum: ["principal", "user"] }).notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Hierarchical document path (e.g. "soul", "skills/research") */
  path: text("path").notNull(),
  /** Injection order. Lower values are included first. */
  priority: integer("priority").notNull().default(0),
  principalId: uuid("principal_id")
    .references(() => principal.id)
    .notNull(),
});

// –
// Log
// –

/** A record of a capability invocation on the origin. */
export const log = pgTable("log", {
  /** Origin capability name (e.g. "act", "email-send"). */
  capability: text("capability").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** JSON-serializable input passed to the capability. */
  input: jsonb("input").notNull(),
  principalId: uuid("principal_id")
    .references(() => principal.id)
    .notNull(),
});

// –
// Listing
// –

/** A principal's published service offering. Processed by `act` during execution. */
export const listing = pgTable("listing", {
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** What callers see when browsing */
  description: text("description").notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** JSON Schema for caller-provided input */
  inputSchema: jsonb("input_schema"),
  /** Base fee in micro-USD. Null = free. */
  price: bigint("price", { mode: "bigint" }),
  principalId: uuid("principal_id")
    .references(() => principal.id)
    .notNull(),
  /** Markdown instructions for the executor */
  skill: text("skill").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  /** Estimated max usage in micro-USD. Callers can adjust when hiring. */
  usageBudget: bigint("usage_budget", { mode: "bigint" }),
});

// –
// Hire
// –

/** An instance of a principal invoking a listing. Lifecycle: escrowed -> settled | refunded. */
export const hire = pgTable("hire", {
  callerId: uuid("caller_id")
    .references(() => principal.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Caller-provided input, validated against listing.inputSchema */
  input: jsonb("input").notNull().default({}),
  listingId: uuid("listing_id")
    .references(() => listing.id)
    .notNull(),
  /** TigerBeetle pending transfer ID. Null when listing is fully free. */
  pendingTransferId: text("pending_transfer_id"),
  /** 1-5, set by caller after settlement */
  rating: integer("rating"),
  settledAt: timestamp("settled_at"),
  /** escrowed -> settled | refunded */
  status: text("status").notNull().default("escrowed"),
  /** Caller-approved usage budget in micro-USD. Defaults to listing.usageBudget. */
  usageBudget: bigint("usage_budget", { mode: "bigint" }),
});

// –
// Message
// –

/** Inbound event from any channel, routed to a principal for processing. */
export const message = pgTable("message", {
  /** Source channel (e.g. "email", "api", "hire"). */
  channel: text("channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Channel-specific payload. */
  payload: jsonb("payload").notNull(),
  principalId: uuid("principal_id")
    .references(() => principal.id)
    .notNull(),
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

/** Per-resource consumption event. One row per resource per call. */
export const usage = pgTable("usage", {
  accountId: text("account_id")
    .references(() => account.id)
    .notNull(),
  /** Amount consumed (tokens, characters, API calls, etc.) */
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  /** Cost in micro-USD (amount * unit cost, computed at write time) */
  cost: bigint("cost", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Associated hire, for settlement reimbursement. Null when self-directed. */
  hireId: uuid("hire_id").references(() => hire.id),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Payable resource key (e.g. "claude-sonnet-4.5:input", "resend:send") */
  resource: text("resource").notNull(),
});

// –
// Worker
// –

/** A registered worker endpoint running capabilities on user hardware. */
export const worker = pgTable("worker", {
  accountId: text("account_id")
    .references(() => account.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Human-readable label (e.g. "my-laptop"). */
  name: text("name").notNull(),
  /** HMAC-SHA256 signing key (hex-encoded, 32 bytes). */
  secret: text("secret").notNull(),
  /** HTTP endpoint reachable from the origin. */
  url: text("url").notNull(),
});
