"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUTTON_OUTLINE, CARD, INPUT, LABEL } from "./styles";

export default function PayoutCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleOnboard() {
    const res = await fetch("/api/connect/onboard", { method: "POST" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    if (json.enabled) router.refresh();
  }

  async function handlePayout(dollars: number) {
    setLoading(true);
    setError("");
    const micro = Math.round(dollars * 1_000_000);
    const res = await fetch("/api/connect/payout", {
      body: JSON.stringify({ amount: micro }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Payout failed");
      return;
    }
    setAmount("");
    router.refresh();
  }

  return (
    <div className={CARD}>
      <p className={LABEL}>Payouts</p>
      {enabled ? (
        <>
          <p className="mt-2 text-sm text-zinc-400">
            Withdraw your balance to your bank account or debit card. A 1% fee
            applies.
          </p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const dollars = Number(amount);
              if (dollars >= 0.01) handlePayout(dollars);
            }}
          >
            <div className="flex flex-1 items-center gap-2">
              <span className="text-sm text-zinc-500">$</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className={INPUT}
              />
            </div>
            <button
              type="submit"
              disabled={loading || Number(amount) < 0.01}
              className={BUTTON_OUTLINE}
            >
              {loading ? "Processing..." : "Withdraw"}
            </button>
          </form>
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-zinc-400">
            Payouts are not enabled. Connect a bank account or debit card to
            withdraw your balance.
          </p>
          <button
            onClick={handleOnboard}
            className={["mt-4", BUTTON_OUTLINE].join(" ")}
          >
            Enable payouts
          </button>
        </>
      )}
    </div>
  );
}
