import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AuthProvider } from "./app/providers/AuthProvider";
import { CloudApiProvider } from "./app/providers/CloudApiProvider";
import { RepositoryProvider } from "./app/providers/RepositoryProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <CloudApiProvider>
        <RepositoryProvider>
          <App />
        </RepositoryProvider>
      </CloudApiProvider>
    </AuthProvider>
  </StrictMode>,
);
