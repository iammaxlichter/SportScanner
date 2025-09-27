/// <reference types="chrome" />
import { getFollowedTeams, getSettings } from "../lib/storage";
import type { FollowedTeam, Game } from "../lib/types";

// Run on every service-worker load (reload/update)
init().catch(console.error);
let lastGames: Game[] = [];

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
    return true; 
  }
});

chrome.alarms.onAlarm.addListener(async (a: chrome.alarms.Alarm) => {
  if (a.name === "poll") {
    console.log("[SportScanner] alarm -> pollOnce()");
    await pollOnce();
  }
});

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
  const { games } = await generateMockGamesForFollowed();
  lastGames = games; // cache snapshot
  await chrome.action.setBadgeText({ text: games.length ? String(games.length) : "" }).catch(()=>{});
  await broadcast({ type: "GAMES_UPDATE", games });
}

async function broadcast(msg: any) {
  // extension pages (popup/options) if open
  chrome.runtime.sendMessage(msg).catch(() => {});
  // tabs with content script; ignore tabs without receiver
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (t) => {
      if (!t.id) return;
      try { await chrome.tabs.sendMessage(t.id, msg); } catch {}
    })
  );
}

async function generateMockGamesForFollowed(): Promise<{ games: Game[] }> {
  const followed = await getFollowedTeams();
  if (!followed.length) return { games: [] };

  // Group by league
  const byLeague = new Map<string, FollowedTeam[]>();
  for (const t of followed) {
    const arr = byLeague.get(t.league) ?? [];
    arr.push(t);
    byLeague.set(t.league, arr);
  }

  const now = Date.now();
  const games: Game[] = [];

  for (const teams of byLeague.values()) {
    if (teams.length === 1) {
      // With one team, just fabricate an opponent label in same league
      const a = teams[0];
      games.push({
        league: a.league,
        home: { teamId: a.teamId, name: a.name, score: randScore(70, 120) },
        away: { teamId: "XXX", name: "Opponent", score: randScore(70, 120) },
        status: { phase: "live", clock: randomClock() },
        startTime: now - 1000 * 60 * 30,
      } as Game);
      continue;
    }

    // Round-robin pairs within the league
    // Example: [A,B,C,D,E] -> (A vs B), (C vs D), (E vs A)
    for (let i = 0; i < teams.length; i += 2) {
      const home = teams[i];
      const away = teams[(i + 1) % teams.length]; // wrap to keep same league
      if (!home || !away) continue;

      games.push({
        league: home.league,
        home: { teamId: home.teamId, name: home.name, score: randScore(70, 120) },
        away: { teamId: away.teamId, name: away.name, score: randScore(70, 120) },
        status: { phase: "live", clock: randomClock() },
        startTime: now - 1000 * 60 * 30,
      } as Game);
    }
  }

  // Optional: shuffle to mix leagues visually
  games.sort(() => Math.random() - 0.5);

  return { games };
}

// helpers
function randScore(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomClock() {
  const q = Math.floor(Math.random() * 4) + 1;
  const m = Math.floor(Math.random() * 10);
  const s = Math.floor(Math.random() * 60).toString().padStart(2, "0");
  return `Q${q} 0${m}:${s}`;
}
