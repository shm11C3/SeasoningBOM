import {
  D1UserProfileRepository,
  type UserProfile,
  type UserProfileRepository,
} from "../../repositories/cloudflare-d1/D1UserProfileRepository";
import type { ClerkSession } from "../auth/clerk";
import {
  badRequest,
  conflict,
  jsonResponse,
  profileNotInitialized,
  serverError,
} from "./responses";
import type { WorkerEnv } from "./types";

export type ProfileRouteOptions = {
  createProfileId?: () => string;
  now?: () => Date;
  userProfiles?: UserProfileRepository;
};

type ProfileResponseBody = {
  profile: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
    contributionVisibility: UserProfile["contributionVisibility"];
    createdAt: string;
    updatedAt: string;
  };
};

type ProfileBootstrapBody = {
  avatarUrl?: unknown;
  displayName?: unknown;
  username?: unknown;
};

const reservedUserHandles = new Set([
  "api",
  "backup",
  "eol",
  "inventory",
  "new",
  "repositories",
  "security",
  "users",
]);
const userHandlePattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function handleGetMe(
  session: ClerkSession,
  env: WorkerEnv,
  options: ProfileRouteOptions = {},
): Promise<Response> {
  const result = await requireBootstrappedProfile(session, env, options);
  if (!result.ok) {
    return result.response;
  }

  return jsonResponse(serializeProfileResponse(result.profile));
}

export async function requireBootstrappedProfile(
  session: ClerkSession,
  env: WorkerEnv,
  options: ProfileRouteOptions = {},
): Promise<{ ok: true; profile: UserProfile } | { ok: false; response: Response }> {
  const profiles = getUserProfileRepository(env, options);
  const profile = await safelyReadProfile(() =>
    profiles.findByAuthSubject("clerk", session.authSubject),
  );
  if (profile === false) {
    return { ok: false, response: serverError("Failed to load profile.") };
  }

  if (!profile) {
    return { ok: false, response: profileNotInitialized() };
  }

  return { ok: true, profile };
}

export async function handlePostMeProfile(
  request: Request,
  session: ClerkSession,
  env: WorkerEnv,
  options: ProfileRouteOptions = {},
): Promise<Response> {
  const profiles = getUserProfileRepository(env, options);
  const existingProfile = await safelyReadProfile(() =>
    profiles.findByAuthSubject("clerk", session.authSubject),
  );
  if (existingProfile === false) {
    return serverError("Failed to create profile.");
  }
  if (existingProfile) {
    return conflict("profile_already_exists", "A profile already exists for this Clerk user.");
  }

  const body = await readProfileBootstrapBody(request);
  if (!body.ok) {
    return badRequest(body.message);
  }

  const username = normalizeUserHandle(body.value.username);
  if (!username) {
    return badRequest("Username must be 1-39 lowercase letters, numbers, or hyphens.");
  }

  const displayName = normalizeOptionalText(body.value.displayName, 80);
  if (displayName === false) {
    return badRequest("Display name must be 80 characters or fewer.");
  }

  const avatarUrl = normalizeOptionalUrl(body.value.avatarUrl);
  if (avatarUrl === false) {
    return badRequest("Avatar URL must be a valid http or https URL.");
  }

  const reservedProfile = await safelyReadProfile(() => profiles.findByUsername(username));
  if (reservedProfile === false) {
    return serverError("Failed to create profile.");
  }
  if (reservedProfile) {
    return conflict("username_reserved", "This User Handle is already reserved.");
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  const id = options.createProfileId?.() ?? crypto.randomUUID();

  try {
    const profile = await profiles.create({
      authProvider: "clerk",
      authSubject: session.authSubject,
      avatarUrl: avatarUrl || undefined,
      displayName: displayName || undefined,
      id,
      now,
      username,
    });

    return jsonResponse(serializeProfileResponse(profile), { status: 201 });
  } catch {
    try {
      const existingProfileAfterCreate = await profiles.findByAuthSubject(
        "clerk",
        session.authSubject,
      );
      if (existingProfileAfterCreate) {
        return conflict("profile_already_exists", "A profile already exists for this Clerk user.");
      }

      const reservedProfileAfterCreate = await profiles.findByUsername(username);
      if (reservedProfileAfterCreate) {
        return conflict("username_reserved", "This User Handle is already reserved.");
      }
    } catch {
      return serverError("Failed to create profile.");
    }

    return serverError("Failed to create profile.");
  }
}

export function normalizeUserHandle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const username = value.trim().toLowerCase();
  if (
    username.length < 1 ||
    username.length > 39 ||
    !userHandlePattern.test(username) ||
    reservedUserHandles.has(username)
  ) {
    return null;
  }

  return username;
}

async function safelyReadProfile(
  read: () => Promise<UserProfile | null>,
): Promise<UserProfile | null | false> {
  try {
    return await read();
  } catch {
    return false;
  }
}

function getUserProfileRepository(
  env: WorkerEnv,
  options: ProfileRouteOptions,
): UserProfileRepository {
  return options.userProfiles ?? new D1UserProfileRepository(env.DB);
}

function serializeProfileResponse(profile: UserProfile): ProfileResponseBody {
  return {
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      contributionVisibility: profile.contributionVisibility,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  };
}

async function readProfileBootstrapBody(
  request: Request,
): Promise<{ ok: true; value: ProfileBootstrapBody } | { message: string; ok: false }> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { message: "Request body must be a JSON object.", ok: false };
    }

    return { ok: true, value: body };
  } catch {
    return { message: "Request body must be valid JSON.", ok: false };
  }
}

function normalizeOptionalText(value: unknown, maxLength: number): string | false {
  if (typeof value === "undefined" || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : false;
}

function normalizeOptionalUrl(value: unknown): string | false {
  if (typeof value === "undefined" || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : false;
  } catch {
    return false;
  }
}
