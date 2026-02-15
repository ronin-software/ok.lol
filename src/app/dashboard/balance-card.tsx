"use client";

import { useRef, useState } from "react";
import { BUTTON_OUTLINE, CARD, INPUT, LABEL } from "./styles";

const PRESETS = [5, 10, 20];

export default function BalanceCard({ balance }: { balance: number }) {
  const [funding, setFunding] = useState(false);
  const [customFund, setCustomFund] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const customRef = useRef<HTMLInputElement>(null);

  async function handleFund(dollars: number) {
    setFunding(true);
    const res = await fetch("/api/stripe/checkout", {
      body: JSON.stringify({ dollars }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const json = await res.json();
    setFunding(false);
    if (json.url) window.location.assign(json.url);
  }

  const balanceDollars = (balance / 1_000_000).toFixed(6);

  return (
    <div className={CARD}>
      <p className={LABEL}>Balance</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">
        ${balanceDollars}
      </p>
      <div className="mt-4 flex gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => handleFund(preset)}
            disabled={funding}
            className={BUTTON_OUTLINE}
          >
            +${preset}
          </button>
        ))}
        <button
          onClick={() => {
            setCustomFund(true);
            setTimeout(() => customRef.current?.focus(), 0);
          }}
          disabled={funding}
          className={BUTTON_OUTLINE}
        >
          Custom
        </button>
      </div>
      {customFund && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const dollars = Number(customAmount);
            if (dollars >= 1) {
              handleFund(dollars);
              setCustomFund(false);
              setCustomAmount("");
            }
          }}
        >
          <div className="flex flex-1 items-center gap-2">
            <span className="text-sm text-zinc-500">$</span>
            <input
              ref={customRef}
              type="number"
              min={1}
              step={1}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Amount"
              className={INPUT}
            />
          </div>
          <button
            type="submit"
            disabled={funding || Number(customAmount) < 1}
            className={BUTTON_OUTLINE}
          >
            Fund
          </button>
        </form>
      )}
    </div>
  );
}
