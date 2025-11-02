// src/popup/components/Popup.tsx
import { useEffect, useMemo, useState } from "react";
import "../index.css";

import type { Settings, Theme, Game, FollowedTeam } from "../../lib/types";
import { getSettings, setSettings, setSettingsPartial, getFollowedTeams } from "../../lib/storage";

const U = (s?: string | null) => (s ?? "").trim().toUpperCase();
const key = (league?: string | null, teamId?: string | null) =>
  `${U(league)}:${U(teamId)}`;

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
  const [followed, setFollowed] = useState<FollowedTeam[]>([]);
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setStatus("loading");
      try {
        const [s, sel] = await Promise.all([getSettings(), getFollowedTeams()]);
        if (alive) {
          setLocalSettings(s);
          setFollowed(sel);
          setStatus("idle");
        }
      } catch {
        if (alive) setStatus("error");
      }
      try {
        chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }, (resp?: { games?: Game[] }) => {
          if (!alive) return;
          if (chrome.runtime.lastError) return;
          if (resp?.games) setGames(resp.games);
        });
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

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
      chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }, (resp?: { games?: Game[] }) => {
        if (resp?.games) setGames(resp.games);
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function resetPosition() {
    const current = await getSettings();
    const next = { ...current };
    delete (next as any).barPos;
    await setSettings(next);
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "reset_bar_pos" }).catch(() => {});
  }

  const followedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of followed) s.add(key(t.league, t.teamId));
    return s;
  }, [followed]);

  const hasFollowed = followed.length > 0;

  const anyFollowedEligible = useMemo(() => {
    if (!hasFollowed || games.length === 0) return false;
    const now = Date.now();
    const soonMs = 48 * 60 * 60 * 1000;

    for (const g of games) {
      const isPre = g.status?.phase === "pre";
      const eligible =
        !isPre ||
        (typeof g.startTime === "number" &&
          g.startTime - now <= soonMs &&
          g.startTime - now >= -soonMs);

      if (!eligible) continue;

      const hKey = key(g.league as any, g.home?.teamId);
      const aKey = key(g.league as any, g.away?.teamId);
      if (followedKeys.has(hKey) || followedKeys.has(aKey)) return true;
    }
    return false;
  }, [games, followedKeys, hasFollowed]);

  const showWhyBox = hasFollowed && !anyFollowedEligible;

  // Pretty list of followed team names
  const followedNames = useMemo(() => {
    const names = followed.map(t => t.name ?? `${t.league.toUpperCase()} ${t.teamId}`);
    // keep it tidy if huge list
    return names.length > 8 ? names.slice(0, 8).join(", ") + "…" : names.join(", ");
  }, [followed]);

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

        {/* WHY NOTHING IS SHOWING (red notice) */}
        {showWhyBox && (
          <div
            role="status"
            aria-live="polite"
            style={{
              margin: "10px 12px 0",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#7f1d1d",
              fontSize: 13,
              lineHeight: 1.35,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No cards yet for your followed teams</div>
            <div>
              {followedNames
                ? <>The team(s) you follow — <em>{followedNames}</em> — don't have a game live or within the 48-hour pre-game window right now.</>
                : <>Your followed teams don't have a game live or within the 48-hour pre-game window right now.</>}
              {" "}Their scorecards will automatically appear when a matchup is <strong>live</strong> or within <strong>48 hours before kickoff</strong>.
            </div>
          </div>
        )}

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
