"use client";

import { useState, useTransition } from "react";
import type { CardSummary } from "@/lib/stripe";
import { updateBillingConfig } from "./more/actions";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, CARD, INPUT, LABEL } from "./styles";

const MIN = 5;
const MAX = 4000;

/** Capitalize the first letter of a card brand for display. */
function brandName(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export default function BillingCard({
  card,
  limit,
  target,
  threshold,
}: {
  /** Saved payment method, if any. */
  card: CardSummary | null;
  /** Monthly spend limit in dollars. */
  limit: number;
  /** Auto-reload target in dollars. */
  target: number;
  /** Auto-reload threshold in dollars. */
  threshold: number;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [changingCard, setChangingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    const t = parseFloat(formData.get("threshold") as string);
    const g = parseFloat(formData.get("target") as string);
    const l = parseFloat(formData.get("limit") as string);

    if (Number.isNaN(t) || t < MIN || t > MAX) {
      setError(`Threshold must be $${MIN}\u2013$${MAX.toLocaleString()}.`);
      return;
    }
    if (Number.isNaN(g) || g < MIN || g > MAX) {
      setError(`Target must be $${MIN}\u2013$${MAX.toLocaleString()}.`);
      return;
    }
    if (g <= t) {
      setError("Target must be greater than threshold.");
      return;
    }
    if (Number.isNaN(l) || l < MIN || l > MAX) {
      setError(`Monthly limit must be $${MIN}\u2013$${MAX.toLocaleString()}.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      await updateBillingConfig(formData);
      setEditing(false);
    });
  }

  async function handleChangeCard() {
    setChangingCard(true);
    try {
      const res = await fetch("/api/stripe/update-card", { method: "POST" });
      const json = await res.json();
      if (json.url) window.location.assign(json.url);
    } finally {
      setChangingCard(false);
    }
  }

  return (
    <div className={CARD}>
      <p className={LABEL}>Auto-reload</p>
      <p className="mt-2 text-sm text-zinc-400">
        Avoid service disruptions by auto-reloading credits when your
        balance reaches a specified minimum.
      </p>

      {/* Payment method */}
      <div className="mt-4 flex items-center justify-between">
        {card ? (
          <p className="text-sm text-zinc-400">
            Credits will be charged to {brandName(card.brand)} ending
            in {card.last4}
          </p>
        ) : (
          <p className="text-sm text-zinc-500">No card on file</p>
        )}
        <button
          onClick={handleChangeCard}
          disabled={changingCard}
          className="text-xs text-zinc-400 underline underline-offset-2 transition-colors hover:text-white disabled:opacity-50"
        >
          {changingCard ? "Redirecting\u2026" : "Change card"}
        </button>
      </div>

      {!editing ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500">When credit balance reaches</p>
              <p className="mt-1 text-sm tabular-nums">${threshold}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Bring credit balance back up to</p>
              <p className="mt-1 text-sm tabular-nums">${target}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Monthly spend limit</p>
            <p className="mt-1 text-sm tabular-nums">${limit}</p>
          </div>
          <button onClick={() => setEditing(true)} className={BUTTON_OUTLINE}>
            Update
          </button>
        </div>
      ) : (
        <form action={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="block text-xs text-zinc-500">
                When credit balance reaches
              </span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-zinc-500">$</span>
                <input
                  name="threshold"
                  type="number"
                  min={MIN}
                  max={MAX}
                  step="any"
                  defaultValue={threshold}
                  className={INPUT}
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="block text-xs text-zinc-500">
                Bring credit balance back up to
              </span>
              <div className="flex items-center gap-1">
                <span className="text-sm text-zinc-500">$</span>
                <input
                  name="target"
                  type="number"
                  min={MIN}
                  max={MAX}
                  step="any"
                  defaultValue={target}
                  className={INPUT}
                />
              </div>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="block text-xs text-zinc-500">Monthly spend limit</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-zinc-500">$</span>
              <input
                name="limit"
                type="number"
                min={MIN}
                max={MAX}
                step="any"
                defaultValue={limit}
                className={INPUT}
              />
            </div>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setEditing(false); setError(null); }}
              className={BUTTON_OUTLINE}
            >
              Cancel
            </button>
            <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
              {pending ? "Saving\u2026" : "Update"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
