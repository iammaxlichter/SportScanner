import { createRoot } from "react-dom/client";

function Popup() {
  return (
    <div style={{ padding: 12, minWidth: 460, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif" }}>
      <h1 style={{ margin: 0, fontSize: 16 }}>SportScanner</h1>
      <p style={{ marginTop: 8 }}>Hello from the popup ✅</p>
      <a href="options.html" target="_blank" rel="noreferrer">Open Options</a>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
