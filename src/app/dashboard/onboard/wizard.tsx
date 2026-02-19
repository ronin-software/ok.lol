"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const STEPS = ["welcome", "name", "handle", "deploy"] as const;
type Step = (typeof STEPS)[number];

const BTN = [
  "flex h-11 w-full items-center justify-center",
  "rounded-lg bg-white font-medium text-black",
  "transition-colors hover:bg-zinc-200",
  "disabled:opacity-50",
].join(" ");

const TXT = [
  "flex h-10 w-full rounded-lg border",
  "border-zinc-800 bg-zinc-900 px-3 text-sm text-white",
  "placeholder-zinc-600 outline-none",
  "focus:border-zinc-600 transition-colors",
].join(" ");

export default function Wizard({ domain }: { domain: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const step = (searchParams.get("step") as Step) ?? "welcome";
  const stepIndex = Math.max(0, STEPS.indexOf(step));

  // Accumulated form state, seeded from URL for back-button tolerance.
  const [name, setName] = useState(searchParams.get("name") ?? "");
  const [handle, setHandle] = useState(searchParams.get("handle") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function advance(next: Step, extra?: Record<string, string>) {
    const params = new URLSearchParams(searchParams);
    params.set("step", next);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
    }
    router.push(`/dashboard/onboard?${params}`);
  }

  async function deploy() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/pal", {
      body: JSON.stringify({
        name: name.trim(),
        username: handle.toLowerCase().trim(),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Something went wrong");
      return;
    }
    if (json.url) window.location.assign(json.url);
  }

  const trimmedHandle = handle.toLowerCase().trim();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Progress bar */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={[
                "h-1 flex-1 rounded-full transition-colors",
                i <= stepIndex ? "bg-white" : "bg-zinc-800",
              ].join(" ")}
            />
          ))}
        </div>

        {/* Welcome */}
        {step === "welcome" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Deploy your pal
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Your pal is an always-on AI agent with its own email address,
                memory, and toolbox. It works for you around the clock.
              </p>
            </div>
            <button onClick={() => advance("name")} className={BTN}>
              Let&apos;s go
            </button>
          </div>
        )}

        {/* Name */}
        {step === "name" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Name your pal
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Your pal is your always-on AI agent. Give it a name — this is
                how it introduces itself.
              </p>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Atlas, Sage, Nova…"
              autoFocus
              className={TXT}
            />
            <button
              onClick={() => {
                if (name.trim()) advance("handle", { name: name.trim() });
              }}
              disabled={!name.trim()}
              className={BTN}
            >
              Continue
            </button>
          </div>
        )}

        {/* Handle */}
        {step === "handle" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Set up {name || "your pal"}&apos;s email
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                The email address to reach your pal. It&apos;s recommended to
                use a username associated with you.
              </p>
            </div>
            <div className="flex items-center gap-0">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="username"
                autoFocus
                className={[TXT, "rounded-r-none"].join(" ")}
              />
              <span
                className={[
                  "flex h-10 items-center rounded-r-lg border",
                  "border-l-0 border-zinc-800 bg-zinc-950 px-3",
                  "text-sm text-zinc-500 select-none",
                ].join(" ")}
              >
                @{domain}
              </span>
            </div>
            {trimmedHandle.length > 0 && trimmedHandle.length < 4 && (
              <p className="text-xs text-zinc-500">
                Must be at least 4 characters.
              </p>
            )}
            <button
              onClick={() => {
                if (trimmedHandle.length >= 4) {
                  advance("deploy", { handle: trimmedHandle });
                }
              }}
              disabled={trimmedHandle.length < 4}
              className={BTN}
            >
              Continue
            </button>
          </div>
        )}

        {/* Deploy */}
        {step === "deploy" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Ready to deploy
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                <span className="text-white font-medium">{name}</span> will be
                live at{" "}
                <span className="text-white font-medium">
                  {trimmedHandle}@{domain}
                </span>
                .
              </p>
            </div>
            <button
              onClick={deploy}
              disabled={loading}
              className={BTN}
            >
              {loading ? "Redirecting…" : "Secure for $20"}
            </button>
            <p className="text-xs text-zinc-500">
              The $20 registration fee is added to your credit balance.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
