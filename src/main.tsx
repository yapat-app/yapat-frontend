import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import store from "./redux/store.ts";
import App from "./App.tsx";
import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { ResponsiveThemeProvider } from "./components/ResponsiveThemeProvider.tsx";

// Silence "Cannot close a closed AudioContext" errors thrown by the
// react-audio-spectrogram library on component unmount (third-party bug).
const _origClose = AudioContext.prototype.close;
AudioContext.prototype.close = function () {
  if (this.state === "closed") return Promise.resolve();
  return _origClose.call(this);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ResponsiveThemeProvider>
          <App />
        </ResponsiveThemeProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
