import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Game } from "../lib/types";

// ---------- SINGLE SHADOW HOST + MOUNT ----------
let mount: HTMLDivElement | null = null;

(function ensureMount() {
  const existingHost = document.getElementById("__sportscanner_host__") as HTMLElement | null;
  if (existingHost && existingHost.shadowRoot) {
    mount = existingHost.shadowRoot.querySelector<HTMLDivElement>("#__sportscanner_mount__");
    if (mount) return;
  }

  const host = document.createElement("div");
  host.id = "__sportscanner_host__";
  const shadow = host.attachShadow({ mode: "open" });
  mount = document.createElement("div");
  mount.id = "__sportscanner_mount__";
  shadow.appendChild(mount);
  document.documentElement.appendChild(host);
  console.log("[SportScanner] content script mounted");
})();

function abbrevFromName(name: string) {
  // e.g. "Portland Trail Blazers" -> "POR"
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const letters = words.length >= 2 ? (words[0][0] + words[1][0] + (words[2]?.[0] ?? "")).toUpperCase()
    : words[0].slice(0, 3).toUpperCase();
  return letters.slice(0, 3);
}
function Card({ g, compact }: { g: Game; compact: boolean }) {
  const Side = ({ s, side }: { s: Game["home"]; side: "home" | "away" }) => {
    const abbr = (s as any).teamId?.toUpperCase?.() || abbrevFromName(s.name);

    if (compact) {
      // Compact: badge (abbr) over score
      return (
        <div style={{ display: "grid", placeItems: side === "home" ? "end" : "start", gap: 4, minWidth: 36 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 9999, background: "#334155",
            display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, letterSpacing: .3
          }}>
            {abbr}
          </div>
          <span style={{ fontSize: 12, opacity: 0.9 }}>{s.score}</span>
        </div>
      );
    }

    // Full (original-ish)
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{
          width: 20, height: 20, borderRadius: 9999, background: "#334155",
          display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700
        }}>
          {abbr}
        </div>
        <div style={{ display: "grid", lineHeight: 1.1 }}>
          <strong style={{ fontSize: 12 }}>{s.name}</strong>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{s.score}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto 1fr",
      gap: compact ? 8 : 12, alignItems: "center",
      padding: compact ? "6px 8px" : "8px 10px",
      background: "#0b1220", color: "#fff",
      borderRadius: 12, border: "1px solid #1e293b",
    }}>
      <div style={{ justifySelf: "start" }}>
        <Side s={g.away} side="away" />
      </div>

      <div style={{ textAlign: "center", fontSize: compact ? 11 : 12 }}>
        {!compact && <div style={{ fontWeight: 700, letterSpacing: .3 }}>{g.league.toUpperCase()}</div>}
        <div style={{ opacity: .85 }}>{g.status.phase === "live" ? g.status.clock : g.status.phase}</div>
      </div>

      <div style={{ justifySelf: "end" }}>
        <Side s={g.home} side="home" />
      </div>
    </div>
  );
}

function Bar() {
  const [games, setGames] = useState<Game[]>([]);
  const [showBar, setShowBar] = useState(true);
  const [compact, setCompact] = useState(true);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const clampToViewport = (x: number, y: number) => {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const widthGuess = 380;
    const heightGuess = 80;
    const maxX = vw - widthGuess - pad;
    const maxY = vh - heightGuess - pad;
    return { x: Math.max(pad, Math.min(x, maxX)), y: Math.max(pad, Math.min(y, maxY)) };
  };

  const snapToEdges = (x: number, y: number) => {
    const pad = 8, snap = 12;
    const vw = window.innerWidth, vh = window.innerHeight;
    const widthGuess = 380, heightGuess = 80;
    const left = pad, right = vw - widthGuess - pad;
    const top = pad, bottom = vh - heightGuess - pad;
    const nx = (Math.abs(x - left) < snap) ? left : (Math.abs(x - right) < snap) ? right : x;
    const ny = (Math.abs(y - top) < snap) ? top : (Math.abs(y - bottom) < snap) ? bottom : y;
    return { x: nx, y: ny };
  };

  const savePosThrottled = (() => {
    let t: number | null = null;
    return (p: { x: number; y: number }) => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        chrome.storage.sync.get(["settings"]).then(res => {
          const settings = { ...(res.settings ?? {}), barPos: p };
          chrome.storage.sync.set({ settings });
        });
      }, 200);
    };
  })();

  useEffect(() => {
    chrome.storage.sync.get(["settings"]).then(res => {
      const s = res.settings ?? {};
      setShowBar(s.showBar ?? true);
      setCompact(s.compact ?? true);
      if (s.barPos && typeof s.barPos.x === "number" && typeof s.barPos.y === "number") {
        setPos(clampToViewport(s.barPos.x, s.barPos.y));
      } else {
        const defX = Math.max(8, window.innerWidth / 2 - 180);
        const defY = Math.max(8, window.innerHeight - 100);
        setPos(clampToViewport(defX, defY));
      }
    });

    const onChange = (changes: any, area: string) => {
      if (area === "sync" && changes.settings) {
        const next = changes.settings.newValue ?? {};
        if (typeof next.showBar !== "undefined") setShowBar(next.showBar);
        if (typeof next.compact !== "undefined") setCompact(next.compact);
        if (next.barPos && typeof next.barPos.x === "number" && typeof next.barPos.y === "number") {
          setPos(clampToViewport(next.barPos.x, next.barPos.y));
        }
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.debug("[SportScanner] bg not ready:", chrome.runtime.lastError.message);
        return;
      }
      if (resp?.games) setGames(resp.games);
    });
    const handler = (msg: any) => {
      if (msg?.type === "GAMES_UPDATE") setGames(msg.games ?? []);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  useEffect(() => {
    const onResize = () => setPos(p => (p ? clampToViewport(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isDragging || !dragOffset) return;

    const handleMove = (clientX: number, clientY: number) => {
      const newX = clientX - dragOffset.x;
      const newY = clientY - dragOffset.y;
      const clamped = clampToViewport(newX, newY);
      const snapped = snapToEdges(clamped.x, clamped.y);
      setPos(snapped); // <- use snapped
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    const handleEnd = () => {
      setIsDragging(false);
      setDragOffset(null);
      if (pos) savePosThrottled(pos); // <- save here, not on every render
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [isDragging, dragOffset, pos]);

  if (!showBar || !games.length || !pos) return null;

  const handleDragStart = (clientX: number, clientY: number) => {
    setDragOffset({ x: clientX - pos.x, y: clientY - pos.y });
    setIsDragging(true);
  };
  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };
  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    const t = e.touches[0];
    handleDragStart(t.clientX, t.clientY);
  };

  const wrapperStyle: React.CSSProperties = {
    position: "fixed",
    left: pos.x,
    top: pos.y,
    zIndex: 2147483647,
    background: "transparent",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    userSelect: "none",
    touchAction: "none",
    pointerEvents: "auto",
  };
  const dragHandleStyle: React.CSSProperties = {
    width: 60,
    height: 8,
    borderRadius: 9999,
    background: "rgba(148,163,184,.8)",
    marginBottom: 8,
    cursor: isDragging ? "grabbing" : "grab",
    transition: isDragging ? "none" : "background-color 0.2s ease",
  };

  return (
    <div style={wrapperStyle}>
      <div
        style={dragHandleStyle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseEnter={(e) => { if (!isDragging) (e.target as HTMLElement).style.background = "rgba(148,163,184,1)"; }}
        onMouseLeave={(e) => { if (!isDragging) (e.target as HTMLElement).style.background = "rgba(148,163,184,.8)"; }}
      />
      <div style={{ display: "flex", gap: compact ? 8 : 10, pointerEvents: "auto", flexWrap: "wrap" }}>
        {games.map((game, i) => <Card key={i} g={game} compact={compact} />)}
      </div>
    </div>
  );
}

if (mount) {
  createRoot(mount).render(<Bar />);
}