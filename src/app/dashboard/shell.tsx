"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CreditsBadge from "./credits-badge";
import Icon, { type IconName } from "./icons";
import PalSwitcher from "./pal-switcher";
import SignOut from "./sign-out";

// –
// Nav
// –

type NavItem = { href: string; icon: IconName; label: string };

const NAV: NavItem[] = [
  { href: "/dashboard/chat", icon: "chat", label: "Chat" },
  { href: "/dashboard/contacts", icon: "contacts", label: "Contacts" },
  { href: "/dashboard/documents", icon: "documents", label: "Documents" },
  { href: "/dashboard/workers", icon: "workers", label: "Workers" },
  { href: "/dashboard/more", icon: "more", label: "More" },
];

// –
// Types
// –

/** Minimal pal identity for shell chrome. */
type Pal = { name: string; username: string };

/** Props provided by the server layout. */
type Props = {
  balance: number;
  children: React.ReactNode;
  domain: string;
  pal: Pal | null;
  payoutsEnabled: boolean;
};

// –
// Shell
// –

export default function Shell({ balance, children, domain, pal, payoutsEnabled }: Props) {
  const pathname = usePathname();

  // Bare chrome for onboarding (no pal yet).
  if (!pal) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  return (
    <div className="flex h-dvh bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden w-48 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">
        <PalSwitcher domain={domain} pal={pal} />
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" name={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.href === "/dashboard/more" && (
                <CreditsBadge balance={balance} payoutsEnabled={payoutsEnabled} />
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t border-zinc-800 px-4 py-3">
          <SignOut />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center border-b border-zinc-800 px-4 py-3 md:hidden">
          <PalSwitcher compact domain={domain} pal={pal} />
        </header>

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>

        {/* Bottom tabs — mobile */}
        <nav className="flex shrink-0 border-t border-zinc-800 bg-zinc-950 pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex flex-1 flex-col items-center gap-1 py-2",
                pathname.startsWith(item.href) ? "text-white" : "text-zinc-500",
              ].join(" ")}
            >
              {item.href === "/dashboard/more" ? (
                <>
                  <CreditsBadge balance={balance} payoutsEnabled={payoutsEnabled} />
                  <span className="text-[10px] text-zinc-500">More</span>
                </>
              ) : (
                <>
                  <span className="text-[10px]">{item.label}</span>
                  <Icon className="h-5 w-5" name={item.icon} />
                </>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
