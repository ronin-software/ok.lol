"use client";

import { useEffect } from "react";

/** Flash banner shown after Stripe checkout. Clears the cookie on mount. */
export default function FundedBanner() {
  useEffect(() => {
    document.cookie = "funded=; path=/; max-age=0";
  }, []);

  return (
    <div
      className={[
        "mb-8 rounded-lg border border-green-800",
        "bg-green-950 px-4 py-3 text-sm text-green-300",
      ].join(" ")}
    >
      Payment received. Your balance has been updated.
    </div>
  );
}
