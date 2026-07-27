/**
 * Notification Preferences page — lets users toggle which alert categories
 * they receive (stale positions, review queue backlog, sync errors).
 */

import React, { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Prefs {
  stale_alerts: boolean;
  review_queue_alerts: boolean;
  sync_error_alerts: boolean;
}

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/notifications/preferences", { credentials: "include" })
      .then((r) => r.json())
      .then((d: Prefs) => setPrefs(d))
      .catch(() => {
        toast({ title: "Failed to load preferences", variant: "destructive" });
      });
  }, []);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Preferences saved" });
    } catch {
      toast({ title: "Failed to save preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Prefs) {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: !prefs[key] });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notification Preferences</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control which alert categories you receive in your notification inbox.
          </p>
        </div>
      </div>

      {!prefs ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading preferences…</span>
        </div>
      ) : (
        <div className="space-y-4">
          <PreferenceRow
            label="Stale Position Alerts"
            description="Notify when positions have not been updated in over 180 days and may require re-evaluation or new citations."
            enabled={prefs.stale_alerts}
            onToggle={() => toggle("stale_alerts")}
          />
          <PreferenceRow
            label="Review Queue Backlog"
            description="Notify when open-gap positions are sitting in the review queue awaiting CPA/EA sign-off."
            enabled={prefs.review_queue_alerts}
            onToggle={() => toggle("review_queue_alerts")}
          />
          <PreferenceRow
            label="Exchange Sync Errors"
            description="Notify when a Coinbase, Kraken, or Gemini sync fails due to credential or API errors."
            enabled={prefs.sync_error_alerts}
            onToggle={() => toggle("sync_error_alerts")}
          />

          <div className="pt-4">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save preferences"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreferenceRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-md border border-border bg-card">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          enabled ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
