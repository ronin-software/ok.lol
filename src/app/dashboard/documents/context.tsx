"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/** Content pair for rendering a diff between two versions. */
type DiffVersion = {
  current: string;
  previous: string;
};

type DocumentsContextValue = {
  /** Clear the active diff selection, returning to editor mode. */
  clearDiff: () => void;
  /** Version content pair for diff view. Null = editor mode. */
  diffVersion: DiffVersion | null;
  /** Notify that a save occurred so the sidebar re-fetches history. */
  notifySave: () => void;
  /** Monotonic counter incremented after each save. */
  saveCount: number;
  /** Select two version contents for diffing. */
  setDiff: (current: string, previous: string) => void;
};

const Ctx = createContext<DocumentsContextValue | null>(null);

export function DocumentsProvider({ children }: { children: React.ReactNode }) {
  const [diffVersion, setDiffVersion] = useState<DiffVersion | null>(null);
  const [saveCount, setSaveCount] = useState(0);

  const clearDiff = useCallback(() => setDiffVersion(null), []);
  const setDiff = useCallback(
    (current: string, previous: string) => setDiffVersion({ current, previous }),
    [],
  );
  const notifySave = useCallback(() => setSaveCount((n) => n + 1), []);

  const value = useMemo<DocumentsContextValue>(
    () => ({ clearDiff, diffVersion, notifySave, saveCount, setDiff }),
    [clearDiff, diffVersion, notifySave, saveCount, setDiff],
  );

  return <Ctx value={value}>{children}</Ctx>;
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDocuments must be used within DocumentsProvider");
  return ctx;
}
