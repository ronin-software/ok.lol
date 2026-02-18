"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteContact } from "../actions";

export default function DeleteContact({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteContact(id);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
      } else {
        router.push("/dashboard/contacts");
      }
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-zinc-500 transition-colors hover:text-red-400"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3">
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-xs text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
