// src/popup/components/Popup.tsx
import { useEffect, useState } from "react";
import "../index.css";

import type { Settings, Theme } from "../../lib/types";
import { getSettings, setSettings, setSettingsPartial } from "../../lib/storage";

type Status = "idle" | "loading" | "done" | "error";

export default function Popup() {
  const [settings, setLocalSettings] = useState<Settings>({
    pollingSeconds: 30,
    compact: true,
    showBar: false,
    theme: "auto",
  });

  const [status, setStatus] = useState<Status>("idle");
  const [refreshing, setRefreshing] = useState(false);

  // Load settings on open
  useEffect(() => {
    let alive = true;
    (async () => {
      setStatus("loading");
      try {
        const s = await getSettings();
        if (alive) {
          setLocalSettings(s);
          setStatus("idle");
        }
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Derived text for the badge/pill
  const barOn = settings.showBar;
  const pillText = barOn ? "Bar is ON" : "Bar is OFF";

  async function toggleShowBar(next: boolean) {
    setLocalSettings({ ...settings, showBar: next });
    await setSettingsPartial({ showBar: next });
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_toggle_showBar" }).catch(() => {});
  }

  async function toggleCompact(next: boolean) {
    setLocalSettings({ ...settings, compact: next });
    await setSettingsPartial({ compact: next });
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_toggle_compact" }).catch(() => {});
  }

  async function changeTheme(next: Theme) {
    setLocalSettings({ ...settings, theme: next });
    await setSettingsPartial({ theme: next });
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_change_theme" }).catch(() => {});
  }

  async function refreshNow() {
    setRefreshing(true);
    try {
      await chrome.runtime.sendMessage({ type: "REFRESH_NOW_FROM_POPUP" });
    } finally {
      setRefreshing(false);
    }
  }

  async function resetPosition() {
    // remove barPos only
    const current = await getSettings();
    const next = { ...current };
    delete (next as any).barPos;
    await setSettings(next);
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "reset_bar_pos" }).catch(() => {});
  }

  return (
    <div className="pp">
      <div className="pp-card">
        {/* Header */}
        <header className="pp-header">
          <div className="pp-header-left">
            <img src="../assets/icons/icon48.png" className="pp-logo" alt="SportScanner" />
            <div className="pp-titleWrap">
              <div className="pp-title">SportScanner</div>
              <div className="pp-subtitle">Quick controls</div>
            </div>
          </div>

          <span className={`pp-pill ${barOn ? "is-on" : "is-off"}`}>{pillText}</span>
        </header>

        <div className="pp-divider" />

        {/* Floating bar toggle */}
        <section className="pp-section">
          <div className="pp-row">
            <div className="pp-row-txt">
              <div className="pp-row-title">Floating bar</div>
              <div className="pp-row-sub">Toggle visibility on all pages.</div>
            </div>
            <label className="pp-switch">
              <input
                type="checkbox"
                checked={settings.showBar}
                onChange={(e) => toggleShowBar(e.target.checked)}
                aria-label="Toggle floating bar"
              />
              <span className="pp-slider" />
            </label>
          </div>
        </section>

        {/* Quick toggles */}
        <section className="pp-section">
          <div className="pp-row">
            <label className="pp-check">
              <input
                type="checkbox"
                checked={settings.compact}
                onChange={(e) => toggleCompact(e.target.checked)}
              />
              <span>
                Compact mode
              </span>
            </label>
          </div>

          <div className="pp-row">
            <label className="pp-select-label">
              Theme
              <select
                className="pp-select"
                value={settings.theme}
                onChange={(e) => changeTheme(e.target.value as Theme)}
              >
                <option value="auto">Auto (system)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </section>

        {/* Actions */}
        <section className="pp-actions">
          <button
            type="button"
            className="pp-btn pp-ghost"
            onClick={() => chrome.runtime.openOptionsPage()}
            title="Open full options"
          >
            Open Options <span className="pp-arrow">↗</span>
          </button>

          <button
            type="button"
            className="pp-btn pp-primary"
            onClick={refreshNow}
            disabled={refreshing || status === "loading"}
          >
            {refreshing ? "Refreshing…" : "Refresh Now"}
          </button>
        </section>

        <footer className="pp-footer">
          <span>v0.2.0</span>
          <button type="button" className="pp-link" onClick={resetPosition} title="Recenter the bar">
            Reset position
          </button>
          <a className="pp-link muted" href="https://iammaxlichter.com" target="_blank" rel="noreferrer">
            © Max Lichter
          </a>
        </footer>
      </div>
    </div>
  );
}
