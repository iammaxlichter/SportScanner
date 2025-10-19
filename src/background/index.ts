/// <reference types="chrome" />
import { getFollowedTeams, getSettings } from "../lib/storage";
import type { Game, League } from "../lib/types";

/* =====================
   ID NORMALIZATION + ALIASES
   ===================== */
const L = (x: string) => x.toLowerCase();
const T = (x: string) => x.toUpperCase();

// Canonical (your app) -> proxy token
const TEAM_ID_TO_PROXY: Partial<Record<League, Record<string, string>>> = {
  ncaaf: { TAMU: "TA&M" }, // Texas A&M
};

// Proxy token -> Canonical (your app)
const TEAM_ID_FROM_PROXY: Partial<Record<League, Record<string, string>>> = {
  ncaaf: { "TA&M": "TAMU" }, // Texas A&M
};

function toProxyId(league: League, id: string) {
  return TEAM_ID_TO_PROXY[league]?.[id] ?? id;
}
function toCanonicalId(league: League, idFromApi: string) {
  return TEAM_ID_FROM_PROXY[league]?.[idFromApi] ?? idFromApi;
}
const canonId = (league: League, id: string) => T(toCanonicalId(league, id));

/* =====================
   Snapshots + change detection
   ===================== */
let prevByKey = new Map<string, Game>();

function gameKey(g: Game) {
  const lg = L(g.league) as League;
  const home = canonId(lg, g.home.teamId);
  const away = canonId(lg, g.away.teamId);
  return `${lg}:${home}-${away}@${g.startTime}`;
}

function detectMeaningfulChanges(next: Game[]): Game[] {
  const changes: Game[] = [];
  for (const g of next) {
    const k = gameKey(g);
    const p = prevByKey.get(k);
    if (!p) continue;

    const scoreChanged = g.home.score !== p.home.score || g.away.score !== p.away.score;
    const wentLive = p.status.phase !== "live" && g.status.phase === "live";
    const wentFinal = p.status.phase !== "final" && g.status.phase === "final";
    if (scoreChanged || wentLive || wentFinal) changes.push(g);
  }
  // update snapshot
  prevByKey = new Map(next.map(g => [gameKey(g), g]));
  return changes;
}

/* =====================
   Config
   ===================== */
const PROXY_URL = "https://sportscanner-proxy.semiultra.workers.dev";

/* =====================
   State
   ===================== */
let lastGames: Game[] = [];

/* =====================
   Lifecycle
   ===================== */
init().catch(console.error);

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
  console.log("[SportScanner] onInstalled");
  await schedule();
  await pollOnce();
});

chrome.runtime.onStartup?.addListener(async () => {
  console.log("[SportScanner] onStartup");
  await schedule();
  await pollOnce();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 1) Return the raw snapshot you already expose
  if (msg?.type === "GET_SNAPSHOT") {
    sendResponse({ games: lastGames });
    return; // no async
  }

  // 2) NEW: Return simplified games for the Options "game filter"
  // msg: { type: "GET_GAMES_FOR_LEAGUES", leagues: League[] }
  if (msg?.type === "GET_GAMES_FOR_LEAGUES") {
    const leagues: League[] = Array.isArray(msg.leagues) ? msg.leagues : [];

    // Helper: phase -> simplified status
    const phaseToStatus = (phase: string): "scheduled" | "in_progress" | "final" | "postponed" => {
      const p = (phase || "").toLowerCase();
      if (p === "live" || p === "in_progress") return "in_progress";
      if (p === "final") return "final";
      if (p === "postponed") return "postponed";
      return "scheduled";
    };

    (async () => {
      try {
        // NEW: fetch league-wide "today" for requested leagues,
        // instead of using lastGames (which only has *followed* teams).
        const todayAll = leagues.length ? await fetchTodayForLeagues(leagues) : [];

        // Fallback: if fetch failed/empty, at least surface what we have cached
        const pool = todayAll.length ? todayAll : lastGames.filter(g =>
          !leagues.length || leagues.includes(g.league as League)
        );

        const mapped = pool.map(g => {
          const lg = g.league as League;
          return {
            league: lg,
            homeId: canonId(lg, g.home.teamId),
            awayId: canonId(lg, g.away.teamId),
            startUtc: new Date(g.startTime).toISOString(),
            status: phaseToStatus(g.status?.phase),
          };
        });

        sendResponse({ games: mapped });
      } catch (e) {
        console.warn("[SportScanner] GET_GAMES_FOR_LEAGUES error:", e);
        sendResponse({ games: [] });
      }
    })();

    return true; // keep port open for async sendResponse
  }


  if (msg?.type === "SETTINGS_UPDATED") {
    (async () => {
      await schedule();
      await pollOnce();
      sendResponse?.({ ok: true });
    })();
    return true;
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type === "SETTINGS_UPDATED") {
    chrome.tabs.query({}, (tabs) => {
      for (const t of tabs) {
        if (t.id) chrome.tabs.sendMessage(t.id, { type: "REFRESH_BAR", reason: msg.reason });
      }
    });
  }
});

chrome.alarms.onAlarm.addListener(async (a: chrome.alarms.Alarm) => {
  if (a.name === "poll") {
    console.log("[SportScanner] alarm -> pollOnce()");
    await pollOnce();
  }
});

/* =====================
   Core
   ===================== */
async function init() {
  console.log("[SportScanner] service worker loaded");
  await schedule();
  await pollOnce();
}

async function schedule() {
  const settings = await getSettings();
  const periodMin = Math.max(1, settings.pollingSeconds / 60); // clamp to >= 1
  await chrome.alarms.clear("poll");
  chrome.alarms.create("poll", { periodInMinutes: periodMin });
  console.log("[SportScanner] alarm scheduled every", periodMin, "min");
}

async function pollOnce() {
  try {
    const games = await fetchLiveGamesForFollowed();
    lastGames = games;
    if (prevByKey.size === 0) {
      prevByKey = new Map(games.map(g => [gameKey(g), g]));
    } else {
      const updates = detectMeaningfulChanges(games);
      for (const g of updates) {
        const title =
          g.status.phase === "final" ? "Final"
            : g.status.phase === "live" ? "Score update"
              : "Game update";
        const body = `${g.away.name} ${g.away.score} @ ${g.home.name} ${g.home.score}` +
          (g.status.clock ? ` — ${g.status.clock}` : "");
        chrome.notifications.create(
          `ss-${gameKey(g)}-${g.home.score}-${g.away.score}`,
          { type: "basic", iconUrl: "icons/icon128.png", title: `[${g.league.toUpperCase()}] ${title}`, message: body, priority: 1 }
        );
      }
    }

    await chrome.action.setBadgeText({ text: games.length ? String(games.length) : "" }).catch(() => { });

    const live = games.some(g => g.status.phase === "live");
    await chrome.action.setBadgeBackgroundColor({ color: live ? "#eb7272ff" : "#475569" }).catch(() => { });
    await broadcast({ type: "GAMES_UPDATE", games });
  } catch (e) {
    console.error("[SportScanner] pollOnce error", e);
  }
}

async function broadcast(msg: any) {
  // extension pages (popup/options) if open
  chrome.runtime.sendMessage(msg).catch(() => { });
  // tabs with content script; ignore tabs without receiver
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (t) => {
      if (!t.id) return;
      try {
        await chrome.tabs.sendMessage(t.id, msg);
      } catch { }
    })
  );
}

/* =====================
   Fetching from Proxy
   ===================== */
async function fetchLiveGamesForFollowed(): Promise<Game[]> {
  const followed = await getFollowedTeams();

  // Group teamIds by league for 1 request per league
  const byLeague = new Map<League, string[]>();
  for (const t of followed) {
    const key = L(t.league) as League;
    const arr = byLeague.get(key) ?? [];
    arr.push(T(t.teamId)); // store canonical uppercase IDs
    byLeague.set(key, arr);
  }

  if (byLeague.size === 0) {
    byLeague.set("nfl", ["DAL", "PHI"]);
  }

  // 1) Fetch today's games per league (lenient per league)
  const leagueToday = await Promise.all(
    Array.from(byLeague.entries()).map(async ([league, teamIds]) => {
      try {
        const url = new URL(PROXY_URL);
        url.searchParams.set("league", L(league));
        url.searchParams.set("mode", "today");
        teamIds.forEach((id) => url.searchParams.append("team", toProxyId(league, id)));

        const res = await fetch(url.toString());
        if (!res.ok) {
          console.warn(`[SportScanner] Proxy ${league} today non-OK: ${res.status}`);
          return { league, teamIds, games: [] as Game[] };
        }
        const data = (await res.json()) as { games: Game[] };
        return { league, teamIds, games: data.games ?? [] };
      } catch (err) {
        console.warn(`[SportScanner] Proxy ${league} today error:`, err);
        return { league, teamIds, games: [] as Game[] };
      }
    })
  );

  // 2) For leagues where we have followed teams, also ask for "next" games
  const leagueNext = await Promise.all(
    leagueToday.map(async ({ league, teamIds }) => {
      const url = new URL(PROXY_URL);
      url.searchParams.set("league", L(league));
      url.searchParams.set("mode", "next");
      teamIds.forEach((id) => url.searchParams.append("team", toProxyId(league, id)));
      const res = await fetch(url.toString());
      if (!res.ok) return { league, upcoming: [] as Game[] }; // be lenient
      const data = (await res.json()) as { games: Game[] };
      return { league, upcoming: data.games ?? [] };
    })
  );

  // Build a quick index for upcoming by team, keyed by league+team (canonical ids)
  const upcomingByTeam = new Map<string, Game>();
  for (const { upcoming } of leagueNext) {
    for (const g of upcoming) {
      const lg = L(g.league) as League;
      const home = canonId(lg, g.home.teamId);
      const away = canonId(lg, g.away.teamId);
      upcomingByTeam.set(`${lg}:${home}`, g);
      upcomingByTeam.set(`${lg}:${away}`, g);
    }
  }

  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

  const merged: Game[] = [];

  for (const { league, teamIds, games } of leagueToday) {
    const lg = L(league) as League;

    // Track which teamIds have ANY relevant "today" game (for showing "next" fallback)
    const hasRelevantGame = new Set<string>();

    // 1) Include ALL relevant games for followed teams (live, pre, or finals within window)
    for (const g of games) {
      const home = canonId(lg, g.home.teamId);
      const away = canonId(lg, g.away.teamId);

      const isRecentFinal = g.status.phase === "final" ? (now - g.startTime) <= TWO_DAYS : true;
      const involvesFollowed = teamIds.includes(home) || teamIds.includes(away);

      if (involvesFollowed && isRecentFinal) {
        merged.push(g);
        if (teamIds.includes(home)) hasRelevantGame.add(home);
        if (teamIds.includes(away)) hasRelevantGame.add(away);
      }
    }

    // 2) For teams without any relevant "today" game, inject their next scheduled game
    for (const id of teamIds) {
      if (hasRelevantGame.has(id)) continue;
      const nextG = upcomingByTeam.get(`${lg}:${id}`);
      if (nextG) merged.push(nextG);
    }
  }

  // Dedupe by league + matchup + start (using normalized key)
  const uniq = new Map<string, Game>();
  for (const g of merged) {
    uniq.set(gameKey(g), g);
  }
  const result = Array.from(uniq.values());

  // Sort: live -> pre -> final; then by start time asc
  result.sort((a, b) => {
    const order = (g: Game) => (g.status.phase === "live" ? 0 : g.status.phase === "pre" ? 1 : 2);
    const o = order(a) - order(b);
    return o !== 0 ? o : a.startTime - b.startTime;
  });

  console.debug(
    "[SportScanner] merged",
    result.map(g => `${g.league.toUpperCase()} ${canonId(L(g.league) as League, g.away.teamId)}@${canonId(L(g.league) as League, g.home.teamId)} ${new Date(g.startTime).toLocaleString()}`)
  );

  return result;
}

async function fetchTodayForLeagues(leagues: League[]): Promise<Game[]> {
  const all: Game[] = [];

  for (const league of leagues) {
    try {
      const url = new URL(PROXY_URL);
      url.searchParams.set("league", league.toLowerCase());
      url.searchParams.set("mode", "today");
      // IMPORTANT: no 'team' params here -> proxy should return all of today's games for the league

      const res = await fetch(url.toString());
      if (!res.ok) {
        console.warn(`[SportScanner] Proxy ${league} today(all) non-OK: ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { games: Game[] };
      if (!data?.games?.length) continue;

      // Normalize to canonical IDs for consistency with LEAGUE_TEAMS
      for (const g of data.games) {
        const lg = league as League;
        // mutate copies so we don't change cached objects elsewhere
        const home = { ...g.home, teamId: canonId(lg, g.home.teamId) };
        const away = { ...g.away, teamId: canonId(lg, g.away.teamId) };
        all.push({ ...g, league: lg, home, away });
      }
    } catch (err) {
      console.warn(`[SportScanner] Proxy ${league} today(all) error:`, err);
    }
  }

  // Dedupe by your normalized key, then return
  const uniq = new Map<string, Game>();
  for (const g of all) uniq.set(gameKey(g), g);
  return Array.from(uniq.values());
}
