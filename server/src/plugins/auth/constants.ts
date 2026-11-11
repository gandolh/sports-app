/** The session cookie. Unique in the estate, because every app shares one origin. */
export const SESSION_COOKIE_NAME = "sports_app_session";

/** Where the library's routes live, as Fastify sees them. */
export const ROUTE_PREFIX = "/api/auth";

/**
 * Whether a signed-in user may rename themselves (`POST /api/auth/username`).
 *
 * ward-auth turns that route on by default since 0.4.0. Here it stays off: the
 * snapshot stream is keyed by the username, not the user id, so a rename would
 * leave the person's history under the old name and open an empty stream under
 * the new one. A rename screen would have to move the stream with the name, and
 * offering one is the owner's choice.
 */
export const ALLOW_RENAME = false;

/** What a new user created by this service holds. The app has no roles of its own. */
export const DEFAULT_ROLE = "user";

/**
 * The reason a session is refused for a name the document schema cannot hold.
 * The login page words it; nothing here does.
 */
export const UNSUPPORTED_USERNAME = "unsupported_username";
