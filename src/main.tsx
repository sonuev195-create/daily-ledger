import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply saved font size
const savedSize = localStorage.getItem('app-font-size') || 'medium';
const sizeMap: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };
document.documentElement.style.fontSize = sizeMap[savedSize] || '16px';

createRoot(document.getElementById("root")!).render(<App />);
