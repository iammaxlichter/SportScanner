// src/background/alarms.ts
/// <reference types="chrome" />
import { getSettings } from "../lib/storage";

export async function rescheduleAlarms() {
    const settings = await getSettings();
    const periodMin = Math.max(1, (settings.pollingSeconds ?? 60) / 60);
    await chrome.alarms.clear("poll");
    chrome.alarms.create("poll", { periodInMinutes: periodMin });
    console.log("[SportScanner] alarm scheduled every", periodMin, "min");
}

export function initAlarms(onPoll: () => Promise<void>) {
    chrome.alarms.onAlarm.addListener(async (a: chrome.alarms.Alarm) => {
        if (a.name === "poll") {
            console.log("[SportScanner] alarm -> pollOnce()");
            await onPoll();
        }
    });
}
