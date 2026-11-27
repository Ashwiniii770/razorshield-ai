"use client";

import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  Command,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Shield,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const navigation = [
  { href: "/", label: "Risk command", icon: LayoutDashboard },
  { href: "/rules", label: "Rule studio", icon: SlidersHorizontal },
  { href: "/simulator", label: "Live simulator", icon: FlaskConical },
  { href: "/disputes", label: "Dispute vault", icon: AlertTriangle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadReviewCount = useCallback(async () => {
    try {
      const response = await fetch("/api/transactions?decision=REVIEW&limit=1", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Review count request failed (${response.status}).`);
      const data = (await response.json()) as { total: number };
      setReviewCount(data.total);
    } catch (error) {
      console.error("Could not refresh the review queue badge:", error);
    }
  }, []);

  useEffect(() => {
    void loadReviewCount();
    const timer = window.setInterval(() => void loadReviewCount(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadReviewCount]);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <Link href="/" className="brand-home" aria-label="RazorShieldAI home">
            <span className="brand-mark"><Shield size={21} strokeWidth={2.2} /></span>
            <span className="brand-name">razor<span>shield</span><small>INTELLIGENCE PLATFORM</small></span>
          </Link>
          <button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                href={href}
                key={href}
                className={`side-nav-link ${active ? "side-nav-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
                {href === "/" && reviewCount !== null && reviewCount > 0 && (
                  <span className="nav-count">{reviewCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-section-label sidebar-section-spaced">MONITORING</div>
        <div className="side-monitor-card">
          <div className="monitor-icon"><Activity size={15} /></div>
          <div><b>Risk engine</b><span><i className="live-dot" />Operational</span></div>
          <span className="monitor-latency">42ms</span>
        </div>

        <div className="sidebar-bottom">
          <div className="workspace-switcher">
            <div className="workspace-avatar">RS</div>
            <div className="workspace-copy"><b>RazorShield Ops</b><span>Institutional · Live</span></div>
            <ChevronDown size={15} className="muted-icon" />
          </div>
          <div className="sidebar-build"><span>SECURE WORKSPACE</span><span>v1.0.4 <ArrowUpRight size={12} /></span></div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="topbar-context"><Command size={14} /><span>RISK OPERATIONS</span><span className="context-divider">/</span><b>{navigation.find((item) => item.href === pathname)?.label ?? "Risk operations"}</b></div>
          <div className="topbar-right">
            <span className="environment-pill"><i className="live-dot" />LIVE ENVIRONMENT</span>
            <span className="topbar-divider" />
            <div className="analyst-avatar" aria-label="Signed in as Alex Morgan">AM</div>
            <div className="analyst-label"><b>Alex Morgan</b><span>Risk analyst</span></div>
            <ChevronDown size={14} className="muted-icon" />
          </div>
        </header>
        <main className="page-content">{children}</main>
      </section>
    </div>
  );
}
