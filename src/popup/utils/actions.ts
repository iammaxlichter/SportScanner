import { setSettingsPartial } from "../../lib/storage";

export async function refreshNow(setToast: (msg: string) => void) {
  try {
    // Ask background to poll + broadcast to content scripts.
    await chrome.runtime.sendMessage({ type: "REFRESH_NOW_FROM_POPUP" });
    setToast("Refreshed ✓");
  } catch {
    setToast("Not available");
  }
}

export async function resetBarPos(setToast: (msg: string) => void) {
  await setSettingsPartial({ barPos: undefined });
  // Background will read settings on SETTINGS_UPDATED → REFRESH_BAR
  await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_reset_pos" });
  setToast("Reset ✓");
}

export function openOptions() {
  chrome.runtime.openOptionsPage();
}

export async function updateSettings(patch: Partial<any>) {
  await setSettingsPartial(patch);
  await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", reason: "popup_update_settings" });
}
