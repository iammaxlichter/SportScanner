// src/background/messaging.ts
/// <reference types="chrome" />
import type { Game, League } from "../lib/types";
import { canonId } from "../lib/ids";
import { fetchTodayForLeagues } from "../lib/api";

type GetSnapshot = () => Game[];
type OnSettingsUpdated = () => Promise<void>;

export function initMessaging(opts: {
    getSnapshot: GetSnapshot;
    onSettingsUpdated: OnSettingsUpdated;
    setBadgeText: (text: string) => void;
    broadcastRefresh: (reason?: string) => Promise<void>;
}) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type === "BADGE_COUNT") {
            const text = typeof msg.count === "string" ? msg.count : "";
            opts.setBadgeText(text);
            return;
        }

        if (msg?.type === "GET_SNAPSHOT") {
            sendResponse({ games: opts.getSnapshot() });
            return;
        }

        if (msg?.type === "GET_GAMES_FOR_LEAGUES") {
            const leagues: League[] = Array.isArray(msg.leagues) ? msg.leagues : [];

            const phaseToStatus = (phase: string): "scheduled" | "in_progress" | "final" | "postponed" => {
                const p = (phase || "").toLowerCase();
                if (p === "live" || p === "in_progress") return "in_progress";
                if (p === "final") return "final";
                if (p === "postponed") return "postponed";
                return "scheduled";
            };

            (async () => {
                try {
                    const todayAll = leagues.length ? await fetchTodayForLeagues(leagues) : [];
                    const mapped = todayAll.map(g => {
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

            return true;
        }

        if (msg?.type === "SETTINGS_UPDATED") {
            (async () => {
                await opts.onSettingsUpdated();
                sendResponse?.({ ok: true });
            })();
            return true;
        }
    });

    chrome.runtime.onMessage.addListener((msg, _sender, _sr) => {
        if (msg?.type === "SETTINGS_UPDATED") {
            opts.broadcastRefresh(msg.reason);
        }
    });
}
