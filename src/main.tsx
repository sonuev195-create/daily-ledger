import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply saved font size
const savedSize = localStorage.getItem('app-font-size') || 'medium';
const sizeMap: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };
document.documentElement.style.fontSize = sizeMap[savedSize] || '16px';

// Mobile keyboard fix: scroll focused input into view
if ('visualViewport' in window && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
  const scrollIntoInput = () => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)) {
      setTimeout(() => {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };
  window.visualViewport?.addEventListener('resize', scrollIntoInput);
}

createRoot(document.getElementById("root")!).render(<App />);
