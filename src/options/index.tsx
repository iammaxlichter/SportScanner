import { createRoot } from "react-dom/client";

function Options() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>SportScanner Options</h1>
      <p>Team selection & settings will go here.</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Options />);
