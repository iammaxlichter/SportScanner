// src/content/mount.ts
/// <reference types="chrome" />

export function ensureMount(): HTMLDivElement {
    const HOST_ID = "__sportscanner_host__";
    const MOUNT_ID = "__sportscanner_mount__";

    const existingHost = document.getElementById(HOST_ID) as HTMLElement | null;
    if (existingHost && existingHost.shadowRoot) {
        const existing = existingHost.shadowRoot.querySelector<HTMLDivElement>(`#${MOUNT_ID}`);
        if (existing) return existing;
    }

    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
    :host, #${MOUNT_ID} { all: initial; }
  `;
    shadow.appendChild(style);

    const mount = document.createElement("div");
    mount.id = MOUNT_ID;
    shadow.appendChild(mount);

    document.documentElement.appendChild(host);
    console.log("[SportScanner] content script mounted");

    return mount;
}
