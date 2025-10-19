import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={checked ? "Turn bar off" : "Turn bar on"}
      style={{
        position: "relative",
        width: 56,
        height: 32,
        borderRadius: 9999,
        border: "1px solid var(--border)",
        background: checked ? "var(--accent)" : "var(--muted)",
        boxShadow: checked ? "inset 0 0 0 1px rgba(0,0,0,.06)" : "inset 0 0 0 1px rgba(0,0,0,.04)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .18s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 29 : 3,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 2px 8px rgba(0,0,0,.18)",
          transition: "left .18s ease",
        }}
      />
    </button>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        fontSize: 12,
        borderRadius: 9999,
        border: "1px solid var(--border)",
        background: "var(--chip-bg)",
        color: "var(--text)",
      }}
      title={`The floating bar is currently ${on ? "enabled" : "disabled"}.`}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: on ? "var(--green)" : "var(--gray)",
          boxShadow: `0 0 0 2px var(--chip-bg)`,
        }}
      />
      {on ? "Bar is ON" : "Bar is OFF"}
    </span>
  );
}

function Popup() {
  const [loading, setLoading] = useState(true);
  const [on, setOn] = useState(true);

  // theme vars (light/dark)
  const prefersDark = useMemo(
    () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches,
    []
  );

  useEffect(() => {
    const root = document.documentElement;
    const setVars = (dark: boolean) => {
      root.style.setProperty("--bg", dark ? "#0b1220" : "#ffffff");
      root.style.setProperty("--panel", dark ? "#0f172a" : "#f8fafc");
      root.style.setProperty("--border", dark ? "#1e293b" : "#e5e7eb");
      root.style.setProperty("--text", dark ? "#e5e7eb" : "#0f172a");
      root.style.setProperty("--text-muted", dark ? "#94a3b8" : "#475569");
      root.style.setProperty("--muted", dark ? "#334155" : "#e5e7eb");
      root.style.setProperty("--accent", dark ? "#3b82f6" : "#2563eb");
      root.style.setProperty("--green", "#16a34a");
      root.style.setProperty("--gray", "#9ca3af");
      root.style.setProperty("--chip-bg", dark ? "#0b1220" : "#ffffff");
      root.style.setProperty("--grad-1", dark ? "#0b1220" : "#eff6ff");
      root.style.setProperty("--grad-2", dark ? "#111827" : "#ffffff");
    };
    setVars(prefersDark);

    // react to later system changes
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setVars(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [prefersDark]);

  useEffect(() => {
    chrome.storage.sync.get(["settings"]).then((res) => {
      setOn(res.settings?.showBar ?? true);
      setLoading(false);
    });
  }, []);

  const toggle = async () => {
    setLoading(true);
    const res = await chrome.storage.sync.get(["settings"]);
    const next = { ...(res.settings ?? {}), showBar: !on };
    await chrome.storage.sync.set({ settings: next });
    // optionally nudge the SW to refresh UI immediately
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_toggle" }).catch(() => { });
    setOn(!on);
    setLoading(false);
  };


  return (
    <div
      style={{
        width: 280,
        padding: 0,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif",
        color: "var(--text)",
        background: "var(--bg)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 14px 12px",
          borderBottom: "1px solid var(--border)",
          background: "linear-gradient(180deg, var(--grad-1), var(--grad-2))",
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>SportScanner</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Quick controls</div>
          </div>
          <StatusPill on={on} />
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Floating bar</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Toggle visibility on all pages.
            </div>
          </div>
          <Toggle checked={on} onChange={toggle} disabled={loading} />
        </div>

        {/* Actions */}
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <a
            href="options.html"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--panel)",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 600,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--panel)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.97)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Open Options
            <span aria-hidden>↗</span>
          </a>

          <button
            onClick={() =>
              chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_refresh" })
            }
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.1)";
              e.currentTarget.style.boxShadow = "0 4px 10px rgba(37,99,235,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
              e.currentTarget.style.boxShadow = "none";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.97)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Refresh Now
          </button>

        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>v1.0</span>
        <span>© Max Lichter</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
