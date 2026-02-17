"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** How long to wait before showing the fallback (ms). */
const FALLBACK_DELAY = 1500;

/**
 * Attempts to open the native app via custom URL scheme.
 * Shows a fallback after a short delay if the app didn't claim the URL.
 */
export default function OpenRedirect({
  scheme,
  token,
}: {
  scheme: string;
  token: string;
}) {
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // Attempt custom scheme redirect.
    window.location.href = `${scheme}://auth?token=${token}`;

    // If we're still here after the delay, the app didn't open.
    const timer = setTimeout(() => setShowFallback(true), FALLBACK_DELAY);
    return () => clearTimeout(timer);
  }, [scheme, token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Opening ok.lol&hellip;
        </h1>
        {showFallback && (
          <>
            <p className="text-sm text-zinc-400">
              The app didn&apos;t open. You can continue on the web instead.
            </p>
            <Link
              href="/dashboard"
              className={[
                "inline-flex h-11 items-center justify-center",
                "rounded-lg bg-white px-6 font-medium text-black",
                "transition-colors hover:bg-zinc-200",
              ].join(" ")}
            >
              Continue on web
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
