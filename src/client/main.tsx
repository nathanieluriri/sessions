import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./kitchen.css";
import "./pages.css";
import "./landing.css";
import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";
import flagFont from "country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url";

import { loadAnalytics, readConsent } from "./lib/consent";

polyfillCountryFlagEmojis("Twemoji Country Flags", flagFont);
if (readConsent() === "all") loadAnalytics();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
