//src/options/components/TeamGrid.tsx
import type { FollowedTeam, League } from "../../lib/types";
import { logoFor } from "../utils/logoFor";
import { ButtonWithInfo } from "./ButtonWithInfo";

type Props = {
    leagueLabel: string;
    sortedVisible: FollowedTeam[];
    selectedKey: (t: FollowedTeam) => string;
    selectedIds: Set<string>;
    toggleTeam: (t: FollowedTeam) => void;
    selectAllVisible: (list: FollowedTeam[]) => void;
    clearAllVisible: (list: FollowedTeam[]) => void;
    gameFilter: "none" | "today" | "live";
    search: string;
};

export function TeamGrid({
    leagueLabel, sortedVisible, selectedKey, selectedIds,
    toggleTeam, selectAllVisible, clearAllVisible, gameFilter, search
}: Props) {
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>Teams — {leagueLabel}</h3>
                    <span style={{ color: '#64748b', fontSize: 12 }}>{sortedVisible.length} shown</span>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                    <ButtonWithInfo onClick={() => selectAllVisible(sortedVisible)} tooltip="Follow all teams currently visible in this list.">
                        Select all
                    </ButtonWithInfo>
                    <ButtonWithInfo onClick={() => clearAllVisible(sortedVisible)} tooltip="Unfollow all teams currently visible in this list.">
                        Clear all selected
                    </ButtonWithInfo>
                </div>
            </div>

            <div id="teams-panel">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                    {sortedVisible.map(t => {
                        const checked = selectedIds.has(selectedKey(t));
                        return (
                            <label
                                key={selectedKey(t)}
                                style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 10,
                                    background: checked ? "#f1f5f9" : "#fff", cursor: "pointer"
                                }}
                            >
                                <input type="checkbox" checked={checked} onChange={() => toggleTeam(t)} />
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
                                <span style={{ fontWeight: 700, width: 42 }}>{t.teamId}</span>
                                <span style={{ opacity: .9 }}>{t.name}</span>
                                <span style={{ marginLeft: 'auto', color: '#64748b', fontSize: 12 }}>
                                    {(t.league as League).toUpperCase()}
                                </span>
                            </label>
                        );
                    })}
                    {!sortedVisible.length && (
                        <div style={{ color: '#64748b' }}>
                            {gameFilter === "today"
                                ? "No teams have a game today in this scope."
                                : gameFilter === "live"
                                    ? "No teams are currently live in this scope."
                                    : `No teams match your filters${search ? ` for “${search}”` : ""}.`}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
