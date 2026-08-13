#!/usr/bin/env node
/**
 * Send every request in every committed Postman collection at the running mocks.
 *
 * Validating examples in-process is not the same as posting them at a server. An earlier version of
 * this repo had examples that passed the local validator and were rejected `422` by the mock,
 * because the validator pre-processed them and a real server does not. Anyone copy-pasting an
 * example — the first thing someone evaluating a contract does — would have hit it.
 *
 * The requests come from the COLLECTIONS rather than a list maintained here, deliberately. A
 * hand-written list drifts the moment an operation is added, and it drifts SILENTLY because a
 * shorter list still passes. The collection is also the artefact an insurer actually imports, so
 * driving the check from it turns "the collection works" into a tested claim.
 *
 * Usage:
 *   node scripts/mock.mjs &        (or `npm run mock`)
 *   node scripts/check-mock.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ROOT, contracts } from "./contracts.mjs";

/**
 * Resolve `{{baseUrl}}/a/:id?x=1` against the collection's own variables.
 *
 * ENABLED query parameters must be included. Postman sends them, so a check that drops them is not
 * testing the request in the collection — it is testing a different one, and it fails on any
 * operation with a required query parameter while the collection itself is perfectly fine. Disabled
 * ones are the optional parameters Postman ships unticked, and are correctly left off.
 */
function urlFor(collection, request) {
    const baseUrl = collection.variable.find((v) => v.key === "baseUrl")?.value;
    if (!baseUrl) throw new Error("collection has no baseUrl variable");

    const vars = new Map((request.url.variable ?? []).map((v) => [`:${v.key}`, v.value]));
    const segments = request.url.path.map((s) => vars.get(s) ?? s);

    const query = (request.url.query ?? [])
        .filter((q) => !q.disabled && q.value !== "")
        .map((q) => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`);

    return `${baseUrl}/${segments.join("/")}${query.length ? `?${query.join("&")}` : ""}`;
}

const requests = [];
for (const contract of contracts()) {
    if (!fs.existsSync(contract.outFile)) {
        console.error(
            `✗ ${path.relative(ROOT, contract.outFile)} is missing. Run \`npm run postman\` first.`,
        );
        process.exit(1);
    }
    const collection = JSON.parse(fs.readFileSync(contract.outFile, "utf8"));
    for (const folder of collection.item) {
        for (const item of folder.item) {
            requests.push({
                contract: contract.name,
                name: item.name,
                method: item.request.method,
                url: urlFor(collection, item.request),
                body: item.request.body?.raw ?? null,
            });
        }
    }
}

if (requests.length === 0) {
    console.error("✗ no requests found in any collection — that is a build defect, not a pass.");
    process.exit(1);
}

let failed = 0;
for (const req of requests) {
    const init = { method: req.method, headers: { Authorization: "Bearer test" } };
    if (req.body) {
        init.body = req.body;
        init.headers["Content-Type"] = "application/json";
    }

    let status = 0;
    let detail = "";
    try {
        const response = await fetch(req.url, init);
        status = response.status;
        if (status !== 200) detail = (await response.text()).slice(0, 400);
    } catch (error) {
        detail = error.message;
    }

    const label = `[${req.contract}] ${req.method} ${req.url}`;
    if (status === 200) {
        console.log(`✓ 200  ${label}`);
    } else {
        failed += 1;
        console.error(`::error::mock returned ${status || "no response"} — ${label}`);
        console.error(`    ${req.name}`);
        if (detail) console.error(`    ${detail}`);
    }
}

console.log(`\n${requests.length - failed}/${requests.length} collection requests answered 200`);
process.exit(failed ? 1 : 0);
