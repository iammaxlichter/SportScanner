//src/options/components/SettingsPanel.tsx
import { useState } from "react";
import type { FollowedTeam, Settings, Theme } from "../../lib/types";
import { logoFor } from "../utils/logoFor";

type Props = {
    settings: Settings;
    setSettings: (s: Settings) => void;
    selected: FollowedTeam[];
    removeTeam: (t: FollowedTeam) => void;
    onResetBarPos: () => Promise<void>;
    onClearAllSelected: () => void;
};
export function SettingsPanel({ settings, setSettings, selected, removeTeam, onResetBarPos, onClearAllSelected, }: Props) {
    const [resetBtnText, setResetBtnText] = useState("Reset bar position");

    return (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Settings</h3>

            <label style={{ display: 'block', marginBottom: 10, marginTop: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Refresh cadence (minutes)</div>
                <input
                    type="number" min={1}
                    value={Math.max(1, Math.round(settings.pollingSeconds / 60))}
                    onChange={e => {
                        const mins = Math.max(1, Number(e.target.value) || 1);
                        setSettings({ ...settings, pollingSeconds: mins * 60 });
                    }}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: 140 }}
                />
                <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                    Background updates run at least once per minute (Chrome limit).
                </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 4 }}>
                <input
                    type="checkbox"
                    checked={settings.compact}
                    onChange={e => setSettings({ ...settings, compact: e.target.checked })}
                />
                <span>Compact bar</span>
            </label>
            <div style={{ color: '#64748b', fontSize: 10 }}>
                Shrink the bar height and spacing for a tighter fit. (Doesn't display team names, only logos)
            </div>

            <label style={{ display: 'block', marginBottom: 12, marginTop: 20 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Theme</div>
                <select
                    value={settings.theme}
                    onChange={e => setSettings({ ...settings, theme: e.target.value as Theme })}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', width: 180 }}
                >
                    <option value="auto">Auto (system)</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                </select>
                <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                    Auto follows your OS appearance.
                </div>
            </label>

            <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <strong>Following ({selected.length}):</strong>
                    <button
                        type="button"
                        disabled={!selected.length}
                        onClick={() => {
                            if (selected.length && confirm(`Remove all ${selected.length} followed team(s)?`)) {
                                onClearAllSelected();
                            }
                        }}
                        title="Remove all followed teams"
                        style={{
                            padding: "4px 10px",
                            borderRadius: 9999,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            color: "#0f172a",
                            fontSize: 12,
                            cursor: selected.length ? "pointer" : "not-allowed",
                        }}
                    >
                        Clear all
                    </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {selected.map(t => (
                        <span key={`${t.league}:${t.teamId}`}
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                border: "1px solid #e5e7eb", borderRadius: 9999, padding: "4px 10px",
                                background: "#f8fafc", color: "#0f172a",
                            }}>
                            <img
                                src={t.logo ?? logoFor(t.league, t.teamId)}
                                alt={t.name}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                    const img = e.currentTarget as HTMLImageElement;
                                    if (img.dataset.fallback !== "1") {
                                        img.dataset.fallback = "1";
                                        img.src = logoFor(t.league, t.teamId);
                                    } else {
                                        img.style.display = "none";
                                    }
                                }}
                                style={{ width: 16, height: 16, borderRadius: 9999, objectFit: "cover", background: "#fff" }}
                            />
                            {t.teamId}&nbsp;·&nbsp;{t.name}
                            <button
                                type="button"
                                onClick={() => removeTeam(t)}
                                aria-label={`Unfollow ${t.name}`}
                                title="Remove"
                                style={{
                                    marginLeft: 6,
                                    width: 18, height: 18,
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    borderRadius: 9999, border: "1px solid #94a3b8",
                                    background: "#fff", color: "#334155", fontSize: 12, lineHeight: 1, padding: 0, cursor: "pointer",
                                }}
                            >
                                x
                            </button>
                        </span>
                    ))}
                    {!selected.length && <span style={{ color: '#64748b' }}>None yet</span>}
                </div>
            </div>

            <div style={{ marginTop: 16 }}>
                <button
                    onClick={async () => {
                        await onResetBarPos();
                        setResetBtnText("Reset ✓");
                        setTimeout(() => setResetBtnText("Reset bar position"), 900);
                    }}
                    title="Reset bar position to default"
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
                >
                    {resetBtnText}
                </button>
            </div>
        </div>
    );
}
