import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";

import { createApp, validateProductionEnvironment } from "../createApp.js";

test("the app emits Helmet headers and exact credentialed CORS", async () => {
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_ORIGIN = "https://frontend.example";
  try {
    const app = createApp();
    const allowed = await request(app)
      .get("/missing")
      .set("Origin", "https://frontend.example");
    assert.equal(allowed.status, 404);
    assert.equal(allowed.headers["access-control-allow-origin"], "https://frontend.example");
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");
    assert.equal(allowed.headers["x-content-type-options"], "nosniff");

    const foreign = await request(app)
      .get("/missing")
      .set("Origin", "https://evil.example");
    assert.equal(foreign.headers["access-control-allow-origin"], undefined);
  } finally {
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test("the app rejects non-JSON authentication requests", async () => {
  const app = createApp();
  const response = await request(app)
    .post("/user/signin")
    .set("Content-Type", "text/plain")
    .send("email=person@example.com");

  assert.equal(response.status, 415);
  assert.deepEqual(response.body, {
    message: "Content-Type must be application/json.",
    code: "CONTENT_TYPE_REQUIRED",
  });
});

test("password authentication attempts are rate limited by IP", async () => {
  const app = createApp();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await request(app)
      .post("/user/signin")
      .send({ email: "invalid", password: "x" });
    statuses.push(response.status);
  }

  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
});

test("production startup requires frontend and Google auth configuration", () => {
  assert.throws(
    () => validateProductionEnvironment({ NODE_ENV: "production" }),
    /FRONTEND_ORIGIN, GOOGLE_CLIENT_ID/,
  );
  assert.doesNotThrow(() =>
    validateProductionEnvironment({
      NODE_ENV: "production",
      FRONTEND_ORIGIN: "https://frontend.example",
      GOOGLE_CLIENT_ID: "client-id",
    }),
  );
  assert.doesNotThrow(() => validateProductionEnvironment({ NODE_ENV: "test" }));
});
