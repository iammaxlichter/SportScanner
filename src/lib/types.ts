export type League = "nba" | "nfl" | "mlb" | "nhl";

export type FollowedTeam = {
  league: League;
  teamId: string;
  name: string;
  logo?: string; 
};

export type Settings = {
  pollingSeconds: number;
  showBar: boolean;
  theme: "auto" | "light" | "dark";
  compact: boolean;
};

export type TeamSide = { teamId: string; name: string; logo?: string; score: number };

export type Game = {
  league: League;
  home: TeamSide;
  away: TeamSide;
  status: { phase: "pre" | "live" | "final"; clock?: string };
  startTime: number; 
};
