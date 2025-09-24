import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";

function Popup() {
  const [loading, setLoading] = useState(true);
  const [on, setOn] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get(["settings"]).then((res) => {
      setOn(res.settings?.showBar ?? true);
      setLoading(false);
    });
  }, []);

  const toggle = async () => {
    const res = await chrome.storage.sync.get(["settings"]);
    const next = { ...(res.settings ?? {}), showBar: !on };
    await chrome.storage.sync.set({ settings: next });
    setOn(!on);
  };

  return (
    <div style={{ padding: 12, minWidth: 220, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif" }}>
      <h3 style={{ margin: 0 }}>SportScanner</h3>
      <button
        disabled={loading}
        onClick={toggle}
        style={{
          width: "100%", marginTop: 10, padding: "10px 12px",
          background: on ? "#16a34a" : "#374151", color: "white",
          border: 0, borderRadius: 8, cursor: "pointer"
        }}
      >
        {on ? "Turn OFF bar" : "Turn ON bar"}
      </button>

      <div style={{ marginTop: 10, fontSize: 12 }}>
        <a href="options.html" target="_blank" rel="noreferrer">Open Options</a>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
