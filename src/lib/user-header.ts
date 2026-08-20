/**
 * Header the proxy uses to hand the verified user id to server components.
 *
 * Its own file so both the proxy and the page helpers can import the name
 * without either pulling in the other's runtime dependencies.
 */
export const USER_HEADER = "x-tuition-user";
