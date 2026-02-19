"use client";

import { useState } from "react";
import { DocumentsProvider } from "./context";
import Sidebar, { type DocEntry } from "./sidebar";

type Props = {
  children: React.ReactNode;
  docs: DocEntry[];
  principalId: string;
};

/** Responsive shell: sidebar + main content, wrapped in DocumentsProvider. */
export default function DocumentsShell({ children, docs, principalId }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <DocumentsProvider>
      <div className="flex h-full">
        {/* Scrim for mobile drawer */}
        {drawerOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/50 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div
          className={[
            "flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950",
            drawerOpen
              ? "absolute inset-y-0 left-0 z-20 lg:relative lg:inset-auto lg:z-auto"
              : "hidden lg:flex",
          ].join(" ")}
        >
          <Sidebar docs={docs} principalId={principalId} />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile toggle */}
          <div className="flex items-center border-b border-zinc-800 px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="text-xs text-zinc-400 transition-colors hover:text-white"
            >
              {drawerOpen ? "✕ Close" : "☰ Files"}
            </button>
          </div>

          <div className="min-h-0 flex-1">
            {children}
          </div>
        </div>
      </div>
    </DocumentsProvider>
  );
}
