/** Pal identity display at the top of the sidebar / mobile header. */

type Props = {
  /** Compact mode for the mobile header bar. */
  compact?: boolean;
  domain: string;
  pal: { name: string; username: string };
};

export default function PalSwitcher({ compact, domain, pal }: Props) {
  const initial = pal.name[0]?.toUpperCase() ?? "?";

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-white">
          {initial}
        </div>
        <span className="text-sm font-medium text-white">{pal.name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white">
        {initial}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{pal.name}</p>
        <p className="truncate text-xs text-zinc-500">
          {pal.username}@{domain}
        </p>
      </div>
    </div>
  );
}
