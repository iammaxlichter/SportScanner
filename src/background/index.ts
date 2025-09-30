/// <reference types="chrome" />
import { getFollowedTeams, getSettings } from "../lib/storage";
import type { Game, League } from "../lib/types";


let prevByKey = new Map<string, Game>();

function gameKey(g: Game) {
  return `${g.league}:${g.home.teamId}-${g.away.teamId}@${g.startTime}`;
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


// =====================
// Config
// =====================
const PROXY_URL = "https://sportscanner-proxy.semiultra.workers.dev";

// =====================
// State
// =====================
let lastGames: Game[] = [];

// Run on every service-worker load (reload/update)
init().catch(console.error);

// =====================
// Lifecycle
// =====================
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
  if (msg?.type === "GET_SNAPSHOT") {
    sendResponse({ games: lastGames });
    return; // no async
  }
  if (msg?.type === "SETTINGS_UPDATED") {
    (async () => {
      await schedule();
      await pollOnce();
      sendResponse?.({ ok: true });
    })();
    return true; // keep port open for async sendResponse
  }
});

chrome.alarms.onAlarm.addListener(async (a: chrome.alarms.Alarm) => {
  if (a.name === "poll") {
    console.log("[SportScanner] alarm -> pollOnce()");
    await pollOnce();
  }
});

// =====================
// Core
// =====================
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

// =====================
// Fetching from Proxy
// =====================
async function fetchLiveGamesForFollowed(): Promise<Game[]> {
  const followed = await getFollowedTeams();

  // Group teamIds by league for 1 request per league
  const byLeague = new Map<League, string[]>();
  for (const t of followed) {
    const arr = byLeague.get(t.league) ?? [];
    arr.push(t.teamId.toUpperCase());
    byLeague.set(t.league, arr);
  }

  if (byLeague.size === 0) {
    byLeague.set("nfl", ["DAL", "PHI"]);
  }

  // 1) Fetch today's games per league
  const leagueToday = await Promise.all(
    Array.from(byLeague.entries()).map(async ([league, teamIds]) => {
      const url = new URL(PROXY_URL);
      url.searchParams.set("league", league);
      teamIds.forEach((id) => url.searchParams.append("team", id));
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Proxy ${league} today ${res.status}`);
      const data = (await res.json()) as { games: Game[] };
      return { league, teamIds, games: data.games ?? [] };
    })
  );

  // 2) For leagues where we have followed teams, also ask for "next" games
  const leagueNext = await Promise.all(
    leagueToday.map(async ({ league, teamIds }) => {
      const url = new URL(PROXY_URL);
      url.searchParams.set("league", league);
      url.searchParams.set("mode", "next");
      teamIds.forEach((id) => url.searchParams.append("team", id));
      const res = await fetch(url.toString());
      if (!res.ok) return { league, upcoming: [] as Game[] }; // be lenient
      const data = (await res.json()) as { games: Game[] };
      return { league, upcoming: data.games ?? [] };
    })
  );

  // Build a quick index for upcoming by team
  const upcomingByTeam = new Map<string, Game>();
  for (const { upcoming } of leagueNext) {
    for (const g of upcoming) {
      upcomingByTeam.set(g.home.teamId.toUpperCase(), g);
      upcomingByTeam.set(g.away.teamId.toUpperCase(), g);
    }
  }

  const now = Date.now();
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

  const merged: Game[] = [];

  for (const { teamIds, games } of leagueToday) {
    // Track which teamIds are already "covered" by a recent game (live/pre or final within 2 days)
    const covered = new Set<string>();

    // Include today's relevant games that are:
    // - live, or pre, or final but not older than 2 days
    for (const g of games) {
      const isRecentFinal = g.status.phase === "final" ? (now - g.startTime) <= TWO_DAYS : true;

      // If any followed team is in this game and it's recent enough, include it
      const involvesFollowed =
        teamIds.includes(g.home.teamId.toUpperCase()) || teamIds.includes(g.away.teamId.toUpperCase());

      if (involvesFollowed && isRecentFinal) {
        merged.push(g);
        if (teamIds.includes(g.home.teamId.toUpperCase())) covered.add(g.home.teamId.toUpperCase());
        if (teamIds.includes(g.away.teamId.toUpperCase())) covered.add(g.away.teamId.toUpperCase());
      }
    }

    // For teams not covered by a recent game, inject their next scheduled game
    for (const id of teamIds) {
      if (covered.has(id)) continue;
      const nextG = upcomingByTeam.get(id);
      if (nextG) merged.push(nextG);
    }
  }

  // Sort: live -> pre -> final; then by start time asc
  merged.sort((a, b) => {
    const order = (g: Game) => (g.status.phase === "live" ? 0 : g.status.phase === "pre" ? 1 : 2);
    const o = order(a) - order(b);
    return o !== 0 ? o : a.startTime - b.startTime;
  });

  return merged;
}
