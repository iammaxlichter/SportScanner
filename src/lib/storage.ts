import type { FollowedTeam, Settings } from "./types";

const KEYS = {
  teams: "followedTeams",
  settings: "settings",
} as const;

const DEFAULT_PROXY_URL = "https://sportscanner-proxy.semiultra.workers.dev";

export async function getProxyUrl(): Promise<string> {
  const { proxyUrl } = await chrome.storage.local.get("proxyUrl");
  return proxyUrl || DEFAULT_PROXY_URL;
}

export async function setProxyUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ proxyUrl: url });
}

export async function getFollowedTeams(): Promise<FollowedTeam[]> {
  const res = await chrome.storage.sync.get([KEYS.teams]);
  return (res[KEYS.teams] as FollowedTeam[]) ?? [];
}

export async function setFollowedTeams(teams: FollowedTeam[]) {
  await chrome.storage.sync.set({ [KEYS.teams]: teams });
}

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.sync.get([KEYS.settings]);
  return (res[KEYS.settings] as Settings) ?? {
    pollingSeconds: 30,
    showBar: true,
    theme: "auto",
    compact: true,
  };
}

export async function setSettings(settings: Settings) {
  await chrome.storage.sync.set({ [KEYS.settings]: settings });
}
