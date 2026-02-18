"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createContact } from "../actions";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, INPUT } from "../styles";

export default function AddContact({ principalId }: { principalId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setError("");
  }

  function handleSubmit() {
    setError("");
    startTransition(async () => {
      const result = await createContact(principalId, name, email);
      if (result.error) {
        setError(result.error);
      } else {
        reset();
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={BUTTON_PRIMARY}>
        Add contact
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">Add contact</p>
          <button
            onClick={() => { reset(); setOpen(false); }}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            autoFocus
            className={INPUT}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={INPUT}
            onKeyDown={(e) => {
              if (e.key === "Enter" && email.trim()) handleSubmit();
            }}
          />
        </div>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!email.trim() || pending}
            className={BUTTON_PRIMARY}
          >
            {pending ? "Adding..." : "Add"}
          </button>
          <button
            onClick={() => { reset(); setOpen(false); }}
            className={BUTTON_OUTLINE}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
