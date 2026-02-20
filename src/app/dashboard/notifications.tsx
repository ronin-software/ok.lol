"use client";

import { playPing } from "@/app/chat/ping";
import { createRivetKit } from "@rivetkit/next-js/client";
import type { registry } from "@/rivet/registry";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const { useActor } = createRivetKit<typeof registry>();

// –
// Types
// –

type Toast = {
  content: string;
  id: string;
  threadId: string;
  title: string;
};

// –
// Component
// –

/** Auto-dismiss delay in ms. */
const DISMISS_MS = 8_000;

export default function Notifications({ principalId }: { principalId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();

  const inbox = useActor({
    key: [principalId],
    name: "inbox",
  });

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  inbox.useEvent("message", (payload: { content: string; threadId: string; title: string }) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...payload, id }]);
    playPing();

    setTimeout(() => dismiss(id), DISMISS_MS);
  });

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className="w-80 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left shadow-xl transition-opacity hover:bg-zinc-800"
          onClick={() => {
            dismiss(toast.id);
            router.push(`/dashboard/chat?thread=${toast.threadId}`);
          }}
        >
          <p className="text-sm font-medium text-zinc-200 truncate">{toast.title}</p>
          <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{toast.content}</p>
        </button>
      ))}
    </div>
  );
}
