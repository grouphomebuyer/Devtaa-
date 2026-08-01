/**
 * TanStack Router types `to` against the generated route tree, which means a
 * path held in configuration (navigation, breadcrumbs, notification deep
 * links) cannot satisfy it structurally.
 *
 * This is the **only** sanctioned cast in the application. Route-literal call
 * sites (`<Link to="/projects/$projectId" params={{ projectId }} />`) keep full
 * type safety and must not use it.
 */
export const asRoute = (path: string) => path as never;
