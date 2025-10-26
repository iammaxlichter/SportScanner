// src/background/index.ts
/// <reference types="chrome" />
import type { Game } from "../lib/types";
import { gameKey, fetchLiveGamesForFollowed } from "../lib/api";
import { initAlarms, rescheduleAlarms } from "./alarms";
import { initMessaging } from "./messaging";

// ------------ State ------------
let lastGames: Game[] = [];
let prevByKey = new Map<string, Game>();

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
  prevByKey = new Map(next.map(g => [gameKey(g), g]));
  return changes;
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

    const live = games.some(g => g.status.phase === "live");
    await chrome.action.setBadgeBackgroundColor({ color: live ? "#eb7272ff" : "#475569" }).catch(() => { });
    await broadcast({ type: "GAMES_UPDATE", games });
  } catch (e) {
    console.error("[SportScanner] pollOnce error", e);
  }
}

function getSnapshot() {
  return lastGames;
}

function setBadgeText(text: string) {
  chrome.action.setBadgeText({ text }).catch?.(() => { });
}

async function broadcast(msg: any) {
  chrome.runtime.sendMessage(msg).catch(() => { });
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (t) => {
      if (!t.id) return;
      try { await chrome.tabs.sendMessage(t.id, msg); } catch { }
    })
  );
}

async function broadcastRefresh(reason?: string) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id) {
      try { await chrome.tabs.sendMessage(t.id, { type: "REFRESH_BAR", reason }); } catch { }
    }
  }
}

async function init() {
  console.log("[SportScanner] service worker loaded");
  initAlarms(pollOnce);

  initMessaging({
    getSnapshot,
    onSettingsUpdated: async () => {
      await rescheduleAlarms();
      await pollOnce();
    },
    setBadgeText,
    broadcastRefresh,
  });

  await rescheduleAlarms();
  await pollOnce();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
  console.log("[SportScanner] onInstalled");
  await rescheduleAlarms();
  await pollOnce();
});

chrome.runtime.onStartup?.addListener(async () => {
  console.log("[SportScanner] onStartup");
  await rescheduleAlarms();
  await pollOnce();
});

// Kick off
init().catch(console.error);