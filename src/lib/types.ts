// src/lib/types.ts

export type League = "nba" | "nfl" | "mlb" | "nhl" | "ncaaf";

export type Theme = "auto" | "light" | "dark";

export type FollowedTeam = {
  league: League;
  teamId: string;
  name: string;
  logo?: string;
};

export type Settings = {
  pollingSeconds: number;
  showBar: boolean;
  theme: Theme;
  compact: boolean;
  barPos?: { x: number; y: number };
};

export type TeamSide = {
  teamId: string;
  name: string;
  logo?: string;
  score: number;
};

export type Game = {
  league: League;
  home: TeamSide;
  away: TeamSide;
  status: {
    phase: "pre" | "live" | "final";
    clock?: string;
    possession?: "home" | "away" | string;
    down?: number;
    distance?: number;
    yardLine?: string;
    outs?: number;
    onFirst?: boolean;
    onSecond?: boolean;
    onThird?: boolean;
  };
  startTime: number;
};
