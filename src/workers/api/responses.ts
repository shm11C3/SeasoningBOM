export type ApiErrorCode =
  | "auth_misconfigured"
  | "internal_error"
  | "method_not_allowed"
  | "not_authenticated"
  | "not_found"
  | "not_implemented"
  | "profile_already_exists"
  | "profile_not_initialized"
  | "repository_already_exists"
  | "username_reserved"
  | "validation_failed";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(`${JSON.stringify(body, null, 2)}\n`, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init.headers,
    },
  });
}

export function notFound(pathname: string): Response {
  return errorResponse(404, "not_found", `No API route matches ${pathname}.`);
}

export function repositoryNotFound(): Response {
  return errorResponse(404, "not_found", "Repository not found.");
}

export function methodNotAllowed(allowedMethods: readonly string[]): Response {
  return errorResponse(405, "method_not_allowed", "This HTTP method is not allowed.", {
    Allow: allowedMethods.join(", "),
  });
}

export function unauthorized(message = "Sign in with Clerk to access this endpoint."): Response {
  return errorResponse(401, "not_authenticated", message);
}

export function notImplemented(message: string): Response {
  return errorResponse(501, "not_implemented", message);
}

export function authMisconfigured(): Response {
  return errorResponse(500, "auth_misconfigured", "Authentication is not configured.");
}

export function badRequest(message: string): Response {
  return errorResponse(400, "validation_failed", message);
}

export function conflict(
  code: "profile_already_exists" | "repository_already_exists" | "username_reserved",
  message: string,
): Response {
  return errorResponse(409, code, message);
}

export function profileNotInitialized(): Response {
  return errorResponse(
    404,
    "profile_not_initialized",
    "Create a profile before accessing this endpoint.",
  );
}

export function serverError(message = "Unexpected server error."): Response {
  return errorResponse(500, "internal_error", message);
}

function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers: HeadersInit = {},
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    } satisfies ApiErrorBody,
    {
      headers,
      status,
    },
  );
}
