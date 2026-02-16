"use client";

import Link from "next/link";
import { useState } from "react";
import { BUTTON, INPUT, LABEL, LINK } from "../styles";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/signup", {
      body: JSON.stringify({ email, password }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (!res.ok) {
      const text = await res.text();
      setLoading(false);
      try {
        const data = JSON.parse(text);
        setError(data.error?.message ?? "Something went wrong");
      } catch {
        setError("Something went wrong");
      }
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ok.lol</h1>
          <p className="mt-2 text-sm text-zinc-400">
            An always-on proactive AI that does things for you. Sign up to get
            started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className={LABEL}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={INPUT}
            />
          </div>

          <div>
            <label htmlFor="password" className={LABEL}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={INPUT}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || password.length < 8}
            className={BUTTON}
          >
            {loading ? "Creating account..." : "Get started"}
          </button>
        </form>

        <p className="text-center">
          <Link href="/sign-in" className={LINK}>
            Already have an account?
          </Link>
        </p>
      </div>
    </div>
  );
}
