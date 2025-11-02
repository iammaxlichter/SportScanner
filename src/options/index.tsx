//src/options/index.tsx
import { createRoot } from "react-dom/client";
import React, { useEffect, useMemo, useState } from "react";
import type { FollowedTeam, League, Settings } from "../lib/types";
import { getFollowedTeams, setFollowedTeams, getSettings, setSettings } from "../lib/storage";
import { LEAGUE_TEAMS } from "../lib/teams";
import { useAsync } from "./hooks/useAsync";
import { TeamGrid } from "./components/TeamGrid";
import { SettingsPanel } from "./components/SettingsPanel";

const chipBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
};

type StatusFilter = "all" | "followed" | "unfollowed";
type SortBy = "league" | "teamId" | "name";
type SearchScope = "league" | "all";
type GameFilter = "none" | "today" | "live";

type Game = {
  league: League;
  homeId: string;
  awayId: string;
  startUtc: string;
  status: "scheduled" | "in_progress" | "final" | "postponed";
};

function isToday(dateIso: string) {
  const d = new Date(dateIso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function Options() {
  const ALL_LEAGUES = Object.keys(LEAGUE_TEAMS) as League[];

  const [league, setLeague] = useState<League>("nfl");
  const [search, setSearch] = useState("");
  const [searchScope, setSearchScope] = useState<SearchScope>("league");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("league");
  const [gameFilter, setGameFilter] = useState<GameFilter>("none");
  const [games, setGames] = useState<Game[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem("ss_gameFilter");
    if (v === "today" || v === "live" || v === "none") setGameFilter(v as GameFilter);
  }, []);
  useEffect(() => { localStorage.setItem("ss_gameFilter", gameFilter); }, [gameFilter]);

  const leaguesInScope: League[] = useMemo(
    () => (searchScope === "all" ? (Object.keys(LEAGUE_TEAMS) as League[]) : [league]),
    [searchScope, league]
  );

  useEffect(() => {
    let cancelled = false;
    try {
      chrome.runtime.sendMessage(
        { type: "GET_GAMES_FOR_LEAGUES", leagues: leaguesInScope },
        (resp?: { games?: Game[] }) => {
          if (!cancelled && resp?.games) setGames(resp.games);
        }
      );
    } catch { }
    return () => { cancelled = true; };
  }, [leaguesInScope]);

  // working copies
  const [settings, setLocalSettings] = useState<Settings>({ pollingSeconds: 30, compact: true, showBar: true, theme: "auto" });
  const [selected, setSelected] = useState<FollowedTeam[]>([]);

  // init
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

  const ALL_TEAMS: FollowedTeam[] = useMemo(() => (Object.values(LEAGUE_TEAMS) as FollowedTeam[][]).flat(), []);
  const selectedKey = (t: FollowedTeam) => `${t.league}:${t.teamId}`;
  const selectedIds = useMemo(() => new Set(selected.map(selectedKey)), [selected]);

  const TEAM_INDEX = useMemo(() => {
    const m = new Map<string, FollowedTeam>();
    ALL_TEAMS.forEach(t => m.set(`${t.league}:${t.teamId}`, t));
    return m;
  }, [ALL_TEAMS]);
  const withLogo = (t: FollowedTeam): FollowedTeam => (t.logo ? t : { ...t, logo: TEAM_INDEX.get(`${t.league}:${t.teamId}`)?.logo });

  const removeTeam = (t: FollowedTeam) => setSelected(prev => prev.filter(x => selectedKey(x) !== selectedKey(t)));
  const toggleTeam = (t: FollowedTeam) => {
    const key = selectedKey(t);
    setSelected(prev => prev.some(x => selectedKey(x) === key) ? prev.filter(x => selectedKey(x) !== key) : [...prev, withLogo(t)]);
  };
  const selectAllVisible = (visible: FollowedTeam[]) => {
    const merge = new Map<string, FollowedTeam>();
    for (const t of selected) merge.set(selectedKey(t), withLogo(t));
    for (const t of visible) merge.set(selectedKey(t), withLogo(t));
    setSelected(Array.from(merge.values()));
  };
  const clearAllVisible = (visible: FollowedTeam[]) => {
    const vis = new Set(visible.map(selectedKey));
    setSelected(selected.filter(t => !vis.has(selectedKey(t))));
  };

  const basePool = useMemo(() => (searchScope === "all" ? ALL_TEAMS : (LEAGUE_TEAMS[league] ?? [])), [searchScope, league, ALL_TEAMS]);

  const filteredBySearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return basePool;
    return basePool.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.teamId.toLowerCase().includes(q) ||
      `${t.league}`.toLowerCase().includes(q)
    );
  }, [basePool, search]);

  const filteredByStatus = useMemo(() => {
    if (statusFilter === "all") return filteredBySearch;
    const wantFollowed = statusFilter === "followed";
    return filteredBySearch.filter(t => selectedIds.has(selectedKey(t)) === wantFollowed);
  }, [filteredBySearch, statusFilter, selectedIds]);

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

  const filteredByGame = useMemo(() => {
    if (gameFilter === "none") return filteredByStatus;
    const allow = gameFilter === "live" ? teamsLiveNow : teamsWithGameToday;
    return filteredByStatus.filter(t => allow.has(`${t.league}:${t.teamId}`));
  }, [filteredByStatus, gameFilter, teamsLiveNow, teamsWithGameToday]);

  const sortedVisible = useMemo(() => {
    const arr = [...filteredByGame];
    arr.sort((a, b) => {
      if (sortBy === "league") {
        if (a.league !== b.league) return a.league.localeCompare(b.league);
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "teamId") return a.teamId.localeCompare(b.teamId);
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [filteredByGame, sortBy]);

  const [baselineSel, setBaselineSel] = useState<FollowedTeam[]>([]);
  const [baselineSettings, setBaselineSettings] = useState<Settings>({ pollingSeconds: 30, compact: true, showBar: true, theme: "auto" });

  useEffect(() => {
    if (init.value) {
      const selWithLogos = init.value.sel.map(withLogo);
      setSelected(selWithLogos);
      setLocalSettings(init.value.s);
      setBaselineSel(selWithLogos);
      setBaselineSettings(init.value.s);
      if (selWithLogos[0]) setLeague(selWithLogos[0].league);
    }
  }, [init.value, TEAM_INDEX]);

  const dirty =
    JSON.stringify(baselineSel) !== JSON.stringify(selected) ||
    JSON.stringify(baselineSettings) !== JSON.stringify(settings);

  const saveAll = async () => {
    await setFollowedTeams(selected);
    await setSettings(settings);
    setBaselineSel(selected);
    setBaselineSettings(settings);
    chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" }).catch(() => { });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 900);
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', color: '#0f172a' }}>
      {/* header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#ffffffcc', backdropFilter: 'saturate(180%) blur(8px)', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <img src="../assets/icons/icon48.png" alt="SportScanner logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
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
            {justSaved ? "Updated ✓" : "Update Bar"}
          </button>
          <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(1px,1px,1px,1px)" }}>
            {justSaved ? "Settings updated" : ""}
          </div>
        </div>
      </div>

      {/* main */}
      <div style={{ maxWidth: 980, margin: '16px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* left: find/select teams */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            {/* scope + league + search */}
            <div style={{ display: 'grid', gap: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 600 }}>Search scope</label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="radio" name="scope" value="league" checked={searchScope === "league"} onChange={() => setSearchScope("league")} />
                  Current league
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="radio" name="scope" value="all" checked={searchScope === "all"} onChange={() => setSearchScope("all")} />
                  All leagues
                </label>
              </div>

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

                <input
                  placeholder={searchScope === "all" ? "Search all leagues by name/ID (e.g. DAL)" : "Search league by name/ID (e.g. DAL)"}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </div>

              {/* simple filters row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center', marginTop: 20 }}>
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

              {/* game filter row */}
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
                  <button onClick={() => setGameFilter("today")} style={chipBtn} title="Show only teams with games scheduled today.">Today</button>
                  <button onClick={() => setGameFilter("live")} style={chipBtn} title="Show only teams currently in progress.">Live</button>
                  <button onClick={() => setGameFilter("none")} style={chipBtn} title="Clear all game filters.">Clear</button>
                </div>
              </div>
            </div>

            {/* teams grid */}
            <TeamGrid
              leagueLabel={searchScope === "all" ? "All Leagues" : league.toUpperCase()}
              sortedVisible={sortedVisible}
              selectedKey={selectedKey}
              selectedIds={selectedIds}
              toggleTeam={toggleTeam}
              selectAllVisible={selectAllVisible}
              clearAllVisible={clearAllVisible}
              gameFilter={gameFilter}
              search={search}
            />
          </div>

          {/* right: settings + chips + reset */}
          <SettingsPanel
            settings={settings}
            setSettings={setLocalSettings}
            selected={selected}
            removeTeam={removeTeam}
            onResetBarPos={async () => {
              const res = await chrome.storage.sync.get(["settings"]);
              const prev = res.settings ?? {};
              const next = { ...prev };
              delete (next as any).barPos;
              await chrome.storage.sync.set({ settings: next });
              chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "reset_bar_pos" }).catch(() => { });
            }}
            onClearAllSelected={() => setSelected([])}
          />
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
