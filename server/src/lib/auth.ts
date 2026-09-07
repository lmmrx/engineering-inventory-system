import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Copy server/.env.example to server/.env and set it.");
}

export type Role = "ADMIN" | "MANAGER" | "STAFF";

export interface AuthTokenPayload {
  userId: string;
  role: Role;
  hotelId: string | null;
  departmentId: string | null;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "12h" });
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as AuthTokenPayload;
}
