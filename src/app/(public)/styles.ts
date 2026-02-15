/** Shared Tailwind class strings for public (auth) pages. */

export const BUTTON = [
  "flex h-11 w-full items-center justify-center",
  "rounded-lg bg-white font-medium text-black",
  "transition-colors hover:bg-zinc-200",
  "disabled:opacity-50",
].join(" ");

export const INPUT = [
  "mt-1.5 flex h-10 w-full rounded-lg border",
  "border-zinc-800 bg-zinc-900 px-3 text-sm text-white",
  "placeholder-zinc-600 outline-none",
  "focus:border-zinc-600 transition-colors",
].join(" ");

export const LABEL = [
  "text-xs font-medium uppercase tracking-wider",
  "text-zinc-500",
].join(" ");

export const LINK = [
  "text-sm text-zinc-500 hover:text-white",
  "transition-colors",
].join(" ");
