import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FollowedTeam, League, Settings } from "../lib/types";
import { getFollowedTeams, setFollowedTeams, getSettings, setSettings } from "../lib/storage";

const SEED: Record<League, FollowedTeam[]> = {
  nba: [
    { league: "nba", teamId: "DAL", name: "Dallas Mavericks" },
    { league: "nba", teamId: "SAS", name: "San Antonio Spurs" },
    { league: "nba", teamId: "HOU", name: "Houston Rockets" },
  ],
  nfl: [],
  mlb: [],
  nhl: [],
};

function Options() {
  const [league, setLeague] = useState<League>("nba");
  const [available, setAvailable] = useState<FollowedTeam[]>([]);
  const [selected, setSelected] = useState<FollowedTeam[]>([]);
  const [settings, setLocalSettings] = useState<Settings>({ pollingSeconds: 30, showBar: true, theme: "auto", compact: true });
  const selectedIds = useMemo(() => new Set(selected.map(t => `${t.league}:${t.teamId}`)), [selected]);

  useEffect(() => {
    (async () => {
      setAvailable(SEED[league]);
      setSelected(await getFollowedTeams());
      setLocalSettings(await getSettings());
    })();
  }, [league]);

  const toggleTeam = (t: FollowedTeam) => {
    const key = `${t.league}:${t.teamId}`;
    const next = selectedIds.has(key)
      ? selected.filter(x => `${x.league}:${x.teamId}` !== key)
      : [...selected, t];
    setSelected(next);
  };

  const saveAll = async () => {
    await setFollowedTeams(selected);
    await setSettings(settings);
    // notify background to reconfigure polling immediately
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    alert("Saved!");
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif", maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>SportScanner Options</h1>

      <section style={{ marginBottom: 16 }}>
        <label>League:&nbsp;</label>
        <select value={league} onChange={e => setLeague(e.target.value as League)}>
          <option value="nba">NBA</option>
          <option value="nfl" disabled>NFL (soon)</option>
          <option value="mlb" disabled>MLB (soon)</option>
          <option value="nhl" disabled>NHL (soon)</option>
        </select>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3>Available teams</h3>
          {available.map(t => {
            const checked = selectedIds.has(`${t.league}:${t.teamId}`);
            return (
              <label key={t.teamId} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input type="checkbox" checked={checked} onChange={() => toggleTeam(t)} />
                <span>{t.name}</span>
              </label>
            );
          })}
        </div>

        <div>
          <h3>Settings</h3>
          <label style={{ display: "block", marginBottom: 8 }}>
            Polling seconds:&nbsp;
            <input
              type="number"
              min={10}
              value={settings.pollingSeconds}
              onChange={e => setLocalSettings({ ...settings, pollingSeconds: Number(e.target.value) || 30 })}
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={settings.showBar}
              onChange={e => setLocalSettings({ ...settings, showBar: e.target.checked })}
            />
            &nbsp;Show bottom bar
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Compact bar:&nbsp;
            <input
              type="checkbox"
              checked={settings.compact}
              onChange={e => setLocalSettings({ ...settings, compact: e.target.checked })}
            />
          </label>
          <label style={{ display: "block" }}>
            Theme:&nbsp;
            <select value={settings.theme} onChange={e => setLocalSettings({ ...settings, theme: e.target.value as Settings["theme"] })}>
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </section>

      <button onClick={saveAll} style={{ marginTop: 16, padding: "8px 12px" }}>Save</button>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
