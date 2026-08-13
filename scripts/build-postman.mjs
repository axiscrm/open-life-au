#!/usr/bin/env node
/**
 * Build a Postman collection per contract, from the contracts and our own worked examples.
 *
 * Not from `openapi-to-postmanv2`, which was the obvious choice and turned out to be the wrong one.
 * Two reasons, and the second is the disqualifying one:
 *
 *   It is not reproducible. A fresh UUID on `_postman_id` and on every item, so a committed,
 *   drift-gated collection can never be stable.
 *
 *   Its request bodies are wrong. With its schema faker on it invented `"osca": 978.5166502170916`
 *   for a string field carrying a pattern; with the faker off it produced a cover with
 *   `cover_id: "life-1"` typed `business_expenses`, and a sum insured of
 *   `"<Error: Too many levels of nesting to fake this schema>"`. A collection is the first thing
 *   someone evaluating this contract will actually run. Handing them a body that would be rejected
 *   is worse than handing them nothing.
 *
 * So the bodies come from each contract's own `examples/requests/`, which are validated against the
 * contract by `npm run examples` and posted at a live mock in CI. They are known to work.
 *
 * Output is deterministic: no generated ids, keys written in a fixed order.
 *
 * Usage: node scripts/build-postman.mjs   (run `npm run bundle` first)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import { ROOT, contracts, paramExample } from "./contracts.mjs";

/**
 * Request bodies, by operationId. Anything absent gets no body — which is every operation in the
 * policy and requirements contracts, both of which are read-only.
 */
const BODIES = {
    createQuote: "life-with-linked-tpd-in-super.json",
    matchOccupation: null, // built inline below — there is no example file for it
};

const INLINE_BODIES = {
    matchOccupation: {
        occupation: {
            osca: "3323-11",
            description: "Painter",
            qualifiers: { trade_qualified: true, working_height_m: 10, manual_duties_percent: 80 },
        },
        max_candidates: 10,
    },
};

/** First line of a description — Postman shows these in a list, so keep them short. */
const firstLine = (text = "") => text.trim().split("\n")[0].trim();

function buildCollection(contract) {
    const spec = YAML.parse(fs.readFileSync(contract.bundle, "utf8"));
    const examplesDir = path.join(ROOT, "domains", contract.name, "examples", "requests");

    /**
     * Resolve a local `$ref` against the bundled document.
     *
     * Bundling rewrites cross-file refs into `#/components/...` rather than inlining them, so
     * `op.parameters` is a list of pointers. Reading `.in` off an unresolved pointer yields
     * `undefined`, which silently drops every header and query parameter from the collection — the
     * requests still look plausible, just without `Idempotency-Key`, or without `cursor` on a paged
     * snapshot.
     */
    function deref(node) {
        if (!node || typeof node !== "object" || !node.$ref) return node;
        const segments = node.$ref.replace(/^#\//, "").split("/");
        let target = spec;
        for (const segment of segments) {
            target = target?.[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
        }
        return deref(target);
    }

    const parametersOf = (op) => (op.parameters ?? []).map(deref).filter(Boolean);

    function bodyFor(operationId) {
        if (INLINE_BODIES[operationId]) return INLINE_BODIES[operationId];
        const file = BODIES[operationId];
        if (!file) return null;
        return JSON.parse(fs.readFileSync(path.join(examplesDir, file), "utf8"));
    }

    function buildRequest(rawPath, method, op) {
        // `{{baseUrl}}` and `{{accessToken}}` are collection variables, set once in Postman.
        //
        // Path templates become Postman's own `:name` form with a value supplied below. Left as
        // `{policy_id}`, Postman sends the braces literally and every single-resource request 404s
        // against a real implementation — which reads as the insurer's bug, not ours.
        const segments = rawPath
            .replace(/^\//, "")
            .split("/")
            .filter(Boolean)
            .map((segment) => segment.replace(/^\{(.+)\}$/, ":$1"));
        const params = parametersOf(op);

        // A REQUIRED query parameter arrives enabled, so whatever value is put here is what gets
        // sent. An empty string is not a value: it fails validation at any conformant server, so
        // the collection would ship a request that cannot succeed — the same defect as leaving
        // `{policy_id}` in a path. Prefer the schema's own example, then a known-good value for the
        // name, then the default.
        const query = params
            .filter((p) => p.in === "query")
            .map((p) => ({
                key: p.name,
                value: p.required
                    ? String(p.schema?.examples?.[0] ?? paramExample(p.name))
                    : p.schema?.default != null
                      ? String(p.schema.default)
                      : "",
                description: firstLine(p.description),
                disabled: !p.required,
            }));

        const pathVars = params
            .filter((p) => p.in === "path")
            .map((p) => ({
                key: p.name,
                value: p.schema?.examples?.[0] ?? paramExample(p.name),
                description: firstLine(p.description),
            }));

        const header = params
            .filter((p) => p.in === "header")
            .map((p) => ({
                key: p.name,
                // A fresh idempotency key per send is exactly what this header is for.
                value: p.name === "Idempotency-Key" ? "{{$guid}}" : "",
                description: firstLine(p.description),
                disabled: !p.required,
            }));

        const body = bodyFor(op.operationId);
        if (body) header.unshift({ key: "Content-Type", value: "application/json" });

        const request = {
            method: method.toUpperCase(),
            header,
            url: {
                raw: `{{baseUrl}}/${segments.join("/")}${query.length ? "?" : ""}`,
                host: ["{{baseUrl}}"],
                path: segments,
                ...(query.length ? { query } : {}),
                ...(pathVars.length ? { variable: pathVars } : {}),
            },
            description: op.description ?? "",
        };

        if (body) {
            request.body = {
                mode: "raw",
                raw: `${JSON.stringify(body, null, 2)}\n`,
                options: { raw: { language: "json" } },
            };
        }

        return { name: op.summary ?? op.operationId, request, response: [] };
    }

    // Group by tag, in the order the contract declares them, so the collection reads like the docs.
    const tagOrder = (spec.tags ?? []).map((t) => t.name);
    const folders = new Map(tagOrder.map((name) => [name, []]));

    for (const [rawPath, pathItem] of Object.entries(spec.paths ?? {})) {
        for (const method of ["get", "post", "put", "patch", "delete"]) {
            const op = pathItem[method];
            if (!op) continue;
            const tag = op.tags?.[0] ?? "Other";
            if (!folders.has(tag)) folders.set(tag, []);
            folders.get(tag).push(buildRequest(rawPath, method, op));
        }
    }

    return {
        info: {
            _postman_id: contract.collectionId,
            name: spec.info.title,
            description:
                `${spec.info.summary ?? ""}\n\n` +
                "Set `baseUrl` and `accessToken` in the collection variables before sending. " +
                `The default \`baseUrl\` points at this contract's local mock — \`npm run mock\` serves ` +
                `it on port ${contract.port}. Request bodies, where an operation takes one, are the ` +
                "contract's own worked examples: validated against the schema and posted at a live " +
                "mock in CI, so they are known to be accepted.",
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        auth: {
            type: "bearer",
            bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }],
        },
        variable: [
            {
                key: "baseUrl",
                value: `http://127.0.0.1:${contract.port}`,
                description:
                    "An implementation's base URL. Defaults to this contract's local mock " +
                    `(\`npm run mock\`, port ${contract.port}) so the collection is usable before you ` +
                    "have an insurer endpoint.",
            },
            {
                key: "accessToken",
                value: "",
                description:
                    "OAuth2 client-credentials access token. The mock accepts any non-empty value.",
            },
        ],
        item: [...folders.entries()].map(([name, items]) => ({ name, item: items })),
    };
}

const all = contracts();
const missing = all.filter((c) => !fs.existsSync(c.bundle));
if (missing.length) {
    console.error(
        `✗ missing bundle(s): ${missing.map((c) => path.relative(ROOT, c.bundle)).join(", ")}. ` +
            "Run `npm run bundle` first.",
    );
    process.exit(1);
}

for (const contract of all) {
    const collection = buildCollection(contract);
    fs.mkdirSync(path.dirname(contract.outFile), { recursive: true });
    fs.writeFileSync(contract.outFile, `${JSON.stringify(collection, null, 2)}\n`);
    console.log(
        `✓ ${path.relative(ROOT, contract.outFile)} — ` +
            collection.item.map((f) => `${f.name} (${f.item.length})`).join(", "),
    );
}
