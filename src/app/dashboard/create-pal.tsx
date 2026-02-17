"use client";

import { useState } from "react";
import { BUTTON_PRIMARY as BUTTON, CARD, INPUT, LABEL } from "./styles";

export default function CreatePal({ domain }: { domain: string }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = username.toLowerCase().trim();
  const valid = name.trim().length > 0 && handle.length >= 4;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/pal", {
      body: JSON.stringify({ name: name.trim(), username: handle }),
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

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-xs text-zinc-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should your pal be called?"
            className={INPUT}
          />
        </div>

        {/* Email */}
        <div>
          <label className="mb-1 block text-xs text-zinc-400">
            Email
          </label>
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
          {handle.length > 0 && handle.length < 4 && (
            <p className="mt-1 text-xs text-zinc-500">
              Must be at least 4 characters.
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            Your pal will send and receive emails as{" "}
            <span className="text-zinc-300">
              {handle || "username"}@{domain}
            </span>
            .
          </p>
        </div>

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
