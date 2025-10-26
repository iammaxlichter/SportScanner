//src/options/components/ButtonWithInfo.tsx
import React from "react";
import { InfoBadge } from "./InfoBadge";

const chipBtn: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
};

type ButtonWithInfoProps = {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    tooltip: string;
    style?: React.CSSProperties;
    disabled?: boolean;
};

export function ButtonWithInfo({ children, onClick, tooltip, style, disabled }: ButtonWithInfoProps) {
    return (
        <span style={{ position: "relative", display: "inline-block" }}>
            <button onClick={onClick} style={{ ...chipBtn, ...style }} disabled={disabled}>
                {children}
            </button>
            <InfoBadge text={tooltip} />
        </span>
    );
}
