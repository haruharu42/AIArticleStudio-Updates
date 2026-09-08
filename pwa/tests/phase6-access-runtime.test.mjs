import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

const { loadAccessState, PWA_PRODUCT_CODE } = await vite.ssrLoadModule(
  "/lib/phase6-access.ts",
);

const user = { id: "00000000-0000-4000-8000-000000000002", email: "fixture@example.test" };

function fakeClient({ status = "active", role = "user", canAccess = true, owner = user.id } = {}) {
  const calls = [];
  const profile = {
    id: owner,
    aas_user_id: "AAS-000002",
    display_name: "Fixture",
    role,
    status,
  };

  return {
    calls,
    auth: {
      async getUser() {
        calls.push(["getUser"]);
        return { data: { user }, error: null };
      },
    },
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns) {
          calls.push(["select", columns]);
          return this;
        },
        eq(column, value) {
          calls.push(["eq", column, value]);
          return this;
        },
        async single() {
          calls.push(["single"]);
          return { data: profile, error: null };
        },
      };
    },
    async rpc(name, parameters) {
      calls.push(["rpc", name, parameters]);
      return { data: canAccess, error: null };
    },
  };
}

test("active profile with PWA entitlement is ready", async () => {
  const client = fakeClient();
  const result = await loadAccessState(client);
  assert.equal(result.kind, "ready");
  assert.deepEqual(client.calls.at(-1), [
    "rpc",
    "can_access_product",
    { p_product_code: PWA_PRODUCT_CODE },
  ]);
});

test("active profile without PWA entitlement is denied", async () => {
  const result = await loadAccessState(fakeClient({ canAccess: false }));
  assert.equal(result.kind, "entitlement_denied");
});

test("inactive profiles stop before the entitlement RPC", async () => {
  for (const status of ["pending", "suspended", "disabled"]) {
    const client = fakeClient({ status });
    const result = await loadAccessState(client);
    assert.equal(result.kind, status);
    assert.equal(client.calls.some(([name]) => name === "rpc"), false);
  }
});

test("profile owner mismatch is rejected", async () => {
  const client = fakeClient({ owner: "00000000-0000-4000-8000-000000000099" });
  await assert.rejects(() => loadAccessState(client), /所有者/);
});

test("missing authenticated user becomes signed out", async () => {
  const client = fakeClient();
  client.auth.getUser = async () => ({ data: { user: null }, error: null });
  const result = await loadAccessState(client);
  assert.deepEqual(result, { kind: "signed_out" });
});
