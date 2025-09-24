import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Game } from "../lib/types";

// Shadow root mount
const host = document.createElement("div");
const shadow = host.attachShadow({ mode: "open" });
const mount = document.createElement("div");
shadow.appendChild(mount);
document.documentElement.appendChild(host);

console.log("[SportScanner] content script loaded");

function Card({ g }: { g: Game }) {
  const Side = ({ s }: { s: Game["home"] }) => (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ width: 20, height: 20, borderRadius: 9999, background: "#334155" }} />
      <div style={{ display: "grid", lineHeight: 1.1 }}>
        <strong style={{ fontSize: 12 }}>{s.name}</strong>
        <span style={{ fontSize: 11, opacity: 0.8 }}>{s.score}</span>
      </div>
    </div>
  );

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center",
      padding: "8px 10px", background: "#0b1220", color: "#fff",
      borderRadius: 12, border: "1px solid #1e293b", minWidth: 360
    }}>
      <Side s={g.away} />
      <div style={{ textAlign: "center", fontSize: 12 }}>
        <div style={{ fontWeight: 700, letterSpacing: .3 }}>{g.league.toUpperCase()}</div>
        <div style={{ opacity: .85 }}>{g.status.phase === "live" ? g.status.clock : g.status.phase}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <Side s={g.home} />
      </div>
    </div>
  );
}

function Bar() {
  const [games, setGames] = useState<Game[]>([]);
  const [showBar, setShowBar] = useState(true);

  // Read current showBar and react to changes
  useEffect(() => {
    chrome.storage.sync.get(["settings"]).then(res => {
      setShowBar(res.settings?.showBar ?? true);
    });
    const onChange = (changes: any, area: string) => {
      if (area === "sync" && changes.settings) {
        setShowBar(changes.settings.newValue?.showBar ?? true);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Pull initial snapshot + subscribe to pushes
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }, (resp) => {
      if (resp?.games) {
        console.log("[SportScanner] got snapshot:", resp.games.length);
        setGames(resp.games);
      }
    });
    const handler = (msg: any) => {
      if (msg?.type === "GAMES_UPDATE") {
        console.log("[SportScanner] message received:", msg.games?.length);
        setGames(msg.games ?? []);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  if (!showBar) return null;
  if (!games.length) return null; // (or render a “no games” shell)

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 2147483647,
      background: "transparent", padding: 10, display: "flex", justifyContent: "center", pointerEvents: "none"
    }}>
      <div style={{ display: "flex", gap: 10, pointerEvents: "auto" }}>
        {games.map((game, i) => <Card key={i} g={game} />)}
      </div>
    </div>
  );
}

createRoot(mount).render(<Bar />);
