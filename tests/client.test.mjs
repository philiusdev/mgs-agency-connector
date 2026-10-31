import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { callAgency } from "../lib/agency/client.ts";

test("callAgency lit une réponse JSON", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, valeur: 42 }));
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  const { port } = server.address();
  process.env.MGS_PLATFORM_URL = `http://localhost:${port}`;
  process.env.MGS_SITE_KEY = "cle-test";
  process.env.MGS_SITE_SECRET = "secret-test-assez-long";
  try {
    const resultat = await callAgency("/api/v1/agency");
    assert.deepEqual(resultat, { ok: true, valeur: 42 });
  } finally {
    server.close();
    delete process.env.MGS_PLATFORM_URL;
    delete process.env.MGS_SITE_KEY;
    delete process.env.MGS_SITE_SECRET;
  }
});

test("callAgency renvoie null sur 5xx", async () => {
  const server = http.createServer((req, res) => {
    res.statusCode = 503;
    res.end("boom");
  });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  const { port } = server.address();
  process.env.MGS_PLATFORM_URL = `http://localhost:${port}`;
  process.env.MGS_SITE_KEY = "cle-test";
  process.env.MGS_SITE_SECRET = "secret-test-assez-long";
  try {
    const resultat = await callAgency("/api/v1/agency");
    assert.equal(resultat, null);
  } finally {
    server.close();
    delete process.env.MGS_PLATFORM_URL;
    delete process.env.MGS_SITE_KEY;
    delete process.env.MGS_SITE_SECRET;
  }
});

test("callAgency refuse une origine non autorisée", async () => {
  process.env.MGS_PLATFORM_URL = "https://example.com";
  process.env.MGS_SITE_KEY = "cle-test";
  process.env.MGS_SITE_SECRET = "secret-test-assez-long";
  try {
    const resultat = await callAgency("https://evil.example/api/v1/agency");
    assert.equal(resultat, null);
  } finally {
    delete process.env.MGS_PLATFORM_URL;
    delete process.env.MGS_SITE_KEY;
    delete process.env.MGS_SITE_SECRET;
  }
});
