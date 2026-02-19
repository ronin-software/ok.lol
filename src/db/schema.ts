import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
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
  /** Stripe Connect account ID. Non-null when payouts are enabled. */
  stripeConnectId: text("stripe_connect_id"),
  /** Stripe Customer ID for saved payment methods. */
  stripeCustomerId: text("stripe_customer_id"),
}, (t) => [
  // Webhook updates by connect ID: UPDATE ... WHERE stripe_connect_id = ?
  index("account_stripe_connect_idx").on(t.stripeConnectId),
]);

// –
// Principal
// –

/** An always-on AI agent bound to an account. Address is `username@<domain>`. */
export const principal = pgTable("principal", {
  accountId: text("account_id")
    .references(() => account.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Display name chosen by the owner. */
  name: text("name").notNull(),
  /** Unique handle; doubles as the principal's email local-part. */
  username: text("username").notNull().unique(),
}, (t) => [
  // Ownership checks: WHERE account_id = ? (does this account have a pal?)
  index("principal_account_idx").on(t.accountId),
]);

// –
// Contact
// –

/**
 * People the principal knows.
 *
 * The "owner" contact is the account holder — seeded at principal creation
 * from account.email. All other known parties are "contact".
 *
 * Structured identity lives here; narrative notes live in documents at the
 * conventional path `contacts/{email}`, written by the principal as it learns.
 */
export const contact = pgTable("contact", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Address used to reach this person. Nullable until known. */
  email: text("email"),
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  principalId: uuid("principal_id")
    .references(() => principal.id, { onDelete: "cascade" })
    .notNull(),
  /** "owner" = the account holder; "contact" = everyone else. */
  relationship: text("relationship", { enum: ["owner", "contact"] })
    .notNull()
    .default("contact"),
}, (t) => [
  index("contact_principal_idx").on(t.principalId),
  index("contact_principal_email_idx").on(t.principalId, t.email),
]);

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
  /** Activation phrases + pre-computed embeddings for relevance filtering. */
  activation: jsonb("activation"),
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
    .references(() => principal.id, { onDelete: "cascade" })
    .notNull(),
}, (t) => [
  // All reads filter by principalId+path, ordered by createdAt DESC (latest version per path).
  index("document_principal_path_idx").on(t.principalId, t.path, t.createdAt),
]);

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
    .references(() => principal.id, { onDelete: "cascade" })
    .notNull(),
}, (t) => [
  // Audit log queries per principal, newest first.
  index("log_principal_created_idx").on(t.principalId, t.createdAt),
]);

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
    .references(() => principal.id, { onDelete: "cascade" })
    .notNull(),
  /** Markdown instructions for the executor */
  skill: text("skill").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  /** Estimated max usage in micro-USD. Callers can adjust when hiring. */
  usageBudget: bigint("usage_budget", { mode: "bigint" }),
}, (t) => [
  // All reads filter by principalId (load listings, act execution).
  index("listing_principal_idx").on(t.principalId),
]);

// –
// Hire
// –

export const hireStatusEnum = pgEnum("hire_status", ["escrowed", "settled", "refunded"]);

/** An instance of a principal invoking a listing. Lifecycle: escrowed -> settled | refunded. */
export const hire = pgTable("hire", {
  callerId: uuid("caller_id")
    .references(() => principal.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Caller-provided input, validated against listing.inputSchema */
  input: jsonb("input").notNull().default({}),
  listingId: uuid("listing_id")
    .references(() => listing.id, { onDelete: "cascade" })
    .notNull(),
  /** TigerBeetle pending transfer ID. Null when listing is fully free. */
  pendingTransferId: text("pending_transfer_id"),
  /** 1-5, set by caller after settlement */
  rating: integer("rating"),
  settledAt: timestamp("settled_at"),
  /** escrowed -> settled | refunded */
  status: hireStatusEnum("status").notNull().default("escrowed"),
  /** Caller-approved usage budget in micro-USD. Defaults to listing.usageBudget. */
  usageBudget: bigint("usage_budget", { mode: "bigint" }),
}, (t) => [
  // Listing all hires made by a caller, or all hires for a listing.
  index("hire_caller_idx").on(t.callerId),
  index("hire_listing_idx").on(t.listingId),
]);

// –
// Thread
// –

export const channelEnum = pgEnum("channel", ["chat", "email"]);


/** A conversation group. Chat sessions and email threads are both threads. */
export const thread = pgTable("thread", {
  channel: channelEnum("channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  principalId: uuid("principal_id")
    .references(() => principal.id, { onDelete: "cascade" })
    .notNull(),
  /** LLM-generated for chat, email subject for email, user-overridable. */
  title: text("title"),
}, (t) => [
  // recentThreads (principalId [+ channel]) and findEmailThread (principalId + channel [+ title]).
  index("thread_principal_channel_idx").on(t.principalId, t.channel),
]);

// –
// Message
// –

/**
 * A turn in a thread: user input, assistant response, tool result, or summary.
 *
 * Summaries are messages with role "summary". The `summaryId` self-FK forms
 * a tree: when a set of messages is summarized, each points to the summary
 * message. Summaries themselves can be covered by higher-level summaries.
 *
 * Active context = messages where summaryId IS NULL, ordered by createdAt.
 */
export const message = pgTable("message", {
  /** Human-readable text. For tool results, stringified output. */
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Channel-specific data (email headers, from/to, etc.). */
  metadata: jsonb("metadata"),
  /** AI SDK parts array for faithful tool-call reconstruction. */
  parts: jsonb("parts"),
  role: text("role", { enum: ["user", "assistant", "tool", "summary"] }).notNull(),
  /** The summary that covers this message. Null = part of active context. */
  // Self-FK declared via raw SQL in migration; Drizzle can't type circular refs.
  summaryId: uuid("summary_id"),
  threadId: uuid("thread_id")
    .references(() => thread.id, { onDelete: "cascade" })
    .notNull(),
  /** Estimated token count for context budgeting. */
  tokens: integer("tokens"),
}, (t) => [
  // threadMessages / activeContext / activeTokens: WHERE threadId = ? [AND summaryId IS NULL] ORDER BY createdAt
  index("message_thread_summary_idx").on(t.threadId, t.summaryId),
  index("message_thread_created_idx").on(t.threadId, t.createdAt),
  // children() / expand(): WHERE summaryId = ? ORDER BY createdAt (threadId unknown at call site)
  index("message_summary_created_idx").on(t.summaryId, t.createdAt),
]);

// –
// Payout
// –

export const payoutStatusEnum = pgEnum("payout_status", ["reserved", "transferred", "completed", "failed"]);

/** Payout saga coordination log. Tracks state across TigerBeetle and Stripe. */
export const payout = pgTable("payout", {
  accountId: text("account_id")
    .references(() => account.id, { onDelete: "cascade" })
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
  status: payoutStatusEnum("status").notNull().default("reserved"),
  /** Stripe Transfer ID for the net payout. */
  stripeTransferId: text("stripe_transfer_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // Payout history per account.
  index("payout_account_idx").on(t.accountId),
]);

// –
// Usage
// –

/** Per-resource consumption event. One row per resource per call. */
export const usage = pgTable("usage", {
  accountId: text("account_id")
    .references(() => account.id, { onDelete: "cascade" })
    .notNull(),
  /** Amount consumed (tokens, characters, API calls, etc.) */
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  /** Cost in micro-USD (amount * unit cost, computed at write time) */
  cost: bigint("cost", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** Associated hire, for settlement reimbursement. Null when self-directed. */
  hireId: uuid("hire_id").references(() => hire.id, { onDelete: "cascade" }),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Payable resource key (e.g. "resend:send", "model-provider/model-name:input") */
  resource: text("resource").notNull(),
}, (t) => [
  // Billing summaries by account, and settlement reimbursement by hire.
  index("usage_account_created_idx").on(t.accountId, t.createdAt),
  index("usage_hire_idx").on(t.hireId),
]);

// –
// Worker
// –

/** A registered worker endpoint running capabilities on user hardware. */
export const worker = pgTable("worker", {
  accountId: text("account_id")
    .references(() => account.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id").primaryKey().defaultRandom(),
  /** Hostname reported by the worker. Null until first probe. */
  name: text("name"),
  /** HMAC-SHA256 signing key (hex-encoded, 32 bytes). */
  secret: text("secret").notNull(),
  /** HTTP endpoint reachable from the origin (auto-populated). */
  url: text("url").notNull(),
}, (t) => [
  // discover() and probeWorkers() are in the hot path of every act() call.
  index("worker_account_idx").on(t.accountId),
]);
