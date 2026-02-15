"use client";

import Link from "next/link";
import { useState } from "react";
import { BUTTON, INPUT, LABEL, LINK } from "../styles";

export default function ResetForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.target as HTMLFormElement);
    const res = await fetch("/api/auth/reset", {
      body: JSON.stringify({ email: fd.get("email") }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Something went wrong");
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset password
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {sent
              ? "Check your email for a reset link."
              : "Enter your email and we'll send a reset link."}
          </p>
        </div>

        {!sent && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={LABEL}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className={INPUT}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button type="submit" disabled={loading} className={BUTTON}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-center">
          <Link href="/sign-in" className={LINK}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
