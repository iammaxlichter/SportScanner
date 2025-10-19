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
  const baseByLeague: Record<League, string> = {
    nfl: "https://a.espncdn.com/i/teamlogos/nfl/500",
    nba: "https://a.espncdn.com/i/teamlogos/nba/500",
    mlb: "https://a.espncdn.com/i/teamlogos/mlb/500",
    nhl: "https://a.espncdn.com/i/teamlogos/nhl/500",
    ncaaf: "https://a.espncdn.com/i/teamlogos/ncaa/500",
  };
  const base = baseByLeague[league];
  return `${base}/${abbr}.png`;
}

// ---- NEW: helpers & types for filters/sort ----
type StatusFilter = "all" | "followed" | "unfollowed";
type SortBy = "league" | "teamId" | "name";
type SearchScope = "league" | "all";

// ---- NEW: types for games + filter ----
type GameFilter = "none" | "today" | "live";
type Game = {
  league: League;
  homeId: string;          // canonical teamId (e.g., "DAL")
  awayId: string;          // canonical teamId (e.g., "HOU")
  startUtc: string;        // ISO UTC start
  status: "scheduled" | "in_progress" | "final" | "postponed";
};

function isToday(dateIso: string) {
  const d = new Date(dateIso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
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

function InfoBadge({ text }: { text: string }) {
  return (
    <span
      style={{
        position: "absolute",
        top: -6,            // overlap corner
        right: -6,
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "1px solid #94a3b8",
        background: "#f8fafc",
        color: "#334155",
        fontSize: 11,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
      }}
      onMouseEnter={(e) => {
        const tooltip = document.createElement("div");
        tooltip.textContent = text;
        Object.assign(tooltip.style, {
          position: "absolute",
          top: "100%",
          right: 0,
          transform: "translateY(6px)",
          background: "#0f172a",
          color: "#fff",
          fontSize: "12px",
          padding: "6px 8px",
          borderRadius: "6px",
          whiteSpace: "nowrap",
          zIndex: "999",
          pointerEvents: "none",
          boxShadow: "0 6px 16px rgba(15,23,42,.2)",
        });
        tooltip.className = "tooltip";
        e.currentTarget.appendChild(tooltip);
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget.querySelector(".tooltip");
        if (t) t.remove();
      }}
      aria-label={text}
      title={text} // fallback for keyboard users
      role="img"
    >
      i
    </span>
  );
}

type ButtonWithInfoProps = {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  tooltip: string;
  style?: React.CSSProperties;
  disabled?: boolean;
};

function ButtonWithInfo({ children, onClick, tooltip, style, disabled }: ButtonWithInfoProps) {
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button onClick={onClick} style={{ ...chipBtn, ...style }} disabled={disabled}>
        {children}
      </button>
      <InfoBadge text={tooltip} />
    </span>
  );
}

function Options() {
  const ALL_LEAGUES = Object.keys(LEAGUE_TEAMS) as League[];

  const [resetBtnText, setResetBtnText] = useState("Reset bar position");
  const [league, setLeague] = useState<League>("nfl");
  const [search, setSearch] = useState("");

  // NEW: more filters
  const [searchScope, setSearchScope] = useState<SearchScope>("league");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("league");

  // ---- NEW: game filter + games from background ----
  const [gameFilter, setGameFilter] = useState<GameFilter>("none");
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    const v = localStorage.getItem("ss_gameFilter");
    if (v === "today" || v === "live" || v === "none") setGameFilter(v as GameFilter);
  }, []);

  useEffect(() => {
    localStorage.setItem("ss_gameFilter", gameFilter);
  }, [gameFilter]);

  const leaguesInScope: League[] = useMemo(
    () => (searchScope === "all" ? (Object.keys(LEAGUE_TEAMS) as League[]) : [league]),
    [searchScope, league]
  );
  useEffect(() => {
    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "GET_GAMES_FOR_LEAGUES", leagues: leaguesInScope },
      (resp?: { games?: Game[] }) => {
        if (!cancelled && resp?.games) setGames(resp.games);
      }
    );
    return () => { cancelled = true; };
  }, [leaguesInScope]);

  // Local (unsaved) working copies
  const [settings, setLocalSettings] = useState<Settings>({
    pollingSeconds: 30,
    compact: true,
    showBar: true,
    theme: "auto",
  });
  const [selected, setSelected] = useState<FollowedTeam[]>([]);

  // Load initial data
  const init = useAsync(async () => {
    const [sel, s] = await Promise.all([getFollowedTeams(), getSettings()]);
    return { sel, s };
  }, []);
  useEffect(() => {
    if (init.value) {
      setSelected(init.value.sel);
      setLocalSettings(init.value.s);
      if (init.value.sel[0]) setLeague(init.value.sel[0].league);
    }
  }, [init.value]);

  // Build a flat list of all teams once
  const ALL_TEAMS: FollowedTeam[] = useMemo(
    () => (Object.values(LEAGUE_TEAMS) as FollowedTeam[][]).flat(),
    []
  );

  // Selection helpers
  const selectedKey = (t: FollowedTeam) => `${t.league}:${t.teamId}`;
  const selectedIds = useMemo(() => new Set(selected.map(selectedKey)), [selected]);

  const TEAM_INDEX = useMemo(() => {
    const m = new Map<string, FollowedTeam>();
    ALL_TEAMS.forEach(t => m.set(`${t.league}:${t.teamId}`, t));
    return m;
  }, [ALL_TEAMS]);

  const withLogo = (t: FollowedTeam): FollowedTeam => (
    t.logo ? t : { ...t, logo: TEAM_INDEX.get(`${t.league}:${t.teamId}`)?.logo }
  );

  const removeTeam = (t: FollowedTeam) => {
    const key = selectedKey(t);
    setSelected(prev => prev.filter(x => selectedKey(x) !== key));
  };

  const toggleTeam = (t: FollowedTeam) => {
    const key = selectedKey(t);
    const next = selectedIds.has(key)
      ? selected.filter(x => selectedKey(x) !== key)
      : [...selected, withLogo(t)];
    setSelected(next);
  };

  const selectAllVisible = (visibleList: FollowedTeam[]) => {
    const merge = new Map<string, FollowedTeam>();
    for (const t of selected) merge.set(selectedKey(t), withLogo(t));
    for (const t of visibleList) merge.set(selectedKey(t), withLogo(t));
    setSelected(Array.from(merge.values()));
  };

  const clearAllVisible = (visibleList: FollowedTeam[]) => {
    const vis = new Set(visibleList.map(selectedKey));
    setSelected(selected.filter(t => !vis.has(selectedKey(t))));
  };

  // ---- Compute the base pool for the grid ----
  const basePool: FollowedTeam[] = useMemo(() => {
    if (searchScope === "all") return ALL_TEAMS;
    return LEAGUE_TEAMS[league] ?? [];
  }, [searchScope, league, ALL_TEAMS]);

  // ---- Apply search ----
  const filteredBySearch: FollowedTeam[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return basePool;
    return basePool.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.teamId.toLowerCase().includes(q) ||
      `${t.league}`.toLowerCase().includes(q)
    );
  }, [basePool, search]);

  // ---- Apply status filter ----
  const filteredByStatus: FollowedTeam[] = useMemo(() => {
    if (statusFilter === "all") return filteredBySearch;
    const wantFollowed = statusFilter === "followed";
    return filteredBySearch.filter(t => selectedIds.has(selectedKey(t)) === wantFollowed);
  }, [filteredBySearch, statusFilter, selectedIds]);

  // ---- NEW: sets for today/live teams from games ----
  const teamsWithGameToday = useMemo(() => {
    const s = new Set<string>();
    for (const g of games) {
      if (isToday(g.startUtc)) {
        s.add(`${g.league}:${g.homeId}`);
        s.add(`${g.league}:${g.awayId}`);
      }
    }
    return s;
  }, [games]);

  const teamsLiveNow = useMemo(() => {
    const s = new Set<string>();
    for (const g of games) {
      if (g.status === "in_progress") {
        s.add(`${g.league}:${g.homeId}`);
        s.add(`${g.league}:${g.awayId}`);
      }
    }
    return s;
  }, [games]);

  // ---- NEW: Apply game filter after status filter ----
  const filteredByGame: FollowedTeam[] = useMemo(() => {
    if (gameFilter === "none") return filteredByStatus;
    const allow = gameFilter === "live" ? teamsLiveNow : teamsWithGameToday; // "today"
    return filteredByStatus.filter(t => allow.has(`${t.league}:${t.teamId}`));
  }, [filteredByStatus, gameFilter, teamsLiveNow, teamsWithGameToday]);

  // ---- Sort (now sorts filteredByGame) ----
  const sortedVisible: FollowedTeam[] = useMemo(() => {
    const arr = [...filteredByGame];
    arr.sort((a, b) => {
      if (sortBy === "league") {
        if (a.league !== b.league) return a.league.localeCompare(b.league);
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "teamId") return a.teamId.localeCompare(b.teamId);
      return a.name.localeCompare(b.name); // "name"
    });
    return arr;
  }, [filteredByGame, sortBy]);

  // ---- Dirty tracking baselines ----
  const [baselineSel, setBaselineSel] = useState<FollowedTeam[]>([]);
  const [baselineSettings, setBaselineSettings] = useState<Settings>({
    pollingSeconds: 30, compact: true, showBar: true, theme: "auto",
  });

  useEffect(() => {
    if (init.value) {
      const selWithLogos = init.value.sel.map(withLogo);
      setSelected(selWithLogos);
      setLocalSettings(init.value.s);
      setBaselineSel(selWithLogos);
      setBaselineSettings(init.value.s);
      if (selWithLogos[0]) setLeague(selWithLogos[0].league);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init.value, TEAM_INDEX]);

  const dirty =
    JSON.stringify(baselineSel) !== JSON.stringify(selected) ||
    JSON.stringify(baselineSettings) !== JSON.stringify(settings);

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
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #0ea5e9",
              background: dirty ? "#0ea5e9" : "#93c5fd",
              color: "#fff",
              cursor: dirty ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
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
          {/* League + search + filters */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'grid', gap: 10, marginBottom: 8 }}>
              {/* Search scope */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 600 }}>Search scope</label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="scope"
                    value="league"
                    checked={searchScope === "league"}
                    onChange={() => setSearchScope("league")}
                  />
                  Current league
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked={searchScope === "all"}
                    onChange={() => setSearchScope("all")}
                  />
                  All leagues
                </label>
              </div>

              {/* League (only matters when scope = league) */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 20 }}>
                <label style={{ fontWeight: 600, opacity: searchScope === "all" ? 0.5 : 1 }}>League</label>
                <select
                  value={league}
                  onChange={e => { setLeague(e.target.value as League); setSearch(''); }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                  disabled={searchScope === "all"}
                >
                  {ALL_LEAGUES.map(lg => (
                    <option key={lg} value={lg} disabled={!LEAGUE_TEAMS[lg]?.length}>
                      {lg.toUpperCase()}
                    </option>
                  ))}
                </select>

                {/* Search input */}
                <input
                  placeholder={
                    searchScope === "all"
                      ? "Search all leagues by name/ID (e.g. DAL)"
                      : "Search league by name/ID (e.g. DAL)"
                  }
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </div>

              {/* Extra filters */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                alignItems: 'center',
                marginTop: 20
              }}>
                <label style={{ display: 'block' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Follow status</div>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: '100%' }}
                  >
                    <option value="all">All</option>
                    <option value="followed">Followed</option>
                    <option value="unfollowed">Unfollowed</option>
                  </select>
                </label>

                <label style={{ display: 'block' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Sort by</div>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortBy)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: '100%' }}
                  >
                    <option value="league">League, then Name</option>
                    <option value="teamId">Team ID</option>
                    <option value="name">Team Name</option>
                  </select>
                </label>
              </div>

              {/* ---- NEW: GAME FILTER ROW ---- */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
                <label style={{ display: 'block' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Game filter</div>
                  <select
                    value={gameFilter}
                    onChange={e => setGameFilter(e.target.value as GameFilter)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: '100%' }}
                    title="Filter teams by whether they have a game today or are live now"
                  >
                    <option value="none">Show all teams</option>
                    <option value="today">Only teams with a game today</option>
                    <option value="live">Only teams in a live game</option>
                  </select>
                </label>

                <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                  <ButtonWithInfo
                    onClick={() => setGameFilter("today")}
                    tooltip="Show only teams with games scheduled today."
                  >
                    Today
                  </ButtonWithInfo>

                  <ButtonWithInfo
                    onClick={() => setGameFilter("live")}
                    tooltip="Show only teams currently in progress."
                  >
                    Live
                  </ButtonWithInfo>

                  <ButtonWithInfo
                    onClick={() => setGameFilter("none")}
                    tooltip="Clear all game filters."
                  >
                    Clear
                  </ButtonWithInfo>
                </div>

              </div>
              {/* ---- END GAME FILTER ROW ---- */}
            </div>

            {/* Available teams */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0 }}>
                    Teams — {searchScope === "all" ? "All Leagues" : league.toUpperCase()}
                  </h3>
                  <span style={{ color: '#64748b', fontSize: 12 }}>
                    {sortedVisible.length} shown
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <ButtonWithInfo
                    onClick={() => selectAllVisible(sortedVisible)}
                    tooltip="Follow all teams currently visible in this list."
                  >
                    Select all
                  </ButtonWithInfo>

                  <ButtonWithInfo
                    onClick={() => clearAllVisible(sortedVisible)}
                    tooltip="Unfollow all teams currently visible in this list."
                  >
                    Clear all selected
                  </ButtonWithInfo>
                </div>


              </div>

              <div id="teams-panel">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                  {sortedVisible.map(t => {
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
                          src={t.logo ?? logoFor(t.league, t.teamId)}
                          alt={t.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.currentTarget as HTMLImageElement;
                            if (img.dataset.fallback !== "1") {
                              img.dataset.fallback = "1";
                              img.src = logoFor(t.league, t.teamId);
                            } else {
                              img.style.display = "none";
                            }
                          }}
                          style={{ width: 16, height: 16, borderRadius: 9999, objectFit: "cover", background: "#fff" }}
                        />
                        <span style={{ fontWeight: 700, width: 42 }}>{t.teamId}</span>
                        <span style={{ opacity: .9 }}>{t.name}</span>
                        <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 12 }}>
                          {t.league.toUpperCase()}
                        </span>
                      </label>
                    );
                  })}
                  {!sortedVisible.length && (
                    <div style={{ color: '#64748b' }}>
                      {gameFilter === "today"
                        ? "No teams have a game today in this scope."
                        : gameFilter === "live"
                          ? "No teams are currently live in this scope."
                          : `No teams match your filters${search ? ` for “${search}”` : ""}.`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Settings + summary */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Settings</h3>

            {/* Polling */}
            <label style={{ display: 'block', marginBottom: 10, marginTop: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Refresh cadence (minutes)</div>
              <input
                type="number"
                min={1}
                value={Math.max(1, Math.round(settings.pollingSeconds / 60))}
                onChange={e => {
                  const mins = Math.max(1, Number(e.target.value) || 1);
                  setLocalSettings({ ...settings, pollingSeconds: mins * 60 });
                }}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: 140 }}
              />
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                Background updates run at least once per minute (Chrome limit).
              </div>
            </label>

            {/* Compact */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={settings.compact}
                onChange={e => setLocalSettings({ ...settings, compact: e.target.checked })}
              />
              <span>Compact bar</span>
            </label>
            <div style={{ color: '#64748b', fontSize: 10 }}>
              Shrink the bar height and spacing for a tighter fit. (Doesn't display team names, only logos)
            </div>

            {/* Theme */}
            <label style={{ display: 'block', marginBottom: 12, marginTop: 20 }}>
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
              <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                Auto follows your OS appearance.
              </div>
            </label>

            {/* Followed summary */}
            <div style={{ marginTop: 20 }}>
              <strong>Following ({selected.length}):</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {selected.map(t => (
                  <span
                    key={selectedKey(t)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #e5e7eb",
                      borderRadius: 9999,
                      padding: "4px 10px",
                      background: "#f8fafc",
                      color: "#0f172a",
                    }}
                  >
                    <img
                      src={t.logo ?? logoFor(t.league, t.teamId)}
                      alt={t.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (img.dataset.fallback !== "1") {
                          img.dataset.fallback = "1";
                          img.src = logoFor(t.league, t.teamId);
                        } else {
                          img.style.display = "none";
                        }
                      }}
                      style={{ width: 16, height: 16, borderRadius: 9999, objectFit: "cover", background: "#fff" }}
                    />
                    {t.teamId}&nbsp;·&nbsp;{t.name}
                    <button
                      type="button"
                      onClick={() => removeTeam(t)}
                      aria-label={`Unfollow ${t.name}`}
                      title="Remove"
                      style={{
                        marginLeft: 6,
                        width: 18,
                        height: 18,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 9999,
                        border: "1px solid #94a3b8",
                        background: "#fff",
                        color: "#334155",
                        fontSize: 12,
                        lineHeight: 1,
                        padding: 0,
                        cursor: "pointer",
                        appearance: "none",
                        WebkitAppearance: "none",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          removeTeam(t);
                        }
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!selected.length && <span style={{ color: '#64748b' }}>None yet</span>}
              </div>
            </div>

            {/* Reset bar position */}
            <div style={{ marginTop: 16 }}>
              <button
                onClick={async () => {
                  const res = await chrome.storage.sync.get(["settings"]);
                  const next = { ...(res.settings ?? {}) };
                  delete (next as any).barPos;
                  next.showBar = true;

                  await chrome.storage.sync.set({ settings: next });
                  setLocalSettings(prev => ({ ...prev, showBar: true }));

                  chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "reset_bar_pos" });

                  setResetBtnText("Reset ✓");
                  setTimeout(() => setResetBtnText("Reset bar position"), 900);

                }}
                title="Reset bar position to default"
                style={{ ...chipBtn, padding: "8px 12px" }}
              >
                {resetBtnText}
              </button>

            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
