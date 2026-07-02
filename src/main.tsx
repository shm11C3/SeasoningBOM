import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { RepositoryProvider } from "./app/providers/RepositoryProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RepositoryProvider>
      <App />
    </RepositoryProvider>
  </StrictMode>,
);
