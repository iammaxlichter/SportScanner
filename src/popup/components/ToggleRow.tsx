// src/popup/components/ToggleRow.tsx
type Props = {
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (val: boolean) => void;
    hint?: string;
};

export function ToggleRow({ label, checked, disabled, onChange, hint }: Props) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
            />
            <span>{label}</span>
            {hint && <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>{hint}</span>}
        </div>
    );
}
