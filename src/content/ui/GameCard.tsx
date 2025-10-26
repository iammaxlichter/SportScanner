// src/content/ui/GameCard.tsx
/// <reference types="chrome" />
import { useState } from "react";
import type { Game } from "../../lib/types";

export type ThemeColors = {
    cardBg: string;
    cardBorder: string;
    textPrimary: string;
    textSecondary: string;
    abbrevBg: string;
    abbrevText: string;
    dragHandle: string;
    dragHandleHover: string;
    logoBg: string;
};

function abbrevFromName(name: string) {
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    const letters =
        words.length >= 2
            ? (words[0][0] + words[1][0] + (words[2]?.[0] ?? "")).toUpperCase()
            : words[0].slice(0, 3).toUpperCase();
    return letters.slice(0, 3);
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
    let hasBallSide: "home" | "away" | null = null;
    if (s.possession === "home" || s.possession === "away") hasBallSide = s.possession;
    const down = typeof s.down === "number" ? s.down : undefined;
    const distance = typeof s.distance === "number" ? s.distance : undefined;
    const spot = typeof s.yardLine === "string" ? s.yardLine : undefined;
    return { hasBallSide, down, distance, spot };
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

export default function GameCard({
    g,
    compact,
    colors,
}: {
    g: Game;
    compact: boolean;
    colors: ThemeColors;
}) {
    const isNFL = (g.league || "").toLowerCase() === "nfl";
    const isNCAAF = (g.league || "").toLowerCase() === "ncaaf";
    const isMLB = (g.league || "").toLowerCase() === "mlb";
    const isGridiron = isNFL || isNCAAF;

    const mlb = isMLB ? getMlbSituation(g) : ({} as MLBSituation);
    const gridiron = isGridiron ? getNflSituation(g) : ({} as NFLSituation);

    const Side = ({
        s,
        hasBall,
    }: {
        s: Game["home"];
        hasBall?: boolean;
    }) => {
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
                <Side s={g.away} hasBall={gridiron.hasBallSide === "away"} />
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

                {/* MLB-only extras */}
                {isMLB && g.status?.phase === "live" && (() => {
                    const { outs, onFirst, onSecond, onThird } = mlb;
                    const runners = [onFirst && "1st", onSecond && "2nd", onThird && "3rd"].filter(Boolean).join(", ");
                    const outsText = typeof outs === "number" ? `${outs} out${outs !== 1 ? "s" : ""}` : "";
                    const runnersText = runners ? `Runners: ${runners}` : "";
                    const text = [outsText, runnersText].filter(Boolean).join(" • ");
                    return text ? (
                        <div style={{ marginTop: 2, color: colors.textSecondary, fontSize: compact ? 10 : 11 }}>
                            {text}
                        </div>
                    ) : null;
                })()}

                {/* NFL/NCAAF-only extras */}
                {isGridiron && g.status?.phase === "live" && (() => {
                    const s: any = g.status || {};
                    const down = typeof s.down === "number" ? s.down : undefined;
                    const togo = typeof s.distance === "number" ? s.distance : undefined;
                    const spot = typeof s.yardLine === "string" ? s.yardLine : undefined;
                    const text = down && togo ? `${ordinal(down)} & ${togo}${spot ? ` @ ${spot}` : ""}` : (spot ? `@ ${spot}` : "");
                    return text ? (
                        <div style={{ marginTop: 2, color: colors.textSecondary, fontSize: compact ? 10 : 11 }}>
                            {text}
                        </div>
                    ) : null;
                })()}
            </div>

            <div style={{ justifySelf: "end" }}>
                <Side s={g.home} hasBall={gridiron.hasBallSide === "home"} />
            </div>
        </div>
    );
}
