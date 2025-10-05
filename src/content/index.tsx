import { useEffect, useRef, useState } from "react";
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

  // Optional: style isolation baseline (kept minimal since we use inline styles)
  const style = document.createElement("style");
  style.textContent = `
    :host, #__sportscanner_mount__ { all: initial; }
  `;
  shadow.appendChild(style);

  mount = document.createElement("div");
  mount.id = "__sportscanner_mount__";
  shadow.appendChild(mount);
  document.documentElement.appendChild(host);
  console.log("[SportScanner] content script mounted");
})();

function abbrevFromName(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const letters =
    words.length >= 2
      ? (words[0][0] + words[1][0] + (words[2]?.[0] ?? "")).toUpperCase()
      : words[0].slice(0, 3).toUpperCase();
  return letters.slice(0, 3);
}

function barWidth(compact: boolean) {
  const vw = window.innerWidth;
  // Tweak these ranges to taste
  return compact
    ? 167 // narrower in compact
    : Math.min(420, Math.max(260, Math.floor(vw * 0.50))); // wider in normal
}

function layoutGuess(compact: boolean) {
  const pad = 24;
  const vw = window.innerWidth;
  const widthGuess = barWidth(compact);
  const left = pad;
  const right = vw - widthGuess - pad;
  return { pad, vw, widthGuess, left, right };
}

// Theme colors
type Theme = "light" | "dark" | "auto";

interface ThemeColors {
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  abbrevBg: string;
  abbrevText: string;
  dragHandle: string;
  dragHandleHover: string;
  logoBg: string;
}

function getThemeColors(theme: Theme): ThemeColors {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "auto" && prefersDark);

  if (isDark) {
    return {
      cardBg: "#0b1220",
      cardBorder: "#1e293b",
      textPrimary: "#fff",
      textSecondary: "#e5e7eb",
      abbrevBg: "#334155",
      abbrevText: "#e5e7eb",
      dragHandle: "rgba(148,163,184,.85)",
      dragHandleHover: "rgba(148,163,184,1)",
      logoBg: "#111827",
    };
  } else {
    return {
      cardBg: "#ffffff",
      cardBorder: "#e5e7eb",
      textPrimary: "#0f172a",
      textSecondary: "#475569",
      abbrevBg: "#e2e8f0",
      abbrevText: "#475569",
      dragHandle: "rgba(100,116,139,.85)",
      dragHandleHover: "rgba(100,116,139,1)",
      logoBg: "#f8fafc",
    };
  }
}

function Card({ g, compact, colors }: { g: Game; compact: boolean; colors: ThemeColors }) {
  const Side = ({ s }: { s: Game["home"]; side: "home" | "away" }) => {
    const [imgOk, setImgOk] = useState(true);
    const abbr = s.teamId?.toUpperCase?.() || abbrevFromName(s.name);
    const logoUrl = s.logo;

    const CircleAbbr = ({ size }: { size: number }) => (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 9999,
          background: colors.abbrevBg,
          display: "grid",
          placeItems: "center",
          fontSize: Math.max(10, Math.round(size * 0.45)),
          fontWeight: 700,
          letterSpacing: 0.3,
          color: colors.abbrevText,
        }}
      >
        {abbr}
      </div>
    );

    const LogoOrAbbr = ({ size }: { size: number }) =>
      logoUrl && imgOk ? (
        <img
          src={logoUrl}
          alt={s.name}
          referrerPolicy="no-referrer"
          onError={() => setImgOk(false)}
          style={{ width: size, height: size, borderRadius: 9999, objectFit: "cover", background: colors.logoBg }}
        />
      ) : (
        <CircleAbbr size={size} />
      );

    if (compact) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            minWidth: 36,
            textAlign: "center",
          }}
        >
          <LogoOrAbbr size={22} />
          <span style={{ fontSize: 12, opacity: 0.9, color: colors.textSecondary, lineHeight: 1 }}>
            {s.score}
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <LogoOrAbbr size={20} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1.1,
          }}
        >
          <strong
            style={{
              fontSize: 12,
              color: colors.textPrimary,
              textAlign: "center",
            }}
          >
            {s.name}
          </strong>
          <span
            style={{
              fontSize: 11,
              opacity: 0.85,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 2,
            }}
          >
            {s.score}
          </span>
        </div>
      </div>
    );
  };

  const formatShort = (ts: number) => {
    try {
      const d = new Date(ts);
      return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(d);
    } catch {
      return "UPCOMING";
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: compact ? 8 : 12,
        alignItems: "center",
        padding: compact ? "6px 8px" : "8px 10px",
        background: colors.cardBg,
        color: colors.textPrimary,
        borderRadius: 12,
        border: `1px solid ${colors.cardBorder}`,
        boxShadow: "0 8px 24px rgba(2,6,23,0.35)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <div style={{ justifySelf: "start" }}>
        <Side s={g.away} side="away" />
      </div>

      <div style={{ textAlign: "center", fontSize: compact ? 11 : 12 }}>
        {!compact && <div style={{ fontWeight: 700, letterSpacing: 0.3 }}>{g.league.toUpperCase()}</div>}
        <div style={{ opacity: 0.9 }}>
          {g.status.phase === "live"
            ? g.status.clock ?? "LIVE"
            : g.status.phase === "pre"
              ? formatShort(g.startTime)
              : "FINAL"}
        </div>
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
  const [theme, setTheme] = useState<Theme>("auto");

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Theme colors
  const colors = getThemeColors(theme);

  const clampToViewport = (x: number, y: number, barWidth: number) => {
    const pad = 12;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Use actual bar height from ref, with better fallback
    const barHeight = barRef.current?.offsetHeight || 80;
    const maxX = vw - barWidth - pad;
    const maxY = vh - barHeight - pad;
    return { x: Math.max(pad, Math.min(x, maxX)), y: Math.max(pad, Math.min(y, maxY)) };
  };

  const snapToEdges = (x: number, y: number, barWidth: number) => {
    const { pad } = layoutGuess(compact);
    const vw = window.innerWidth;
    const left = pad;
    const right = vw - barWidth - pad;
    const snap = 16;
    const vh = window.innerHeight;
    // Use actual bar height from ref, with better fallback
    const barHeight = barRef.current?.offsetHeight || 80;
    const top = pad, bottom = vh - barHeight - pad;
    const nx = Math.abs(x - left) < snap ? left : Math.abs(x - right) < snap ? right : x;
    const ny = Math.abs(y - top) < snap ? top : Math.abs(y - bottom) < snap ? bottom : y;
    return { x: nx, y: ny };
  };

  const savePosThrottled = (() => {
    let t: number | null = null;
    return (p: { x: number; y: number }) => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        chrome.storage.sync.get(["settings"]).then((res) => {
          const settings = { ...(res.settings ?? {}), barPos: p };
          chrome.storage.sync.set({ settings }).catch(() => { });
        });
      }, 200);
    };
  })();

  // Load initial settings + position
  useEffect(() => {
    chrome.storage.sync.get(["settings"]).then((res) => {
      const s = res.settings ?? {};
      setShowBar(s.showBar ?? true);
      setCompact(s.compact ?? true);
      setTheme(s.theme ?? "auto");
      const { widthGuess } = layoutGuess(compact);
      if (s.barPos && typeof s.barPos.x === "number" && typeof s.barPos.y === "number") {
        setPos(clampToViewport(s.barPos.x, s.barPos.y, widthGuess));
      } else {
        const defX = Math.max(12, window.innerWidth / 2 - 180);
        const defY = Math.max(12, window.innerHeight - 100);
        setPos(clampToViewport(defX, defY, widthGuess));
      }
    });

    const onChange = (changes: any, area: string) => {
      if (area === "sync" && changes.settings) {
        const next = changes.settings.newValue ?? {};
        if (typeof next.showBar !== "undefined") setShowBar(next.showBar);
        if (typeof next.compact !== "undefined") setCompact(next.compact);
        if (typeof next.theme !== "undefined") setTheme(next.theme);
        const { widthGuess } = layoutGuess(compact);
        if (next.barPos && typeof next.barPos.x === "number" && typeof next.barPos.y === "number") {
          setPos(clampToViewport(next.barPos.x, next.barPos.y, widthGuess));
        }
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (theme !== "auto") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      // Force re-render by updating a dummy state or just let colors recalculate
      setTheme("auto");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  // Get initial snapshot + subscribe to push updates
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }, (resp) => {
      if (chrome.runtime.lastError) {
        console.debug("[SportScanner] bg not ready:", chrome.runtime.lastError.message);
        return;
      }
      if (resp?.games) setGames(resp.games as Game[]);
    });

    const handler = (msg: any) => {
      if (msg?.type === "GAMES_UPDATE") setGames((msg.games ?? []) as Game[]);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Re-clamp position on viewport changes
  useEffect(() => {
    const onResize = () => {
      const { widthGuess } = layoutGuess(compact);
      setPos((p) => (p ? clampToViewport(p.x, p.y, widthGuess) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-clamp position when bar height changes (games added/removed)
  useEffect(() => {
    if (!pos || !barRef.current) return;
    const { widthGuess } = layoutGuess(compact);
    const clamped = clampToViewport(pos.x, pos.y, widthGuess);
    // Only update if position actually changed to avoid infinite loops
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      setPos(clamped);
    }
  }, [games.length, compact]); // Re-run when these change bar height

  // Drag interactions
  useEffect(() => {
    if (!isDragging || !dragOffset) return;

    const handleMove = (clientX: number, clientY: number) => {
      const { widthGuess } = layoutGuess(compact);
      const newX = clientX - dragOffset.x;
      const newY = clientY - dragOffset.y;
      const clamped = clampToViewport(newX, newY, widthGuess);
      const snapped = snapToEdges(clamped.x, clamped.y, widthGuess);
      setPos(snapped);
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
      if (pos) savePosThrottled(pos);
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

  if (!showBar || !pos || games.length === 0) return null;

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
    background: colors.dragHandle,
    marginBottom: 16,
    cursor: isDragging ? "grabbing" : "grab",
    transition: isDragging ? "none" : "background-color 0.15s ease",
  };

  const { widthGuess, left, right } = layoutGuess(compact);
  const nearLeft = Math.abs(pos.x - left) < 0.5;
  const nearRight = Math.abs(pos.x - right) < 0.5;
  const isVertical = nearLeft || nearRight;

  const columnWidth = widthGuess;

  return (
    <div style={wrapperStyle} ref={barRef}>
      <div
        style={dragHandleStyle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseEnter={(e) => {
          if (!isDragging) (e.target as HTMLElement).style.background = colors.dragHandleHover;
        }}
        onMouseLeave={(e) => {
          if (!isDragging) (e.target as HTMLElement).style.background = colors.dragHandle;
        }}
      />
      <div
        style={
          isVertical
            ? {
              display: "flex",
              flexDirection: "column",
              flexWrap: "nowrap",
              gap: compact ? 10 : 12,
              width: columnWidth,
              pointerEvents: "auto",
            }
            : {
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: compact ? 10 : 12,
              pointerEvents: "auto",
            }
        }
      >
        {games.map((game, i) => (
          <div
            key={`${game.league}-${game.home.teamId}-${game.away.teamId}-${game.startTime}-${i}`}
            style={isVertical ? { width: "100%" } : undefined}
          >
            <Card g={game} compact={compact} colors={colors} />
          </div>
        ))}
      </div>
    </div>
  );
}

if (mount) {
  createRoot(mount).render(<Bar />);
}