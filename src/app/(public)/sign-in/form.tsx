"use client";

import Link from "next/link";
import { useState } from "react";
import { BUTTON, INPUT, LABEL, LINK } from "../styles";

export default function SigninForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.target as HTMLFormElement);
    const res = await fetch("/api/auth/signin", {
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Invalid credentials");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Enter your email and password.
          </p>
        </div>

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

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className={LABEL}>
                Password
              </label>
              <Link
                href="/reset"
                className="text-xs text-zinc-500 transition-colors hover:text-white"
              >
                Forgot password?
              </Link>
            </div>
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center">
          <Link href="/sign-up" className={LINK}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
