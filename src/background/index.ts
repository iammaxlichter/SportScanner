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
  const teams = await getFollowedTeams();
  if (!teams.length) return { games: [] };

  const pairs: [FollowedTeam, FollowedTeam][] = [];
  for (let i = 0; i < teams.length; i += 2) {
    const a = teams[i];
    const b = teams[i + 1] ?? teams[0];
    if (a && b && a.teamId !== b.teamId && a.league === b.league) pairs.push([a, b]);
  }

  const now = Date.now();
  const games: Game[] = pairs.map(([home, away], idx) => ({
    league: home.league,
    home: { teamId: home.teamId, name: home.name, score: Math.floor(Math.random() * 120) },
    away: { teamId: away.teamId, name: away.name, score: Math.floor(Math.random() * 120) },
    status: {
      phase: "live",
      clock: `Q${(idx % 4) + 1} 0${Math.floor(Math.random()*9)}:${Math.floor(Math.random()*59).toString().padStart(2,"0")}`
    },
    startTime: now - 1000 * 60 * 30,
  }));

  return { games };
}
