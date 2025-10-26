//src/options/components/InfoBadge.tsx
export function InfoBadge({ text }: { text: string }) {
    return (
        <span
            style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 12, height: 12, borderRadius: "50%",
                border: "1px solid #94a3b8",
                background: "#f8fafc", color: "#334155", fontSize: 11,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                zIndex: 2,
            }}
            onMouseEnter={(e) => {
                const tooltip = document.createElement("div");
                tooltip.textContent = text;
                Object.assign(tooltip.style, {
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    transform: "translateY(6px)",
                    background: "#0f172a",
                    color: "#fff",
                    fontSize: "12px",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    whiteSpace: "nowrap",
                    zIndex: "999",
                    pointerEvents: "none",
                    boxShadow: "0 6px 16px rgba(15,23,42,.2)",
                });
                tooltip.className = "tooltip";
                e.currentTarget.appendChild(tooltip);
            }}
            onMouseLeave={(e) => {
                const t = e.currentTarget.querySelector(".tooltip");
                if (t) t.remove();
            }}
            aria-label={text}
            title={text}
            role="img"
        >
            i
        </span>
    );
}
