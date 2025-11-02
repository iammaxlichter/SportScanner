// src/lib/ids.ts
import type { League } from "./types";

const TO_PROXY: Partial<Record<League, Record<string, string>>> = {
    ncaaf: { TAMU: "TA&M" },
};
const FROM_PROXY: Partial<Record<League, Record<string, string>>> = {
    ncaaf: { "TA&M": "TAMU" },
};

export function toProxyId(league: League, id: string) {
    return TO_PROXY[league]?.[id] ?? id;
}
export function toCanonicalId(league: League, idFromApi: string) {
    return FROM_PROXY[league]?.[idFromApi] ?? idFromApi;
}
export const canonId = (league: League, id: string) =>
    toCanonicalId(league, id).toUpperCase();

export function registerAliases(
    league: League,
    pairs: Record<string, string>
) {
    TO_PROXY[league] ||= {};
    FROM_PROXY[league] ||= {};
    for (const [canonical, proxy] of Object.entries(pairs)) {
        TO_PROXY[league]![canonical] = proxy;
        FROM_PROXY[league]![proxy] = canonical;
    }
}
