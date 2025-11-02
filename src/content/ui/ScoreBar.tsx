// src/content/ui/ScoreBar.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { Game } from "../../lib/types";
import GameCard, { type ThemeColors } from "./GameCard";

type Theme = "light" | "dark" | "auto";

function barWidth(compact: boolean) {
    const vw = window.innerWidth;
    return compact ? 167 : Math.min(420, Math.max(260, Math.floor(vw * 0.5)));
}
function layoutGuess(compact: boolean) {
    const pad = 24;
    const vw = window.innerWidth;
    const widthGuess = barWidth(compact);
    const left = pad;
    const right = vw - widthGuess - pad;
    return { pad, vw, widthGuess, left, right };
}

function getThemeColors(theme: Theme): ThemeColors {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (theme === "auto" && prefersDark);

    return isDark
        ? {
            cardBg: "#0b1220",
            cardBorder: "#1e293b",
            textPrimary: "#fff",
            textSecondary: "#e5e7eb",
            abbrevBg: "#334155",
            abbrevText: "#e5e7eb",
            dragHandle: "rgba(148,163,184,.85)",
            dragHandleHover: "rgba(148,163,184,1)",
            logoBg: "#111827",
        }
        : {
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

export default function ScoreBar() {
    const [games, setGames] = useState<Game[]>([]);
    const [showBar, setShowBar] = useState(true);
    const [compact, setCompact] = useState(true);
    const [theme, setTheme] = useState<Theme>("auto");
    const [justRefreshed, setJustRefreshed] = useState(false);

    const [followed, setFollowed] = useState<Set<string>>(new Set());

    function normalizeFollowed(raw: any): Set<string> {
        const out = new Set<string>();
        if (!raw) return out;
        const byLeague = raw?.byLeague ?? raw;

        if (Array.isArray(byLeague)) {
            for (const v of byLeague) {
                if (typeof v === "string") out.add(v);
                else if (v && typeof v === "object" && typeof v.teamId === "string") {
                    const k = v.league ? `${v.league}:${v.teamId}` : v.teamId;
                    out.add(k);
                    out.add(v.teamId);
                }
            }
            return out;
        }

        if (byLeague && typeof byLeague === "object") {
            for (const [lg, list] of Object.entries(byLeague)) {
                if (Array.isArray(list)) {
                    for (const t of list) {
                        if (typeof t === "string") {
                            out.add(t);
                            out.add(`${lg}:${t}`);
                        }
                    }
                }
            }
        }
        return out;
    }

    function loadFollowedTeams() {
        chrome.storage.sync
            .get(["followedTeams", "followed", "teams"])
            .then((res) => {
                const raw = res.followedTeams ?? res.followed ?? res.teams;
                setFollowed(normalizeFollowed(raw));
            })
            .catch(() => {});
    }

    useEffect(() => {
        loadFollowedTeams();
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== "sync") return;
            if (changes.followedTeams || changes.followed || changes.teams) loadFollowedTeams();
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    }, []);

    const showBarRef = useRef(showBar);
    useEffect(() => { showBarRef.current = showBar; }, [showBar]);

    const displayGames = useMemo(() => {
        const rank = (g: Game) =>
            g.status?.phase === "live" ? 0 :
                g.status?.phase === "pre" ? 1 : 2;

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
            if (a.status?.phase === "pre" && b.status?.phase === "pre") {
                return (a.startTime ?? 0) - (b.startTime ?? 0);
            }
            const aFinalish = a.status?.phase !== "live" && a.status?.phase !== "pre";
            const bFinalish = b.status?.phase !== "live" && b.status?.phase !== "pre";
            if (aFinalish && bFinalish) return (b.startTime ?? 0) - (a.startTime ?? 0);
            return 0;
        });

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

    // Does displayGames contain at least one followed team?
    const hasFollowedInDisplay = useMemo(() => {
        if (!displayGames.length || followed.size === 0) return false;
        const isFollowed = (league: string, teamId?: string | null) => {
            if (!teamId) return false;
            return followed.has(teamId) || followed.has(`${league}:${teamId}`);
        };
        for (const g of displayGames) {
            if (isFollowed(g.league as any, g.home?.teamId) || isFollowed(g.league as any, g.away?.teamId)) {
                return true;
            }
        }
        return false;
    }, [displayGames, followed]);

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
                    // refresh followed teams on a REFRESH_BAR as well
                    loadFollowedTeams();
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

    type Anchor = "auto" | "free";
    const [anchor, setAnchor] = useState<Anchor>("auto");

    const barRef = useRef<HTMLDivElement>(null);
    const centerBottom = useCallback(() => {
        const pad = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const bw = barRef.current?.offsetWidth ?? layoutGuess(compact).widthGuess;
        const bh = barRef.current?.offsetHeight ?? 80;
        return clampToViewport(Math.round((vw - bw) / 2), vh - bh - pad, bw);
    }, [compact]);

    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        if (anchor !== "auto" || !barRef.current) return;
        const ro = new ResizeObserver(() => setPos(centerBottom()));
        ro.observe(barRef.current);
        return () => ro.disconnect();
    }, [anchor, centerBottom]);

    const colors = getThemeColors(theme);

    const clampToViewport = (x: number, y: number, barWidth: number) => {
        const pad = 12;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
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
                    const settings = anchor === "free" ? { ...s, barPos: p } : { ...s, barPos: undefined };
                    chrome.storage.sync.set({ settings }).catch(() => { });
                });
            }, 200);
        };
    })();

    useEffect(() => {
        chrome.runtime.sendMessage({ type: "GET_SNAPSHOT" }, (resp) => {
            if (chrome.runtime.lastError) {
                console.debug("[SportScanner] bg not ready:", chrome.runtime.lastError.message);
                return;
            }
            if (resp?.games) setGames(resp.games as Game[]);
        });
    }, []);

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
        if (clamped.x !== pos.x || clamped.y !== pos.y) setPos(clamped);
    }, [games.length, compact, anchor]);

    useEffect(() => {
        const count = showBar && pos && displayGames.length ? String(displayGames.length) : "";
        chrome.runtime.sendMessage({ type: "BADGE_COUNT", count }).catch(() => { });
    }, [displayGames.length, showBar, pos]);

    useEffect(() => {
        if (!isDragging || !dragOffset) return;

        const handleMove = (clientX: number, clientY: number) => {
            const { widthGuess } = layoutGuess(compact);
            const newX = clientX - dragOffset!.x;
            const newY = clientY - dragOffset!.y;
            const clamped = clampToViewport(newX, newY, widthGuess);
            setPos(anchor === "free" ? snapToEdges(clamped.x, clamped.y, widthGuess) : clamped);
        };

        const handleMouseMove = (e: MouseEvent) => { e.preventDefault(); handleMove(e.clientX, e.clientY); };
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
            document.removeEventListener("touchmove", handleTouchMove as any, { passive: false } as any);
            document.removeEventListener("touchend", handleEnd);
            document.removeEventListener("touchcancel", handleEnd);
        };
    }, [isDragging, dragOffset, pos, anchor, compact]);

    // === Gate the render on followed teams present in displayGames ===
    if (!showBar || !pos || games.length === 0 || !hasFollowedInDisplay) return null;

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

    const colorsDrag = getThemeColors(theme);
    const dragHandleStyle: React.CSSProperties = {
        width: 60,
        height: 8,
        borderRadius: 9999,
        background: justRefreshed ? "#22c55e" : colorsDrag.dragHandle,
        boxShadow: justRefreshed ? "0 0 0 6px rgba(34,197,94,.25)" : "none",
        marginBottom: 16,
        cursor: isDragging ? "grabbing" : "grab",
        transition: "background-color 160ms ease, box-shadow 160ms ease",
    };

    const { widthGuess, left, right } = layoutGuess(compact);
    const nearLeft = Math.abs((pos?.x ?? 0) - left) < 0.5;
    const nearRight = Math.abs((pos?.x ?? 0) - right) < 0.5;
    const isVertical = nearLeft || nearRight;

    return (
        <div style={wrapperStyle} ref={barRef}>
            <div
                style={dragHandleStyle}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onMouseEnter={(e) => {
                    if (!isDragging) (e.target as HTMLElement).style.background = colorsDrag.dragHandleHover;
                }}
                onMouseLeave={(e) => {
                    if (!isDragging) (e.target as HTMLElement).style.background = colorsDrag.dragHandle;
                }}
            />
            <div
                style={
                    isVertical
                        ? { display: "flex", flexDirection: "column", gap: compact ? 10 : 12, width: widthGuess, pointerEvents: "auto" }
                        : { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: compact ? 10 : 12, pointerEvents: "auto" }
                }
            >
                {displayGames.map((game, i) => (
                    <div key={`${game.league}-${game.home.teamId}-${game.away.teamId}-${game.startTime}-${i}`} style={isVertical ? { width: "100%" } : undefined}>
                        <GameCard g={game} compact={compact} colors={colors} />
                    </div>
                ))}
            </div>
        </div>
    );
}
