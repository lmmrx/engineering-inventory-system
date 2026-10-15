/**
 * Break-glass recovery for an Admin who can't sign in (forgotten password,
 * locked out, or accidentally disabled) when no other Admin can help.
 *
 *   npm run admin:recover --workspace server -- admin@example.com
 *
 * Run it where DATABASE_URL points at the affected database (on Render: the
 * service's Shell tab). It re-enables the account, lifts any lockout, signs
 * out all of its sessions, and sets a random one-time password that must be
 * changed at the next sign-in. Access to the server is the authorization here,
 * and the action is recorded in the audit log.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npm run admin:recover --workspace server -- <admin email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}.`);
    process.exit(1);
  }
  if (user.role !== "ADMIN") {
    console.error(`${email} is not an Admin. Ask an Admin to unlock or reset this account from Settings → Users.`);
    process.exit(1);
  }

  // 18 random bytes → 24 base64url characters; comfortably passes the password policy.
  const temporaryPassword = randomBytes(18).toString("base64url");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
      mustChangePassword: true,
      disabledAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
  });
  await prisma.auditLog.create({
    data: {
      action: "user.recovered",
      entityType: "user",
      entityId: user.id,
      summary: `Recovered admin account ${user.email} from the server console (re-enabled, unlocked, password reset)`,
      hotelId: user.hotelId,
      departmentId: user.departmentId,
    },
  });

  console.log(`Recovered ${user.email}.`);
  console.log(`One-time password: ${temporaryPassword}`);
  console.log("It must be changed at the next sign-in. All previous sessions have been signed out.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
