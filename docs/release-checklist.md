# Cloud MVP Release Checklist

Use this checklist for every production candidate. Do not bypass branch protection or deploy from an unreviewed commit.

## Repository

- [ ] `master` contains only reviewed and squash-merged changes.
- [ ] CodeRabbit has reviewed the release PR and actionable findings are resolved.
- [ ] CI `check`, `test`, `build`, and `e2e` jobs are green.
- [ ] `pnpm run check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` pass from a fresh clone.
- [ ] `LICENSE` and `CONTRIBUTING.md` are present.

## Cloudflare

- [ ] Remote D1 migrations are applied before public traffic is routed.
- [ ] `CLERK_JWT_KEY` and `CLERK_AUTHORIZED_PARTIES` are configured as Worker secrets.
- [ ] `CLERK_AUTHORIZED_PARTIES` exactly matches the HTTPS Pages custom origin.
- [ ] Pages is built with `VITE_SEASONINGBOM_API_BASE_URL=/api` and the production Clerk publishable key.
- [ ] The Worker handles `<custom-domain>/api/*` on the same origin as Pages.
- [ ] `/api/health` returns a successful JSON response through the production domain.

## Product Smoke Test

- [ ] An anonymous visitor can list and open a public Repository.
- [ ] An unlisted Repository opens by exact URL and does not appear in public listings.
- [ ] Another user cannot read a private Repository.
- [ ] Google and GitHub social sign-in work; email/password sign-in is not enabled.
- [ ] A first-time user can reserve a stable User Handle.
- [ ] The owner can create, edit, and delete a Repository with direct and transitive dependencies.
- [ ] A signed-in user can manage private Inventory and see `Your inventory audit`.
- [ ] Public visitors never receive Inventory Audit details.
- [ ] SeasoningBOM download excludes Inventory data.
- [ ] Star, Unstar, and Fork work; a Fork includes the complete dependency manifest.
- [ ] The profile Contribution graph respects `public`, `summary_only`, and `private` visibility.

## Safety And Presentation

- [ ] Unsupported and hazardous Inventory is excluded from recommendations and shopping-list availability.
- [ ] Food-safety copy does not encourage use of unsafe ingredients.
- [ ] Desktop and 390 px mobile layouts have no incoherent overlap or horizontal page overflow.
- [ ] Keyboard users can reach the skip link, navigation, repository tabs, forms, and actions.
- [ ] Public screenshots and example data contain no secrets, private Inventory, or real personal data.
