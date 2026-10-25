// Checks that the real API works on a RESTORED database before anyone relies
// on it: signs in as an existing Admin (with a token signed by the drill's own
// throwaway secret — no passwords needed) and reads every major area,
// including a profile photo.
//
//   API_URL=http://localhost:4000 JWT_SECRET=... ADMIN_ID=... ADMIN_TV=0 \
//   AVATAR_USER_ID=... node ops/backup/smoke-test.cjs
const jwt = require("jsonwebtoken");

const { API_URL, JWT_SECRET, ADMIN_ID, ADMIN_TV = "0", AVATAR_USER_ID } = process.env;
if (!API_URL || !JWT_SECRET || !ADMIN_ID) {
  console.error("API_URL, JWT_SECRET and ADMIN_ID are required");
  process.exit(2);
}

const token = jwt.sign({ userId: ADMIN_ID, tv: Number(ADMIN_TV) }, JWT_SECRET, { algorithm: "HS256", expiresIn: "10m" });
const headers = { Authorization: `Bearer ${token}` };
let failures = 0;

async function check(name, path, test) {
  try {
    const res = await fetch(API_URL + path, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const detail = await test(res);
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name} — ${err.message}`);
  }
}

(async () => {
  console.log("Smoke test against the restored database:");
  await check("API and database reachable", "/health/db", async () => "");
  await check("Admin signs in", "/me", async (r) => {
    const me = await r.json();
    if (me.role !== "ADMIN") throw new Error("not an Admin");
    return `${me.permissions.length} permissions`;
  });
  const departments = [];
  await check("Departments", "/departments", async (r) => {
    departments.push(...(await r.json()));
    return `${departments.length} found`;
  });
  await check("Hotels", "/hotels", async (r) => `${(await r.json()).length} found`);
  await check("Users, roles, managers and extra permissions", "/users", async (r) => {
    const users = await r.json();
    const managed = users.filter((u) => u.manager).length;
    const extras = users.filter((u) => u.extraPermissions?.length).length;
    return `${users.length} users, ${managed} with a manager, ${extras} with extra permissions`;
  });
  for (const d of departments) {
    const q = `?departmentId=${d.id}`;
    await check(`${d.name}: items`, `/items${q}`, async (r) => `${(await r.json()).length} items`);
    await check(`${d.name}: categories`, `/categories${q}`, async (r) => `${(await r.json()).length} categories`);
    await check(`${d.name}: stock history`, `/transactions${q}&limit=5`, async () => "");
    await check(`${d.name}: work orders`, `/work-orders${q}`, async (r) => `${(await r.json()).length} work orders`);
    await check(`${d.name}: purchase requests`, `/purchase-requests${q}`, async (r) => `${(await r.json()).length} requests`);
  }
  await check("Audit log", "/audit-logs", async (r) => `${(await r.json()).entries.length} recent entries`);
  if (AVATAR_USER_ID) {
    await check("Profile photo", `/avatars/${AVATAR_USER_ID}`, async (r) => {
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length === 0) throw new Error("empty photo");
      return `${bytes.length} bytes, ${r.headers.get("content-type")}`;
    });
  }
  console.log(failures === 0 ? "Smoke test passed" : `Smoke test FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
})();
