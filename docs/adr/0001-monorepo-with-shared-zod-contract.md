# ADR 0001: Monorepo with a shared Zod contract package

- Status: Accepted
- Date: 2026-10-13

## Context

The API and the web app exchange many DTOs (employees, list queries, insights, import results) and
must agree on validation rules such as email format, salary bounds and date formats. Two separately
maintained copies of these rules drift, and the web app would only find out at runtime.

## Decision

Use a pnpm workspace with `apps/api`, `apps/web` and `packages/shared`. `@acme/shared` holds the Zod
schemas, the inferred DTO types, the enums and the money utilities. Both apps import it as
TypeScript source: Next.js through `transpilePackages`, the API bundled by tsup with `noExternal`.
No Turborepo: `pnpm -r` is enough for three packages.

## Consequences

- One definition per rule: the API validates requests with the same schema the form uses, and the
  web client validates every response against the shared response schemas.
- A contract change breaks the build of whichever side is out of date, at compile time.
- The shared package has no build step, which keeps the loop fast but requires both consumers to
  compile TypeScript from `node_modules`.

## Alternatives considered

- **Separate repositories** with a published package: versioning overhead with no benefit for a
  single team.
- **OpenAPI with code generation:** stronger cross-language story, but adds a generator and a spec
  file to keep in sync; Zod gives runtime validation and types from one source.
