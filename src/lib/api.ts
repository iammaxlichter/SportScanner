// src/lib/api.ts
import type { Game, League } from "./types";
import { getFollowedTeams } from "./storage";
import { canonId, toProxyId } from "./ids";

const PROXY_URL = "https://sportscanner-proxy.semiultra.workers.dev";

const l = (s: string) => s.toLowerCase();
const u = (s: string) => s.toUpperCase();

export function gameKey(g: Game) {
    const lg = l(g.league) as League;
    const home = canonId(lg, g.home.teamId);
    const away = canonId(lg, g.away.teamId);
    return `${lg}:${home}-${away}@${g.startTime}`;
}

export async function fetchLiveGamesForFollowed(): Promise<Game[]> {
    const followed = await getFollowedTeams();

    const byLeague = new Map<League, string[]>();
    for (const t of followed) {
        const key = l(t.league) as League;
        const arr = byLeague.get(key) ?? [];
        arr.push(u(t.teamId));
        byLeague.set(key, arr);
    }

    if (byLeague.size === 0) {
        byLeague.set("nfl" as League, ["DAL", "PHI"]);
    }

    const leagueToday = await Promise.all(
        Array.from(byLeague.entries()).map(async ([league, teamIds]) => {
            try {
                const url = new URL(PROXY_URL);
                url.searchParams.set("league", l(league));
                url.searchParams.set("mode", "today");
                teamIds.forEach((id) => url.searchParams.append("team", toProxyId(league, id)));
                const res = await fetch(url.toString());
                if (!res.ok) return { league, teamIds, games: [] as Game[] };
                const data = (await res.json()) as { games: Game[] };
                return { league, teamIds, games: data.games ?? [] };
            } catch {
                return { league, teamIds, games: [] as Game[] };
            }
        })
    );

    const leagueNext = await Promise.all(
        leagueToday.map(async ({ league, teamIds }) => {
            try {
                const url = new URL(PROXY_URL);
                url.searchParams.set("league", l(league));
                url.searchParams.set("mode", "next");
                teamIds.forEach((id) => url.searchParams.append("team", toProxyId(league, id)));
                const res = await fetch(url.toString());
                if (!res.ok) return { league, upcoming: [] as Game[] };
                const data = (await res.json()) as { games: Game[] };
                return { league, upcoming: data.games ?? [] };
            } catch {
                return { league, upcoming: [] as Game[] };
            }
        })
    );

    const upcomingByTeam = new Map<string, Game>();
    for (const { upcoming } of leagueNext) {
        for (const g of upcoming) {
            const lg = l(g.league) as League;
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
        const lg = l(league) as League;
        const hasRelevantGame = new Set<string>();

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

        for (const id of teamIds) {
            if (hasRelevantGame.has(id)) continue;
            const nextG = upcomingByTeam.get(`${lg}:${id}`);
            if (nextG) merged.push(nextG);
        }
    }

    const uniq = new Map<string, Game>();
    for (const g of merged) uniq.set(gameKey(g), g);
    const result = Array.from(uniq.values());

    result.sort((a, b) => {
        const order = (g: Game) => (g.status.phase === "live" ? 0 : g.status.phase === "pre" ? 1 : 2);
        const o = order(a) - order(b);
        return o !== 0 ? o : a.startTime - b.startTime;
    });

    return result;
}

export async function fetchTodayForLeagues(leagues: League[]): Promise<Game[]> {
    const all: Game[] = [];
    for (const league of leagues) {
        try {
            const url = new URL(PROXY_URL);
            url.searchParams.set("league", league.toLowerCase());
            url.searchParams.set("mode", "today");

            const res = await fetch(url.toString());
            if (!res.ok) continue;
            const data = (await res.json()) as { games: Game[] };
            if (!data?.games?.length) continue;

            for (const g of data.games) {
                const lg = league as League;
                const home = { ...g.home, teamId: canonId(lg, g.home.teamId) };
                const away = { ...g.away, teamId: canonId(lg, g.away.teamId) };
                all.push({ ...g, league: lg, home, away });
            }
        } catch {

        }
    }
    const uniq = new Map<string, Game>();
    for (const g of all) uniq.set(gameKey(g), g);
    return Array.from(uniq.values());
}
