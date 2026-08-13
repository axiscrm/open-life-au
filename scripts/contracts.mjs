/**
 * The contracts this repository publishes, and the local ports they mock on.
 *
 * WHICH contracts exist is read from `redocly.yaml`, which is already the single place a contract is
 * registered for linting and bundling. Nothing here needs editing when a domain is added — except a
 * port, which cannot be derived: assigning them by list order would silently renumber every existing
 * mock the first time someone alphabetised the `apis` block, and anyone's saved Postman environment
 * would then point at the wrong contract while still returning perfectly valid responses.
 *
 * So ports are explicit and permanent. Quoting keeps 4010 because it is the number in every existing
 * README, collection and note.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

export const ROOT = path.resolve(import.meta.dirname, "..");

/** Permanent port assignments. Add a line when a contract is added; never renumber an existing one. */
const PORTS = {
    quoting: 4010,
    policy: 4011,
    requirements: 4012,
    commissions: 4013,
};

/**
 * Stable collection ids, one per contract.
 *
 * Postman assigns its own id on import, so these only have to be constant — and they DO have to be
 * constant, because the collections are committed and drift-gated in CI. A generated uuid would make
 * every build differ from the last.
 */
const COLLECTION_IDS = {
    quoting: "0f5a1c62-7c3e-4a1e-9a2f-2b6d0c9e41aa",
    policy: "1b7d2e94-5a06-4c3b-8f71-3d4e5a6b7c80",
    requirements: "2c8e3fa5-6b17-4d5c-9081-4e5f6a7b8c91",
    commissions: "3d9f40b6-7c28-4e6d-a192-5f60718c9da2",
};

/**
 * Example values for parameters a generated request cannot be sent without — path templates, and
 * required query parameters. Taken from each contract's worked examples, so the mock recognises them.
 *
 * Consulted only as a FALLBACK: a parameter carrying its own `examples` in the contract wins, which
 * keeps the spec the source of truth and this map small.
 */
const PARAM_EXAMPLES = {
    policy_id: "P-4471902",
    case_id: "APP-2026-004471",
    statement_id: "STM-2026-08-0417",
};

export function contracts() {
    const config = YAML.parse(fs.readFileSync(path.join(ROOT, "redocly.yaml"), "utf8"));
    const entries = Object.entries(config.apis ?? {});
    if (entries.length === 0) {
        console.error("✗ redocly.yaml declares no `apis`.");
        process.exit(1);
    }
    return entries.map(([name, api]) => {
        const port = PORTS[name];
        if (!port) {
            console.error(
                `✗ ${name} has no port in scripts/contracts.mjs. Add one — do not renumber the others.`,
            );
            process.exit(1);
        }
        return {
            name,
            port,
            source: path.join(ROOT, api.root),
            bundle: path.join(ROOT, "dist", name, "openapi.yaml"),
            collectionId: COLLECTION_IDS[name] ?? null,
            outFile: path.join(ROOT, "postman", `${name}.postman_collection.json`),
        };
    });
}

/** Example value for a parameter, or a readable placeholder. */
export const paramExample = (name) => PARAM_EXAMPLES[name] ?? `<${name}>`;
