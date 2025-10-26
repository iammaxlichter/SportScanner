// src/content/index.tsx
import { createRoot } from "react-dom/client";
import { ensureMount } from "./mount";
import ScoreBar from "./ui/ScoreBar";

const mount = ensureMount();
createRoot(mount).render(<ScoreBar />);
