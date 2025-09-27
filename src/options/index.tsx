import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FollowedTeam, League, Settings } from "../lib/types";
import { getFollowedTeams, setFollowedTeams, getSettings, setSettings } from "../lib/storage";
import { LEAGUE_TEAMS } from "../lib/teams";

function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [state, setState] = useState<{ loading: boolean; value?: T; error?: unknown }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fn().then(v => alive && setState({ loading: false, value: v }))
      .catch(e => alive && setState({ loading: false, error: e }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function Options() {
  const [league, setLeague] = useState<League>("nba");
  const [search, setSearch] = useState("");
  const ALL_LEAGUES = Object.keys(LEAGUE_TEAMS) as League[];

  const [settings, setLocalSettings] = useState<Settings>({
    pollingSeconds: 30, showBar: true, theme: "auto", compact: true,
  });

  const [collapsed, setCollapsed] = useState<Record<League, boolean>>(
    ALL_LEAGUES.reduce((acc, lg) => {
      acc[lg] = false; 
      return acc;
    }, {} as Record<League, boolean>)
  );


  const toggleCollapsed = (lg: League) =>
    setCollapsed(c => ({ ...c, [lg]: !c[lg] }));

  const init = useAsync(async () => {
    const [sel, s] = await Promise.all([getFollowedTeams(), getSettings()]);
    return { sel, s };
  }, []);

  const [selected, setSelected] = useState<FollowedTeam[]>([]);
  useEffect(() => {
    if (init.value) {
      setSelected(init.value.sel);
      setLocalSettings(init.value.s);
    }
  }, [init.value]);

  const available: FollowedTeam[] = useMemo(() => LEAGUE_TEAMS[league] ?? [], [league]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(t => t.name.toLowerCase().includes(q) || t.teamId.toLowerCase().includes(q));
  }, [available, search]);

  const selectedKey = (t: FollowedTeam) => `${t.league}:${t.teamId}`;
  const selectedIds = useMemo(() => new Set(selected.map(selectedKey)), [selected]);

  const toggleTeam = (t: FollowedTeam) => {
    const key = selectedKey(t);
    const next = selectedIds.has(key)
      ? selected.filter(x => selectedKey(x) !== key)
      : [...selected, t];
    setSelected(next);
  };

  const selectAllVisible = () => {
    const merge = new Map<string, FollowedTeam>();
    for (const t of selected) merge.set(selectedKey(t), t);
    for (const t of filtered) merge.set(selectedKey(t), t);
    setSelected(Array.from(merge.values()));
  };

  const clearAllVisible = () => {
    const vis = new Set(filtered.map(selectedKey));
    setSelected(selected.filter(t => !vis.has(selectedKey(t))));
  };

  const saveAll = async () => {
    await setFollowedTeams(selected);
    await setSettings(settings);
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    const btn = document.getElementById("save-btn");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "Saved ✓";
      setTimeout(() => (btn.textContent = orig || "Save"), 900);
    } else {
      alert("Saved!");
    }
  };

  const dirty =
    !!init.value &&
    (JSON.stringify(init.value.sel) !== JSON.stringify(selected) ||
      JSON.stringify(init.value.s) !== JSON.stringify(settings));

  const isCollapsed = collapsed[league];

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif", maxWidth: 880 }}>
      <h1 style={{ marginTop: 0 }}>SportScanner Options</h1>

      {/* League + search */}
      <section style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label>League:&nbsp;</label>
        <select
          value={league}
          onChange={e => {
            setLeague(e.target.value as League);
            setSearch("");
          }}
        >
          {ALL_LEAGUES.map(lg => (
            <option key={lg} value={lg} disabled={!LEAGUE_TEAMS[lg]?.length}>
              {lg.toUpperCase()}
            </option>
          ))}
        </select>

        <input
          placeholder="Search team (e.g. DAL, Mavericks)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        {/* Available teams (collapsible) */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                aria-expanded={!isCollapsed}
                aria-controls="teams-panel"
                onClick={() => toggleCollapsed(league)}
                title={isCollapsed ? "Expand" : "Collapse"}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: "1px solid #e5e7eb",
                  background: "#fff", cursor: "pointer", lineHeight: "1", fontSize: 14
                }}
              >
                {isCollapsed ? "▶" : "▼"}
              </button>
              <h3 style={{ margin: 0 }}>Teams — {league.toUpperCase()}</h3>
              <span style={{ color: "#64748b", fontSize: 12 }}>
                {available.length} total{search ? ` · ${filtered.length} shown` : ""}
              </span>
            </div>

            {!isCollapsed && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={selectAllVisible}>Select all (filtered)</button>
                <button onClick={clearAllVisible}>Clear filtered</button>
              </div>
            )}
          </div>

          {/* Collapsible content */}
          {!isCollapsed ? (
            <div id="teams-panel">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                {filtered.map(t => {
                  const checked = selectedIds.has(selectedKey(t));
                  return (
                    <label key={selectedKey(t)} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10,
                      background: checked ? "#f1f5f9" : "#fff", cursor: "pointer"
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTeam(t)} />
                      <span style={{ fontWeight: 600, width: 42 }}>{t.teamId}</span>
                      <span style={{ opacity: .9 }}>{t.name}</span>
                    </label>
                  );
                })}
                {!filtered.length && (
                  <div style={{ color: "#64748b" }}>No teams match “{search}”.</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: "#64748b", fontSize: 13, padding: "4px 2px" }}>
              Section hidden — click ▶ to expand.
            </div>
          )}
        </div>

        {/* Settings + selection summary */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Settings</h3>
          <label style={{ display: "block", marginBottom: 8 }}>
            Polling seconds:&nbsp;
            <input
              type="number"
              min={10}
              value={settings.pollingSeconds}
              onChange={e => setLocalSettings({ ...settings, pollingSeconds: Math.max(10, Number(e.target.value) || 30) })}
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={settings.showBar}
              onChange={e => setLocalSettings({ ...settings, showBar: e.target.checked })}
            />
            &nbsp;Show bar
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Compact bar:&nbsp;
            <input
              type="checkbox"
              checked={settings.compact}
              onChange={e => setLocalSettings({ ...settings, compact: e.target.checked })}
            />
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            Theme:&nbsp;
            <select value={settings.theme} onChange={e => setLocalSettings({ ...settings, theme: e.target.value as Settings["theme"] })}>
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <div style={{ marginTop: 12 }}>
            <strong>Following ({selected.length}):</strong>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {selected.map(t => (
                <span key={selectedKey(t)} style={{
                  border: "1px solid #e5e7eb", borderRadius: 9999, padding: "4px 10px", background: "#f8fafc"
                }}>
                  {t.teamId}&nbsp;·&nbsp;{t.name}
                </span>
              ))}
              {!selected.length && <span style={{ color: "#64748b" }}>None yet</span>}
            </div>
          </div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button id="save-btn" onClick={saveAll} disabled={!dirty} style={{ padding: "8px 12px" }}>
          Save
        </button>
        <button
          onClick={() => {
            setSettings({ ...settings, showBar: true }).then(() => {
              chrome.storage.sync.get(["settings"]).then(res => {
                const next = { ...(res.settings ?? {}) };
                delete (next as any).barPos;
                chrome.storage.sync.set({ settings: next });
              });
            });
          }}
          title="Reset bar position to default"
        >
          Reset bar position
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
