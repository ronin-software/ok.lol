"use client";

export default function SignOut() {
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/signout", { method: "POST" });
        window.location.href = "/sign-in";
      }}
      className="text-xs text-zinc-500 transition-colors hover:text-white"
    >
      Sign out
    </button>
  );
}
