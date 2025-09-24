// Minimal Edge MV3 background worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("SportScanner installed");
  // Example: tick every minute (we'll tune later)
  chrome.alarms.create("tick", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "tick") {
    // Heartbeat message the UI can listen for
    chrome.runtime.sendMessage({ type: "TICK" });
  }
});
