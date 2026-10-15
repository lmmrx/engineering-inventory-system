import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Copy server/.env.example to server/.env and set it.");
}
if (JWT_SECRET.length < 32) {
  // Not fatal, so a short secret can't take production down on deploy — but a
  // short HMAC secret can be brute-forced offline from any token it signed.
  console.warn("WARNING: JWT_SECRET is shorter than 32 characters. Set a long random value (e.g. `openssl rand -hex 32`).");
}

export type Role = "ADMIN" | "MANAGER" | "STAFF";

/** What a signed token carries: just who it is and which session generation. */
interface TokenClaims {
  userId: string;
  tv: number;
}

/**
 * The signed-in user as the routes see it. Role and scope are loaded fresh
 * from the database on every request (see requireAuth), never trusted from
 * the token, so a demotion or move takes effect immediately.
 */
export interface AuthTokenPayload {
  userId: string;
  role: Role;
  hotelId: string | null;
  departmentId: string | null;
}

export function signToken(user: { id: string; tokenVersion: number }): string {
  const claims: TokenClaims = { userId: user.id, tv: user.tokenVersion };
  return jwt.sign(claims, JWT_SECRET as string, { expiresIn: "12h", algorithm: "HS256" });
}

export function verifyToken(token: string): TokenClaims {
  const decoded = jwt.verify(token, JWT_SECRET as string, { algorithms: ["HS256"] }) as Partial<TokenClaims>;
  if (typeof decoded.userId !== "string") throw new Error("Malformed token");
  // Tokens issued before session versions existed carry no tv; treat them as
  // generation 0 so a deploy doesn't sign everyone out.
  return { userId: decoded.userId, tv: decoded.tv ?? 0 };
}
