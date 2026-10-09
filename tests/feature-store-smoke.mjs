import assert from "node:assert/strict";

const memory = {
  outlink_db_v2: { tables: { resources: [{ id: "r1", url: "https://blog.example/post", domain: "blog.example", isNonSpam: true, isBlogCommentCandidate: true, dr: 30 }], publish: [], logs: [], collection: [] } }
};
let listener;
globalThis.chrome = {
  storage: { local: { get: async (key) => ({ [key]: memory[key] }), set: async (input) => Object.assign(memory, input) } },
  runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
  alarms: { clear: async () => true, create: async () => {}, onAlarm: { addListener: () => {} } },
  tabs: { create: async () => ({ id: 1 }) }
};

await import("../feature-store.js");

function send(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const async = listener({ action, ...payload }, {}, resolve);
    if (!async) reject(new Error(`Action was not handled: ${action}`));
    setTimeout(() => reject(new Error(`Timed out: ${action}`)), 1000).unref();
  });
}

let result = await send("FEATURE_GET_ALL");
assert.equal(result.ok, true);
assert.equal(result.features.templates.length, 50);

result = await send("FEATURE_SAVE_SITE", { site: { name: "Example", url: "https://example.com", keyword: "games" } });
assert.equal(result.ok, true);
const siteId = result.site.id;

result = await send("FEATURE_SAVE_SETTINGS", { settings: { dailyLimit: 5, perDomainLimit: 1, delaySeconds: 10 } });
assert.equal(result.ok, true);

result = await send("FEATURE_QUEUE_CREATE", { siteId, resourceIds: ["r1"] });
assert.equal(result.ok, true);
assert.equal(result.added, 1);

result = await send("FEATURE_GET_STATS");
assert.equal(result.ok, true);
assert.equal(result.stats.resources, 1);
assert.equal(result.stats.queuePending, 1);

console.log("feature-store smoke test passed");
