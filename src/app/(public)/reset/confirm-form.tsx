"use client";

import Link from "next/link";
import { useState } from "react";
import { BUTTON, INPUT, LABEL } from "../styles";

export default function ResetConfirmForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.target as HTMLFormElement);
    const res = await fetch("/api/auth/reset/confirm", {
      body: JSON.stringify({ password: fd.get("password"), token }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Something went wrong");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Password updated
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Your password has been reset.
            </p>
          </div>
          <Link href="/sign-in" className={BUTTON}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            New password
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Choose a new password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className={LABEL}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="••••••••"
              className={INPUT}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className={BUTTON}>
            {loading ? "Updating..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}
