// src/lib/storage.ts
/// <reference types="chrome" />
import type { FollowedTeam, Settings } from "./types";

const KEYS = {
  teams: "followedTeams",
  settings: "settings",
} as const;

const DEFAULTS: Settings = {
  pollingSeconds: 30,
  showBar: true,
  theme: "auto",
  compact: true,
};

const DEFAULT_PROXY_URL = "https://sportscanner-proxy.semiultra.workers.dev";

export async function getProxyUrl(): Promise<string> {
  const { proxyUrl } = await chrome.storage.local.get("proxyUrl");
  return (typeof proxyUrl === "string" && proxyUrl.length > 0) ? proxyUrl : DEFAULT_PROXY_URL;
}

export async function setProxyUrl(url: string): Promise<void> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad scheme");
    await chrome.storage.local.set({ proxyUrl: u.toString() });
  } catch {
    await chrome.storage.local.set({ proxyUrl: DEFAULT_PROXY_URL });
  }
}

export async function getFollowedTeams(): Promise<FollowedTeam[]> {
  const res = await chrome.storage.sync.get([KEYS.teams]);
  const raw = res[KEYS.teams];
  return Array.isArray(raw) ? (raw as FollowedTeam[]) : [];
}

export async function setFollowedTeams(teams: FollowedTeam[]) {
  await chrome.storage.sync.set({ [KEYS.teams]: teams });
}

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.sync.get([KEYS.settings]);
  const stored = res[KEYS.settings] as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...(stored ?? {}) };
}

export async function setSettings(next: Settings) {
  await chrome.storage.sync.set({ [KEYS.settings]: sanitizeSettings(next) });
  chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "settings_replaced" }).catch(() => {});
}

export async function setSettingsPartial(patch: Partial<Settings>) {
  const current = await getSettings();
  const merged = sanitizeSettings({ ...current, ...patch });
  await chrome.storage.sync.set({ [KEYS.settings]: merged });
  chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "settings_changed" }).catch(() => {});
}

export function observeSettings(cb: (next: Settings) => void) {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== "sync" || !changes[KEYS.settings]) return;
    const newValue = changes[KEYS.settings].newValue as Partial<Settings> | undefined;
    cb({ ...DEFAULTS, ...(newValue ?? {}) });
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export async function clearFollowedTeams() {
  await chrome.storage.sync.remove(KEYS.teams);
}

export async function resetSettings() {
  await chrome.storage.sync.set({ [KEYS.settings]: DEFAULTS });
  chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "settings_reset" }).catch(() => {});
}

function sanitizeSettings(s: Settings): Settings {
  const polling = Number.isFinite(s.pollingSeconds) ? Math.max(10, Math.round(s.pollingSeconds)) : DEFAULTS.pollingSeconds;
  return {
    showBar: !!s.showBar,
    compact: !!s.compact,
    theme: s.theme === "dark" ? "dark" : s.theme === "light" ? "light" : "auto",
    pollingSeconds: polling,
    barPos: s.barPos && typeof s.barPos.x === "number" && typeof s.barPos.y === "number"
      ? { x: s.barPos.x, y: s.barPos.y }
      : undefined,
  };
}
