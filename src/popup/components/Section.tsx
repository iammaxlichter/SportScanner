// src/popup/components/Section.tsx
type Props = { title: string; children: React.ReactNode };

export function Section({ title, children }: Props) {
    return (
        <section style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#475569", marginBottom: 6 }}>{title}</div>
            {children}
        </section>
    );
}
