import { handleApiRequest } from "./router";
import type { WorkerEnv } from "./types";

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleApiRequest(request, env);
  },
};
