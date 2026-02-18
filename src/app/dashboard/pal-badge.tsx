import { env } from "@/lib/env";

export default function PalBadge({ name, username }: { name: string; username: string }) {
  return (
    <div
      className={[
        "mt-8 flex items-center gap-3 rounded-xl",
        "border border-zinc-800 bg-zinc-900 px-4 py-3",
      ].join(" ")}
    >
      <div>
        <p className="text-sm font-medium text-white">{name}</p>
        <p className="text-xs text-zinc-500">
          {username}@{env.EMAIL_DOMAIN}
        </p>
      </div>
    </div>
  );
}
