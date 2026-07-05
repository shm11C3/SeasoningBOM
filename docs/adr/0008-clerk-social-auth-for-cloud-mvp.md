# ADR 0008: Clerk social authentication for the Cloud MVP

## Status

Accepted

## Context

ADR 0005 originally selected GitHub OAuth for the Cloud D1 MVP. The product still uses GitHub-like repository UI, but SeasoningBOM does not need to read or write GitHub repositories, issues, profiles, or organizations.

The main authentication risk for this joke application is not that a SeasoningBOM account itself is high value. The larger avoidable risk is collecting first-party passwords that could later leak, be added to password dictionaries, or be reused in credential stuffing attacks against other services.

The team wants the lowest total cost option across money, implementation time, operations, and security responsibility. Some paid scale is acceptable after meaningful usage. Clerk's hosted authentication and React integration reduce implementation and operations work, and its free tier is large enough for the MVP. Auth.js with D1 remains a possible lower-cash-cost fallback, but it would make SeasoningBOM operate auth tables, sessions, secrets, migrations, and callback handling itself.

## Decision

Use Clerk as the primary authentication provider for the hosted Cloud D1 MVP.

P0 sign-in methods:

- Google social login
- GitHub social login

P0 forbidden sign-in methods:

- first-party email/password
- Auth.js Credentials-style password authentication
- SMS / phone login
- custom password reset flows

SeasoningBOM will not collect, hash, store, reset, or check user passwords.

Clerk owns:

- hosted or prebuilt sign-in / sign-up UI
- sessions
- account linking
- provider credentials
- password and MFA concerns if the enabled provider handles them

SeasoningBOM owns:

- app profile data in `user_profiles`
- repository ownership
- public / private / unlisted authorization
- private inventory authorization
- stable SeasoningBOM User Handles

Use the following app identity mapping:

```text
auth_provider = "clerk"
auth_subject = Clerk user id
user_profiles.username = stable SeasoningBOM User Handle
```

`user_profiles.username` is the only value used for `/:owner/:repo` and `/users/:username` URLs. It is initialized from Clerk/provider profile hints or explicit user input, normalized before storage, and not automatically changed when a provider-side username, display name, or email changes.

Cloudflare Workers API endpoints must verify Clerk session tokens before accessing private data. Protected API handlers should use a shared auth helper that returns the current `user_profiles` row or rejects the request.

The profile bootstrap endpoint is the only exception: after Clerk sign-in, `POST /api/me/profile` may accept a valid Clerk session without an existing `user_profiles` row so it can reserve the initial User Handle and create the profile. Other private data endpoints must reject valid Clerk sessions that have not completed this profile bootstrap step.

Keep Auth.js + D1 documented only as a fallback if Clerk pricing, lock-in, or product needs change later. Do not implement Auth.js for P0 unless this ADR is superseded.

## Consequences

Positive:

- SeasoningBOM avoids becoming a source of leaked reusable passwords.
- P0 auth UI and session management are faster to ship.
- Cloudflare D1 remains the source of truth for app authorization and repository ownership.
- Future migration away from Clerk remains possible because app identity is isolated in `user_profiles`.

Negative:

- The hosted MVP depends on a third-party auth service.
- Clerk pricing and plan limits become operational inputs after the MVP grows.
- Workers must correctly validate Clerk session tokens and allowed origins.

## References

- Clerk pricing: https://clerk.com/pricing
- Clerk manual JWT verification: https://clerk.com/docs/guides/sessions/manual-jwt-verification
- Auth.js Cloudflare D1 adapter: https://authjs.dev/getting-started/adapters/d1
- OWASP Credential Stuffing Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html
