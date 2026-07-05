export type ApiErrorCode =
  | "clerk_session_verification_not_wired"
  | "method_not_allowed"
  | "not_authenticated"
  | "not_found"
  | "not_implemented";

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

export function clerkSessionVerificationNotWired(): Response {
  return errorResponse(
    501,
    "clerk_session_verification_not_wired",
    "Clerk session verification is not wired yet.",
  );
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
