// src/popup/components/Row.tsx
export function Row({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            {children}
        </div>
    );
}
