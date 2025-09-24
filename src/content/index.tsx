import { createRoot } from "react-dom/client";

// Create a shadow root so site CSS can't affect us
const host = document.createElement("div");
const shadow = host.attachShadow({ mode: "open" });
const mount = document.createElement("div");
shadow.appendChild(mount);
document.documentElement.appendChild(host);

function Bar() {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        background: "#111827",
        color: "white",
        padding: "8px 12px",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif",
        boxShadow: "0 -6px 20px rgba(0,0,0,.25)",
      }}
    >
      SportScanner — bottom bar mounted ✅
    </div>
  );
}

createRoot(mount).render(<Bar />);
