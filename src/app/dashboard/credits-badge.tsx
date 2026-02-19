/** Compact balance chip. Glows when payouts are available and balance > $20. */

type Props = {
  balance: number;
  payoutsEnabled: boolean;
};

export default function CreditsBadge({ balance, payoutsEnabled }: Props) {
  const dollars = balance / 1_000_000;
  const glow = payoutsEnabled && dollars > 20;

  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5",
        "text-xs font-medium tabular-nums",
        "border",
        glow
          ? "border-emerald-700 bg-emerald-950/50 text-emerald-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-300",
      ].join(" ")}
    >
      ${dollars.toFixed(2)}
    </span>
  );
}
