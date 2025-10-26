// src/popup/utils/actions.ts
import { setSettingsPartial } from "../../lib/storage";

export async function refreshNow(setToast: (msg: string) => void) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "REFRESH_BAR" });
        setToast("Refreshed ✓");
    } catch {
        setToast("Not available");
    }
}

export async function resetBarPos(setToast: (msg: string) => void) {
    await setSettingsPartial({ barPos: undefined });
    setToast("Reset ✓");
}

export function openOptions() {
    chrome.runtime.openOptionsPage();
}

export async function updateSettings(patch: Partial<any>) {
    await setSettingsPartial(patch);
}
