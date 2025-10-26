//src/options/utils/logoFor.ts
import type { League } from "../../lib/types";

export function logoFor(league: League, teamId: string) {
    const abbr = teamId.toLowerCase();
    const baseByLeague: Record<League, string> = {
        nfl: "https://a.espncdn.com/i/teamlogos/nfl/500",
        nba: "https://a.espncdn.com/i/teamlogos/nba/500",
        mlb: "https://a.espncdn.com/i/teamlogos/mlb/500",
        nhl: "https://a.espncdn.com/i/teamlogos/nhl/500",
        ncaaf: "https://a.espncdn.com/i/teamlogos/ncaa/500",
    };
    return `${baseByLeague[league]}/${abbr}.png`;
}
