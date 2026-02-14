import Stripe from "stripe";
import { assert } from "./assert";
import { env } from "./env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/** Micro-USD per cent. */
const MICRO_PER_CENT = 10_000n;

// Compile-time constant sanity check.
assert(MICRO_PER_CENT === 10_000n, "MICRO_PER_CENT must be 10_000");

/** Convert Stripe's cents to micro-USD. */
export function centsToMicro(cents: number): bigint {
  assert(cents >= 0, "cents must be non-negative");
  const result = BigInt(cents) * MICRO_PER_CENT;
  assert(result >= 0n, "micro result must be non-negative");
  return result;
}

/** Convert micro-USD to Stripe's cents (floor). */
export function microToCents(micro: bigint): number {
  assert(micro >= 0n, "micro must be non-negative");
  return Number(micro / MICRO_PER_CENT);
}

/** Default auto-top-up threshold in micro-USD ($1). */
export const TOPUP_THRESHOLD_MICRO = 1_000_000n;

/** Default auto-top-up amount in cents ($10). */
export const TOPUP_AMOUNT_CENTS = 1000;

// Threshold must equal the cent conversion.
assert(
  TOPUP_THRESHOLD_MICRO === centsToMicro(100),
  "TOPUP_THRESHOLD_MICRO must equal $1 in micro-USD",
);

// –
// Customers
// –

/** Create a Stripe Customer and return its ID. */
export async function createCustomer(
  email: string,
  accountId: string,
): Promise<string> {
  assert(email.length > 0, "email must not be empty");
  assert(accountId.length > 0, "accountId must not be empty");
  const customer = await stripe.customers.create({
    email,
    metadata: { accountId },
  });
  assert(customer.id.startsWith("cus_"), "Stripe customer ID format");
  return customer.id;
}

// –
// Checkout
// –

/** Create a Checkout Session that saves the card for future off-session charges. */
export async function createCheckoutSession(opts: {
  accountId: string;
  cents: number;
  customerId: string;
  /** Extra metadata merged into the session (e.g. bot username). */
  metadata?: Record<string, string>;
  successUrl: string;
}) {
  assert(opts.accountId.length > 0, "accountId must not be empty");
  assert(opts.cents > 0, "cents must be positive");
  assert(
    opts.customerId.length > 0,
    "customerId must not be empty",
  );
  assert(opts.successUrl.length > 0, "successUrl must not be empty");
  return stripe.checkout.sessions.create({
    custom_text: {
      after_submit: {
        message:
          "Your card will be kept on file and charged " +
          "automatically when your balance is low.",
      },
    },
    customer: opts.customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "ok.lol credits" },
          unit_amount: opts.cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      accountId: opts.accountId,
      cents: String(opts.cents),
      ...opts.metadata,
    },
    mode: "payment",
    payment_intent_data: { setup_future_usage: "off_session" },
    payment_method_types: ["card"],
    success_url: opts.successUrl,
  });
}

// –
// Off-Session Charges
// –

/**
 * Charge a customer's saved payment method off-session.
 * Returns the PaymentIntent ID on success, or null if no
 * payment method is on file.
 */
export async function chargeOffSession(
  customerId: string,
  cents: number,
  accountId: string,
): Promise<string | null> {
  assert(customerId.length > 0, "customerId must not be empty");
  assert(cents > 0, "cents must be positive");
  assert(accountId.length > 0, "accountId must not be empty");

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;

  const paymentMethod =
    customer.invoice_settings?.default_payment_method ??
    (await stripe.paymentMethods
      .list({ customer: customerId, type: "card", limit: 1 })
      .then((result) => result.data[0]?.id));

  if (!paymentMethod) return null;

  const intent = await stripe.paymentIntents.create({
    amount: cents,
    confirm: true,
    currency: "usd",
    customer: customerId,
    metadata: { accountId, auto_topup: "true" },
    off_session: true,
    payment_method:
      typeof paymentMethod === "string"
        ? paymentMethod
        : paymentMethod.id,
  });

  return intent.id;
}

// –
// Connect
// –

/** Payout fee basis points (100 = 1.00%). */
export const FEE_BPS_PAYOUT = 100n;

// Sanity: fee must be between 0 and 100%.
assert(FEE_BPS_PAYOUT > 0n, "FEE_BPS_PAYOUT must be positive");
assert(FEE_BPS_PAYOUT < 10000n, "FEE_BPS_PAYOUT must be < 100%");

/** Compute the payout fee for an amount. Ceiling-rounds toward platform. */
export function payoutFee(amount: bigint): bigint {
  assert(amount > 0n, "amount must be positive");
  const result = (amount * FEE_BPS_PAYOUT + 9999n) / 10000n;
  assert(result > 0n, "fee must be positive for positive amount");
  return result;
}

/** Create a Stripe Connect Express account and return its ID. */
export async function createConnectAccount(
  email: string,
  accountId: string,
): Promise<string> {
  assert(email.length > 0, "email must not be empty");
  assert(accountId.length > 0, "accountId must not be empty");
  const account = await stripe.accounts.create({
    capabilities: { transfers: { requested: true } },
    country: "US",
    email,
    metadata: { accountId },
    type: "express",
  });
  return account.id;
}

/** Generate a hosted onboarding link for a Connect account. */
export async function createAccountLink(
  connectId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  assert(connectId.length > 0, "connectId must not be empty");
  assert(refreshUrl.length > 0, "refreshUrl must not be empty");
  assert(returnUrl.length > 0, "returnUrl must not be empty");
  const link = await stripe.accountLinks.create({
    account: connectId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  assert(link.url.length > 0, "account link URL must not be empty");
  return link.url;
}

/** Retrieve a Connect account's payout readiness. */
export async function getConnectStatus(
  connectId: string,
): Promise<boolean> {
  assert(connectId.length > 0, "connectId must not be empty");
  const account = await stripe.accounts.retrieve(connectId);
  return account.payouts_enabled ?? false;
}

/**
 * Transfer funds from the platform to a connected account.
 * Returns the Stripe Transfer ID.
 */
export async function transferToConnected(
  destination: string,
  cents: number,
  idempotencyKey: string,
): Promise<string> {
  assert(destination.length > 0, "destination must not be empty");
  assert(cents > 0, "cents must be positive");
  assert(
    idempotencyKey.length > 0,
    "idempotencyKey must not be empty",
  );
  const transfer = await stripe.transfers.create(
    { amount: cents, currency: "usd", destination },
    { idempotencyKey },
  );
  assert(
    transfer.id.length > 0,
    "Stripe transfer ID must not be empty",
  );
  return transfer.id;
}
