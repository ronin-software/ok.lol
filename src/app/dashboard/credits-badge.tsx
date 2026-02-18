import Link from "next/link";

/** Compact balance chip. Glows when payouts are available and balance > $20. */

type Props = {
  balance: number;
  payoutsEnabled: boolean;
};

export default function CreditsBadge({ balance, payoutsEnabled }: Props) {
  const dollars = balance / 1_000_000;
  const glow = payoutsEnabled && dollars > 20;

  return (
    <Link
      href="/dashboard/settings"
      className={[
        "inline-flex items-center rounded-full px-3 py-1",
        "text-xs font-medium tabular-nums transition-colors",
        "border",
        glow
          ? "border-emerald-700 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-950"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
      ].join(" ")}
    >
      ${dollars.toFixed(2)}
    </Link>
  );
}
