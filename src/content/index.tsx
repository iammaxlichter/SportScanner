import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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

function ordinal(n?: number) {
  if (!n || n < 1) return "";
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
type NFLSituation = {
  hasBallSide: "home" | "away" | null;
  down?: number;
  distance?: number;
  spot?: string;
};

type MLBSituation = {
  outs?: number;
  onFirst?: boolean;
  onSecond?: boolean;
  onThird?: boolean;
};

function getNflSituation(g: Game): NFLSituation {
  const s: any = g.status || {};

  // Possession comes directly from status now
  let hasBallSide: "home" | "away" | null = null;
  if (s.possession === "home" || s.possession === "away") {
    hasBallSide = s.possession;
  }

  // Down, distance, and yard line also come from status
  const down = typeof s.down === "number" ? s.down : undefined;
  const distance = typeof s.distance === "number" ? s.distance : undefined;
  const spot = typeof s.yardLine === "string" ? s.yardLine : undefined;

  return {
    hasBallSide,
    down,
    distance,
    spot,
  };
}

function getMlbSituation(g: Game): MLBSituation {
  const s: any = g.status || {};

  return {
    outs: typeof s.outs === "number" ? s.outs : undefined,
    onFirst: s.onFirst === true,
    onSecond: s.onSecond === true,
    onThird: s.onThird === true,
  };
}

function Card({ g, compact, colors }: { g: Game; compact: boolean; colors: ThemeColors }) {
  const isNFL = (g.league || "").toLowerCase() === "nfl";
  const isNCAAF = (g.league || "").toLowerCase() === "ncaaf"
  const isMLB = (g.league || "").toLowerCase() === "mlb";
  const isGridiron = isNFL || isNCAAF;

  const mlb = isMLB ? getMlbSituation(g) : ({} as MLBSituation);
  const gridiron = isGridiron ? getNflSituation(g) : ({} as NFLSituation);

  if (isNFL && g.status?.phase === "live") {
    console.log("[SS NFL]", {
      teams: { home: g.home.teamId, away: g.away.teamId },
      rawStatus: g.status,
      extracted: gridiron,
    });
  }

  if (isMLB && g.status?.phase === "live") {
    console.log("[SS MLB]", {
      teams: { home: g.home.teamId, away: g.away.teamId },
      rawStatus: g.status,
      extracted: mlb,
    });
  }

  const Side = (props: {
    s: Game["home"];
    side: "home" | "away"; // kept for caller consistency
    hasBall?: boolean;
  }) => {
    const { s, hasBall } = props;
    const [imgOk, setImgOk] = useState(true);
    const abbr = s.teamId?.toUpperCase?.() || abbrevFromName(s.name);
    const logoUrl = s.logo;

    const Dot = () => (
      <span
        title="Possession"
        style={{
          position: "absolute",
          top: -3,
          right: -3,
          width: 8,
          height: 8,
          borderRadius: 9999,
          background: "#ef4444",
          boxShadow: "0 0 0 2px " + colors.cardBg,
        }}
      />
    );

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
          position: "relative",
        }}
      >
        {abbr}
        {hasBall && <Dot />}
      </div>
    );

    const LogoOrAbbr = ({ size }: { size: number }) => (
      <div style={{ position: "relative", width: size, height: size }}>
        {logoUrl && imgOk ? (
          <img
            src={logoUrl}
            alt={s.name}
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
            style={{
              width: size,
              height: size,
              borderRadius: 9999,
              objectFit: "cover",
              background: colors.logoBg,
            }}
          />
        ) : (
          <CircleAbbr size={size} />
        )}
        {hasBall && <Dot />}
      </div>
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
          <label style={{ fontSize: 12, color: colors.textPrimary, textAlign: "center" }}>
            {s.name}
          </label>
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
        <Side s={g.away} side="away" hasBall={gridiron.hasBallSide === "away"} />
      </div>

      <div style={{ textAlign: "center", fontSize: compact ? 11 : 12, lineHeight: 1.15 }}>
        {!compact && <div style={{ fontWeight: 700, letterSpacing: 0.3 }}>{g.league.toUpperCase()}</div>}
        <div style={{ opacity: 0.9 }}>
          {g.status.phase === "live"
            ? g.status.clock ?? "LIVE"
            : g.status.phase === "pre"
              ? formatShort(g.startTime)
              : "FINAL"}
        </div>

        {/* MLB-only: show outs and runners if live */}
        {isMLB && g.status?.phase === "live" && (
          (() => {
            const { outs, onFirst, onSecond, onThird } = mlb;
            const runners = [onFirst && "1st", onSecond && "2nd", onThird && "3rd"]
              .filter(Boolean)
              .join(", ");

            const outsText = typeof outs === "number" ? `${outs} out${outs !== 1 ? "s" : ""}` : "";
            const runnersText = runners ? `Runners: ${runners}` : "";

            const text = [outsText, runnersText].filter(Boolean).join(" • ");

            return text ? (
              <div style={{ marginTop: 2, color: colors.textSecondary, fontSize: compact ? 10 : 11 }}>
                {text}
              </div>
            ) : null;
          })()
        )}

        {/* NFL-only: show down & distance if live and present */}
        {isGridiron && g.status?.phase === "live" && (
          (() => {
            const { down, distance: togo, spot } = gridiron;
            const text =
              down && togo
                ? `${ordinal(down)} & ${togo}${spot ? ` @ ${spot}` : ""}`
                : spot
                  ? `@ ${spot}`
                  : "";
            return text ? (
              <div style={{ marginTop: 2, color: colors.textSecondary, fontSize: compact ? 10 : 11 }}>
                {text}
              </div>
            ) : null;
          })()
        )}
      </div>


      <div style={{ justifySelf: "end" }}>
        <Side s={g.home} side="home" hasBall={gridiron.hasBallSide === "home"} />
      </div>
    </div>
  );
}

function Bar() {
  const [games, setGames] = useState<Game[]>([]);
  const [showBar, setShowBar] = useState(true);
  const [compact, setCompact] = useState(true);
  const [theme, setTheme] = useState<Theme>("auto");
  const [justRefreshed, setJustRefreshed] = useState(false);

  const showBarRef = useRef(showBar);
  useEffect(() => { showBarRef.current = showBar; }, [showBar]);

  // put inside Bar()
  const displayGames = useMemo(() => {
    // priority: live (0) < pre (1) < final (2)
    const rank = (g: Game) =>
      g.status?.phase === "live" ? 0 :
        g.status?.phase === "pre" ? 1 : 2;

    // optional window for upcoming games (e.g., next 48h)
    const now = Date.now();
    const soonMs = 48 * 60 * 60 * 1000;

    const pool = games.filter(g =>
      g.status?.phase !== "pre" ||
      (typeof g.startTime === "number" &&
        g.startTime - now <= soonMs &&
        g.startTime - now >= -soonMs)
    );

    const sorted = [...pool].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;

      // among PRE games, earlier start wins
      if (a.status?.phase === "pre" && b.status?.phase === "pre") {
        return (a.startTime ?? 0) - (b.startTime ?? 0);
      }

      // among FINAL-ish (neither live nor pre), most recent first
      const aFinalish = a.status?.phase !== "live" && a.status?.phase !== "pre";
      const bFinalish = b.status?.phase !== "live" && b.status?.phase !== "pre";
      if (aFinalish && bFinalish) {
        return (b.startTime ?? 0) - (a.startTime ?? 0);
      }

      return 0;
    });

    // take at most one game per team
    const taken = new Set<string>();
    const out: Game[] = [];
    for (const g of sorted) {
      const teams = [g.home.teamId, g.away.teamId].filter(Boolean) as string[];
      if (teams.some(t => taken.has(t))) continue;
      out.push(g);
      teams.forEach(t => taken.add(t));
    }
    return out;
  }, [games]);


  function applySettingsFrom(obj: any) {
    const next = obj ?? {};
    if (typeof next.showBar !== "undefined") setShowBar(next.showBar);
    if (typeof next.compact !== "undefined") setCompact(next.compact);
    if (typeof next.theme !== "undefined") setTheme(next.theme);

    const nextShowBar =
      typeof next.showBar !== "undefined" ? next.showBar : showBarRef.current;

    if (!nextShowBar) return;

    const { widthGuess } = layoutGuess(next.compact ?? compact);
    if (next.barPos && typeof next.barPos.x === "number" && typeof next.barPos.y === "number") {
      setAnchor("free");
      setPos(clampToViewport(next.barPos.x, next.barPos.y, widthGuess));
    } else {
      setAnchor("auto");
      requestAnimationFrame(() => setPos(centerBottom()));
    }
  }


  useEffect(() => {
    const handler = (msg: any) => {
      if (msg?.type === "GAMES_UPDATE") {
        setGames((msg.games ?? []) as Game[]);
      } else if (msg?.type === "REFRESH_BAR") {
        chrome.storage.sync.get(["settings"]).then(({ settings }) => {
          applySettingsFrom(settings);
          const sb = typeof settings?.showBar !== "undefined" ? settings.showBar : showBarRef.current;
          if (sb) {
            setJustRefreshed(true);
            setTimeout(() => setJustRefreshed(false), 900);
          }
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // ADD: anchor mode & helper
  type Anchor = "auto" | "free";
  const [anchor, setAnchor] = useState<Anchor>("auto");

  const centerBottom = useCallback(() => {
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = barRef.current?.offsetWidth ?? layoutGuess(compact).widthGuess;
    const bh = barRef.current?.offsetHeight ?? 80;
    return clampToViewport(Math.round((vw - bw) / 2), vh - bh - pad, bw);
  }, [compact]);

  // Drag state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Re-center automatically when the bar's own size changes (wraps, rows/cols)
  // so a single reset snaps to true bottom-center.
  useEffect(() => {
    if (anchor !== "auto" || !barRef.current) return;

    const ro = new ResizeObserver(() => {
      setPos(centerBottom());
    });
    ro.observe(barRef.current);

    return () => ro.disconnect();
  }, [anchor, centerBottom]);

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
          const s = res.settings ?? {};
          // only persist when in free mode
          const settings = anchor === "free" ? { ...s, barPos: p } : { ...s, barPos: undefined };
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

      const { widthGuess } = layoutGuess(s.compact ?? compact);

      // ✅ Only compute position if bar is ON
      if (s.showBar ?? true) {
        if (s.barPos && typeof s.barPos.x === "number" && typeof s.barPos.y === "number") {
          setAnchor("free");
          setPos(clampToViewport(s.barPos.x, s.barPos.y, widthGuess));
        } else {
          setAnchor("auto");
          requestAnimationFrame(() => setPos(centerBottom()));
        }
      } else {
        // If bar is OFF, keep hidden
        setAnchor("auto");
        setPos(null);
      }
    });

    const onChange = (changes: any, area: string) => {
      if (area !== "sync" || !changes.settings) return;

      const next = changes.settings.newValue ?? {};
      if (typeof next.showBar !== "undefined") setShowBar(next.showBar);
      if (typeof next.compact !== "undefined") setCompact(next.compact);
      if (typeof next.theme !== "undefined") setTheme(next.theme);

      const { widthGuess } = layoutGuess(next.compact ?? compact);
      const nextShowBar =
        typeof next.showBar !== "undefined" ? next.showBar : showBarRef.current;

      if (!nextShowBar) {
        setPos(null);
        return;
      }

      if (next.barPos && typeof next.barPos.x === "number" && typeof next.barPos.y === "number") {
        setAnchor("free");
        setPos(clampToViewport(next.barPos.x, next.barPos.y, widthGuess));
      } else {
        setAnchor("auto");
        requestAnimationFrame(() => setPos(centerBottom()));
      }

      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 900);
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
  }, []);

  // Re-clamp position on viewport changes
  useEffect(() => {
    const onResize = () => {
      if (anchor === "auto") {
        setPos(centerBottom());
      } else {
        const { widthGuess } = layoutGuess(compact);
        setPos((p) => (p ? clampToViewport(p.x, p.y, widthGuess) : p));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [anchor, compact, centerBottom]);

  useEffect(() => {
    if (anchor !== "auto") return;
    setPos(centerBottom());
  }, [games.length, compact, theme, centerBottom]);

  useEffect(() => {
    if (anchor !== "free" || !pos || !barRef.current) return;
    const { widthGuess } = layoutGuess(compact);
    const clamped = clampToViewport(pos.x, pos.y, widthGuess);
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      setPos(clamped);
    }
  }, [games.length, compact, anchor]);

  useEffect(() => {
    // if the bar is hidden or has no cards, clear the badge
    const count = showBar && pos && displayGames.length ? String(displayGames.length) : "";
    chrome.runtime.sendMessage({ type: "BADGE_COUNT", count }).catch(() => { });
  }, [displayGames.length, showBar, !!pos]);
  
  // Drag interactions
  useEffect(() => {
    if (!isDragging || !dragOffset) return;

    const handleMove = (clientX: number, clientY: number) => {
      const { widthGuess } = layoutGuess(compact);
      const newX = clientX - dragOffset!.x;
      const newY = clientY - dragOffset!.y;
      const clamped = clampToViewport(newX, newY, widthGuess);
      setPos(anchor === "free" ? snapToEdges(clamped.x, clamped.y, widthGuess) : clamped);
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
  }, [isDragging, dragOffset, pos, anchor]);

  if (!showBar || !pos || games.length === 0) return null;

  const handleDragStart = (clientX: number, clientY: number) => {
    setAnchor("free");
    setDragOffset({ x: clientX - (pos?.x ?? 0), y: clientY - (pos?.y ?? 0) });
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
    background: justRefreshed ? "#22c55e" : colors.dragHandle, // flash green
    boxShadow: justRefreshed ? "0 0 0 6px rgba(34,197,94,.25)" : "none",
    marginBottom: 16,
    cursor: isDragging ? "grabbing" : "grab",
    transition: "background-color 160ms ease, box-shadow 160ms ease",
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
        {displayGames.map((game, i) => (
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