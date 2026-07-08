import {
  type CloudContributionEvent,
  type ContributionDateCount,
  type ContributionRepository,
  D1ContributionRepository,
} from "../../repositories/cloudflare-d1/D1ContributionRepository";
import type { ContributionVisibility } from "../../repositories/cloudflare-d1/D1UserProfileRepository";
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
  profileNotFound,
  profileNotInitialized,
  serverError,
} from "./responses";
import type { WorkerEnv } from "./types";

export type ProfileRouteOptions = {
  contributions?: ContributionRepository;
  createProfileId?: () => string;
  now?: () => Date;
  userProfiles?: UserProfileRepository;
};

type SerializedProfile = {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  contributionVisibility: UserProfile["contributionVisibility"];
  createdAt: string;
  updatedAt: string;
};

type ProfileResponseBody = {
  profile: SerializedProfile;
};

type ContributionLevel = 0 | 1 | 2 | 3 | 4;

type SerializedContributionDay = {
  date: string;
  contributionCount: number;
  level: ContributionLevel;
};

type SerializedContributionEvent = {
  id: string;
  eventType: CloudContributionEvent["eventType"];
  repositoryId?: string;
  occurredOn: string;
  occurredAt: string;
  contributionCount: number;
  visibility: ContributionVisibility;
  metadata: Record<string, unknown>;
};

type ContributionListResponseBody = {
  profile: SerializedProfile;
  from: string;
  to: string;
  totalContributions: number;
  days: SerializedContributionDay[];
  detailsVisible: boolean;
};

type ContributionDayResponseBody = {
  profile: SerializedProfile;
  date: string;
  contributionCount: number;
  level: ContributionLevel;
  events: SerializedContributionEvent[];
  detailsVisible: boolean;
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
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const maxContributionRangeDays = 366;

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

export async function handleGetPublicProfile(
  username: string,
  env: WorkerEnv,
  options: ProfileRouteOptions = {},
): Promise<Response> {
  const profileResult = await findProfileByUsername(
    username,
    env,
    options,
    "Failed to load profile.",
  );
  if (!profileResult.ok) {
    return profileResult.response;
  }

  return jsonResponse(serializeProfileResponse(profileResult.profile));
}

export async function handleGetUserContributions(
  request: Request,
  username: string,
  viewer: UserProfile | null,
  env: WorkerEnv,
  options: ProfileRouteOptions = {},
): Promise<Response> {
  const profileResult = await findProfileByUsername(
    username,
    env,
    options,
    "Failed to load contributions.",
  );
  if (!profileResult.ok) {
    return profileResult.response;
  }

  if (!canViewContributionGraph(profileResult.profile, viewer)) {
    return profileNotFound();
  }

  const range = normalizeContributionRange(request, options.now?.() ?? new Date());
  if (!range.ok) {
    return badRequest(range.message);
  }

  const contributions = getContributionRepository(env, options);
  try {
    const counts = await contributions.listCountsByDate({
      from: range.value.from,
      to: range.value.to,
      userId: profileResult.profile.id,
    });
    const days = buildContributionDays(counts, range.value.from, range.value.to);

    return jsonResponse({
      days,
      detailsVisible: canViewContributionDetails(profileResult.profile, viewer),
      from: range.value.from,
      profile: serializeProfile(profileResult.profile),
      to: range.value.to,
      totalContributions: days.reduce((total, day) => total + day.contributionCount, 0),
    } satisfies ContributionListResponseBody);
  } catch {
    return serverError("Failed to load contributions.");
  }
}

export async function handleGetUserContributionDay(
  username: string,
  date: string,
  viewer: UserProfile | null,
  env: WorkerEnv,
  options: ProfileRouteOptions = {},
): Promise<Response> {
  const normalizedDate = normalizeDateKey(date);
  if (!normalizedDate) {
    return badRequest("Contribution date must use YYYY-MM-DD.");
  }

  const profileResult = await findProfileByUsername(
    username,
    env,
    options,
    "Failed to load contribution day.",
  );
  if (!profileResult.ok) {
    return profileResult.response;
  }

  if (!canViewContributionGraph(profileResult.profile, viewer)) {
    return profileNotFound();
  }

  const contributions = getContributionRepository(env, options);
  const detailsVisible = canViewContributionDetails(profileResult.profile, viewer);

  try {
    const [counts, events] = await Promise.all([
      contributions.listCountsByDate({
        from: normalizedDate,
        to: normalizedDate,
        userId: profileResult.profile.id,
      }),
      detailsVisible
        ? contributions.listEventsForDate({
            occurredOn: normalizedDate,
            publicOnly: viewer?.id !== profileResult.profile.id,
            userId: profileResult.profile.id,
          })
        : Promise.resolve([]),
    ]);
    const contributionCount = counts[0]?.contributionCount ?? 0;

    return jsonResponse({
      contributionCount,
      date: normalizedDate,
      detailsVisible,
      events: events.map(serializeContributionEvent),
      level: contributionLevel(contributionCount),
      profile: serializeProfile(profileResult.profile),
    } satisfies ContributionDayResponseBody);
  } catch {
    return serverError("Failed to load contribution day.");
  }
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

function getContributionRepository(
  env: WorkerEnv,
  options: ProfileRouteOptions,
): ContributionRepository {
  return options.contributions ?? new D1ContributionRepository(env.DB);
}

async function findProfileByUsername(
  username: string,
  env: WorkerEnv,
  options: ProfileRouteOptions,
  failureMessage: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; response: Response }> {
  const profiles = getUserProfileRepository(env, options);
  const profile = await safelyReadProfile(() => profiles.findByUsername(username));
  if (profile === false) {
    return { ok: false, response: serverError(failureMessage) };
  }

  if (!profile) {
    return { ok: false, response: profileNotFound() };
  }

  return { ok: true, profile };
}

function serializeProfileResponse(profile: UserProfile): ProfileResponseBody {
  return {
    profile: serializeProfile(profile),
  };
}

function serializeProfile(profile: UserProfile): SerializedProfile {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    contributionVisibility: profile.contributionVisibility,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function serializeContributionEvent(event: CloudContributionEvent): SerializedContributionEvent {
  return {
    contributionCount: event.contributionCount,
    eventType: event.eventType,
    id: event.id,
    metadata: event.metadata,
    occurredAt: event.occurredAt,
    occurredOn: event.occurredOn,
    repositoryId: event.repositoryId,
    visibility: event.visibility,
  };
}

function canViewContributionGraph(profile: UserProfile, viewer: UserProfile | null): boolean {
  return profile.contributionVisibility !== "private" || viewer?.id === profile.id;
}

function canViewContributionDetails(profile: UserProfile, viewer: UserProfile | null): boolean {
  return viewer?.id === profile.id || profile.contributionVisibility === "public";
}

function normalizeContributionRange(
  request: Request,
  now: Date,
): { ok: true; value: { from: string; to: string } } | { message: string; ok: false } {
  const params = new URL(request.url).searchParams;
  const defaultTo = toDateKey(now);
  const defaultFrom = addDays(defaultTo, -364);
  const from = normalizeDateKey(params.get("from") ?? defaultFrom);
  const to = normalizeDateKey(params.get("to") ?? defaultTo);

  if (!from || !to) {
    return { message: "Contribution range must use YYYY-MM-DD dates.", ok: false };
  }

  const span = differenceInDays(from, to);
  if (span < 0) {
    return { message: "Contribution range must have from before or equal to to.", ok: false };
  }
  if (span >= maxContributionRangeDays) {
    return { message: "Contribution range must span 366 days or fewer.", ok: false };
  }

  return { ok: true, value: { from, to } };
}

function buildContributionDays(
  counts: ContributionDateCount[],
  from: string,
  to: string,
): SerializedContributionDay[] {
  const countsByDate = new Map(counts.map((count) => [count.occurredOn, count.contributionCount]));
  const days: SerializedContributionDay[] = [];
  const span = differenceInDays(from, to);

  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(from, offset);
    const contributionCount = countsByDate.get(date) ?? 0;
    days.push({
      contributionCount,
      date,
      level: contributionLevel(contributionCount),
    });
  }

  return days;
}

function contributionLevel(count: number): ContributionLevel {
  if (count >= 7) {
    return 4;
  }
  if (count >= 4) {
    return 3;
  }
  if (count >= 2) {
    return 2;
  }
  if (count >= 1) {
    return 1;
  }
  return 0;
}

function normalizeDateKey(value: string): string | null {
  if (!dateKeyPattern.test(value)) {
    return null;
  }

  const date = dateFromKey(value);
  return toDateKey(date) === value ? value : null;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function differenceInDays(from: string, to: string): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / millisecondsPerDay);
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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
