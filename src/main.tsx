import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { CloudApiProvider } from "./app/providers/CloudApiProvider";
import { RepositoryProvider } from "./app/providers/RepositoryProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CloudApiProvider>
      <RepositoryProvider>
        <App />
      </RepositoryProvider>
    </CloudApiProvider>
  </StrictMode>,
);
