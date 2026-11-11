import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import "./index.css";
import { followSystemThemeColor } from "./ui/components/theme.ts";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

followSystemThemeColor();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
