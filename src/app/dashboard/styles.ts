/** Shared Tailwind class strings for dashboard components. */

export const BUTTON_OUTLINE = [
  "rounded-lg border border-zinc-700 px-4 py-2",
  "text-sm transition-colors",
  "hover:border-zinc-500 hover:bg-zinc-800",
  "disabled:opacity-50",
].join(" ");

export const BUTTON_PRIMARY = [
  "rounded-lg bg-white px-4 py-2 text-sm",
  "font-medium text-black transition-colors",
  "hover:bg-zinc-200 disabled:opacity-50",
].join(" ");

export const CARD = [
  "mt-8 rounded-xl border border-zinc-800",
  "bg-zinc-900 p-6",
].join(" ");

export const INPUT = [
  "flex h-9 w-full rounded-lg border",
  "border-zinc-800 bg-zinc-900 px-3 text-sm text-white",
  "placeholder-zinc-600 outline-none",
  "focus:border-zinc-600 transition-colors",
].join(" ");

export const LABEL = [
  "text-xs font-medium uppercase tracking-wider",
  "text-zinc-500",
].join(" ");
