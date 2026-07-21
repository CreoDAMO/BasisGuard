/**
 * NotificationBell — header bell icon with unread badge and dropdown panel.
 *
 * Polls GET /api/notifications/count on mount + every 60 s. On open, calls
 * POST /api/notifications/generate to refresh auto-generated alerts, then
 * lists them. Each item can be marked read individually; "Mark all read"
 * bulk-clears. Panel closes on outside click.
 */

import React, { useState, useEffect, useRef } from "react";
import { Bell, X, CheckCheck, AlertCircle, Clock, Loader2 } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  position_id: string | null;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "stale_positions":
      return <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />;
    case "review_queue":
      return <AlertCircle className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount and every 60 s
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function fetchCount() {
    try {
      const res = await fetch("/api/notifications/count", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { unread: number };
        setUnread(data.unread ?? 0);
      }
    } catch { /* network offline — ignore */ }
  }

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    setLoading(true);
    try {
      // Refresh auto-generated alerts first
      await fetch("/api/notifications/generate", {
        method: "POST",
        credentials: "include",
      });
      const res = await fetch("/api/notifications?limit=20", { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as Notification[];
        setItems(data);
        setUnread(data.filter((n) => !n.read).length);
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={openPanel}
        className="relative p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        title="Notifications"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel — opens upward from the footer area */}
      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-80 bg-card border border-border rounded-md shadow-xl z-50 flex flex-col max-h-[420px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <Bell className="h-6 w-6 opacity-30" />
                <p className="text-xs">No notifications</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/5 ${
                      n.read ? "opacity-55" : "bg-accent/10"
                    }`}
                    onClick={() => { if (!n.read) markRead(n.id); }}
                  >
                    <TypeIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug text-foreground ${!n.read ? "font-semibold" : ""}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0 mt-1.5" title="Unread" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 shrink-0">
            <a
              href="/notifications/preferences"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setOpen(false)}
            >
              Notification preferences →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
