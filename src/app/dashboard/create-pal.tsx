"use client";

import { useState } from "react";
import { BUTTON_PRIMARY as BUTTON, CARD, INPUT, LABEL } from "./styles";

const domain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "ok.lol";

export default function CreatePal() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const name = username.toLowerCase().trim();
  const valid = name.length >= 4;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/pal", {
      body: JSON.stringify({ username: name }),
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

  return (
    <div className={CARD}>
      <p className={LABEL}>Deploy Your Pal</p>
      <p className="mt-2 text-sm text-zinc-400">
        Your pal will be able to send and receive emails from{" "}
        <span className="font-medium text-white">
          {name || "username"}@{domain}
        </span>
        .
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="flex items-center gap-0">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            className={[INPUT, "rounded-r-none"].join(" ")}
          />
          <span
            className={[
              "flex h-9 items-center rounded-r-lg border",
              "border-l-0 border-zinc-800 bg-zinc-950 px-3",
              "text-sm text-zinc-500 select-none",
            ].join(" ")}
          >
            @{domain}
          </span>
        </div>
        {name.length > 0 && name.length < 4 && (
          <p className="text-xs text-zinc-500">
            Must be at least 4 characters.
          </p>
        )}
        <button
          type="submit"
          disabled={!valid || loading}
          className={BUTTON}
        >
          {loading ? "Redirecting..." : "Secure for $20"}
        </button>
        <p className="text-xs text-zinc-500">
          The $20 registration fee is added to your {domain} credit balance.
        </p>
      </form>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
