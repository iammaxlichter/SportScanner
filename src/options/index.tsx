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

function logoFor(league: League, teamId: string) {
  const abbr = teamId.toLowerCase();
  // ESPN CDN paths are fairly consistent across major leagues:
  const baseByLeague: Record<League, string> = {
    nfl: "https://a.espncdn.com/i/teamlogos/nfl/500",
    nba: "https://a.espncdn.com/i/teamlogos/nba/500",
    mlb: "https://a.espncdn.com/i/teamlogos/mlb/500",
    nhl: "https://a.espncdn.com/i/teamlogos/nhl/500",
  };
  const base = baseByLeague[league] || baseByLeague.nfl;
  return `${base}/${abbr}.png`;
}


function Options() {
  const ALL_LEAGUES = Object.keys(LEAGUE_TEAMS) as League[];
  const [league, setLeague] = useState<League>("nfl"); // default to NFL since that's live
  const [search, setSearch] = useState("");

  // Local (unsaved) working copies
  const [settings, setLocalSettings] = useState<Settings>({
    pollingSeconds: 30,
    compact: true,
    // removed showBar & theme from UI, but we keep them in storage shape
    showBar: true,
    theme: "auto",
  });
  const [selected, setSelected] = useState<FollowedTeam[]>([]);

  // Collapsed per league (for large lists)
  const [collapsed, setCollapsed] = useState<Record<League, boolean>>(
    ALL_LEAGUES.reduce((acc, lg) => { acc[lg] = false; return acc; }, {} as Record<League, boolean>)
  );
  const toggleCollapsed = (lg: League) => setCollapsed(c => ({ ...c, [lg]: !c[lg] }));

  // Load initial data
  const init = useAsync(async () => {
    const [sel, s] = await Promise.all([getFollowedTeams(), getSettings()]);
    return { sel, s };
  }, []);
  useEffect(() => {
    if (init.value) {
      setSelected(init.value.sel);
      setLocalSettings(init.value.s);
      // auto-switch league to the first followed league if any
      if (init.value.sel[0]) setLeague(init.value.sel[0].league);
    }
  }, [init.value]);

  // Derive lists
  const available: FollowedTeam[] = useMemo(() => LEAGUE_TEAMS[league] ?? [], [league]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(t =>
      t.name.toLowerCase().includes(q) || t.teamId.toLowerCase().includes(q)
    );
  }, [available, search]);

  // Selection helpers
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

  // NEW: baselines we compare against
  const [baselineSel, setBaselineSel] = useState<FollowedTeam[]>([]);
  const [baselineSettings, setBaselineSettings] = useState<Settings>({
    pollingSeconds: 30, compact: true, showBar: true, theme: "auto",
  });

  // when init loads, set baselines and working copies
  useEffect(() => {
    if (init.value) {
      setSelected(init.value.sel);
      setLocalSettings(init.value.s);
      setBaselineSel(init.value.sel);
      setBaselineSettings(init.value.s);
      if (init.value.sel[0]) setLeague(init.value.sel[0].league);
    }
  }, [init.value]);

  // compute dirty vs baselines (not init.value)
  const dirty =
    JSON.stringify(baselineSel) !== JSON.stringify(selected) ||
    JSON.stringify(baselineSettings) !== JSON.stringify(settings);

  // on save, write to storage AND update baselines so dirty becomes false
  const saveAll = async () => {
    await setFollowedTeams(selected);
    await setSettings(settings);
    setBaselineSel(selected);
    setBaselineSettings(settings);
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    const btn = document.getElementById("save-btn");
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = "Updated ✓";
      setTimeout(() => (btn.textContent = orig || "Update Bar"), 900);
    }
  };


  // UI
  const isCollapsed = collapsed[league];
  const pollingMinutes = Math.max(1, Math.round(settings.pollingSeconds / 60));

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
        color: '#0f172a',
      }}
    >
      {/* Sticky header with Update Bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#ffffffcc',
          backdropFilter: 'saturate(180%) blur(8px)',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 18 }}>SportScanner — Options</h1>
            {dirty && <span style={{ fontSize: 12, color: '#0ea5e9' }}>Unsaved changes</span>}
          </div>
          <button
            id="save-btn"
            onClick={saveAll}
            disabled={!dirty}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid #0ea5e9',
              background: dirty ? '#0ea5e9' : '#93c5fd',
              color: '#fff',
              cursor: dirty ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
            title={dirty ? 'Apply changes to the bar' : 'No changes to apply'}
          >
            Update Bar
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 980, margin: '16px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
        {/* Controls row */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          {/* League + search */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontWeight: 600 }}>League</label>
              <select
                value={league}
                onChange={e => { setLeague(e.target.value as League); setSearch(''); }}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
              >
                {ALL_LEAGUES.map(lg => (
                  <option key={lg} value={lg} disabled={!LEAGUE_TEAMS[lg]?.length}>
                    {lg.toUpperCase()}
                  </option>
                ))}
              </select>
              <input
                placeholder="Search by team name or ID (e.g. DAL)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            </div>

            {/* Available teams (collapsible) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    aria-expanded={!isCollapsed}
                    aria-controls="teams-panel"
                    onClick={() => toggleCollapsed(league)}
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb',
                      background: '#fff', cursor: 'pointer', lineHeight: '1', fontSize: 14
                    }}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                  <h3 style={{ margin: 0 }}>Teams — {league.toUpperCase()}</h3>
                  <span style={{ color: '#64748b', fontSize: 12 }}>
                    {available.length} total{search ? ` · ${filtered.length} shown` : ''}
                  </span>
                </div>

                {!isCollapsed && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={selectAllVisible} style={chipBtn}>Select all (filtered)</button>
                    <button onClick={clearAllVisible} style={chipBtn}>Clear filtered</button>
                  </div>
                )}
              </div>

              {!isCollapsed ? (
                <div id="teams-panel">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                    {filtered.map(t => {
                      const checked = selectedIds.has(selectedKey(t));
                      return (
                        <label
                          key={selectedKey(t)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10,
                            background: checked ? "#f1f5f9" : "#fff", cursor: "pointer"
                          }}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleTeam(t)} />
                          <img
                            src={logoFor(t.league, t.teamId)}
                            alt={t.name}
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            style={{ width: 20, height: 20, borderRadius: 9999, objectFit: "cover", background: "#ffffffff" }}
                          />
                          <span style={{ fontWeight: 700, width: 42 }}>{t.teamId}</span>
                          <span style={{ opacity: .9 }}>{t.name}</span>
                        </label>
                      );
                    })}
                    {!filtered.length && (
                      <div style={{ color: '#64748b' }}>No teams match “{search}”.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ color: '#64748b', fontSize: 13, padding: '4px 2px' }}>
                  Section hidden — click ▶ to expand.
                </div>
              )}
            </div>
          </div>

          {/* Settings + summary */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Settings</h3>

            {/* Polling */}
            <label style={{ display: 'block', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Refresh cadence (minutes)</div>
              <input
                type="number"
                min={1}
                value={pollingMinutes}
                onChange={e => {
                  const mins = Math.max(1, Number(e.target.value) || 1);
                  setLocalSettings({ ...settings, pollingSeconds: mins * 60 });
                }}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: 140 }}
              />
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                Background updates run at least once per minute (Chrome limit).
              </div>
            </label>

            {/* Compact */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={settings.compact}
                onChange={e => setLocalSettings({ ...settings, compact: e.target.checked })}
              />
              <span>Compact bar</span>
            </label>

            {/* Theme */}
            <label style={{ display: 'block', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Theme</div>
              <select
                value={settings.theme ?? "auto"}
                onChange={e => setLocalSettings({ ...settings, theme: e.target.value as any })}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: 180 }}
              >
                <option value="auto">Auto (system)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                Auto follows your OS appearance.
              </div>
            </label>
            
            {/* Followed summary */}
            <div style={{ marginTop: 12 }}>
              <strong>Following ({selected.length}):</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {selected.map(t => (
                  <span
                    key={selectedKey(t)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      border: "1px solid #e5e7eb",
                      borderRadius: 9999,
                      padding: "4px 10px",
                      background: "#f8fafc"
                    }}
                  >
                    <img
                      src={logoFor(t.league, t.teamId)}
                      alt={t.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      style={{ width: 16, height: 16, borderRadius: 9999, objectFit: "cover", background: "#ffffffff" }}
                    />
                    {t.teamId}&nbsp;·&nbsp;{t.name}
                  </span>

                ))}
                {!selected.length && <span style={{ color: '#64748b' }}>None yet</span>}
              </div>
            </div>

            {/* Reset bar position */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => {
                  // ensure bar is shown, then nuke saved position
                  setSettings({ ...settings, showBar: true }).then(() => {
                    chrome.storage.sync.get(['settings']).then(res => {
                      const next = { ...(res.settings ?? {}) };
                      delete (next as any).barPos;
                      chrome.storage.sync.set({ settings: next });
                    });
                  });
                }}
                title="Reset bar position to default"
                style={{ ...chipBtn, padding: '8px 12px' }}
              >
                Reset bar position
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// small shared button style
const chipBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
};

createRoot(document.getElementById("root")!).render(<Options />);
