#!/usr/bin/env node
/**
 * Make openapi-generator's `rust-axum` output correct for these contracts.
 *
 * Self-contained — no dependencies beyond Node — because implementers download this one file rather
 * than clone the repository. docs/generators/rust.md tells them to, and scripts/check-codegen.sh runs
 * exactly the same steps in CI, so the documented recipe is the tested one.
 *
 *   node rust-axum.mjs prepare openapi.json > stubs.json    # before generating
 *   node rust-axum.mjs patch openapi.json ./openlife_quoting  # after generating
 *
 * Every fix below answers a generator defect, not a contract one. Each was found by compiling or
 * round-tripping the output; none is visible to linting, and two of them fail SILENTLY.
 *
 * prepare — drop `webhooks` and the `webhookSignature` scheme that only they use. rust-axum turns
 *   the 3.1 webhooks into a trait with no name (`pub trait <E: …>`) and the apiKey scheme into an
 *   unbound `Claims = C`; neither compiles. Nothing is lost: an insurer SENDS webhooks, so they have
 *   no place in its server stubs.
 *
 * patch —
 *   1. Discriminant defaults. Each union variant defaults its discriminator field to the SCHEMA name
 *      (`"LifeCover"`) rather than the mapped wire value (`"life"`). Requests still deserialise, so
 *      nothing fails — the implementation just sees, and writes back, a value the contract forbids.
 *      Rewritten from the contract's own `discriminator.mapping`, so a new variant needs no edit here.
 *   2. Regex literals. Patterns are pasted into Rust strings through an HTML-escaping template, so
 *      `'` and `"` arrive as `&#39;` and `\&quot;`, and inline-schema patterns arrive with their
 *      backslashes unescaped. Every literal is decoded and re-emitted as a raw string.
 *   3. Lookaround. The `regex` crate does not support it at all, so such a pattern compiles and then
 *      panics on first use. Known patterns are swapped for an exact lookahead-free equivalent; an
 *      unknown one fails here rather than in production.
 */
import fs from "node:fs";
import path from "node:path";

// Lookaround patterns in the contracts, and an exact equivalent the `regex` crate can run.
//
// Positive money amount — 1 to 12 integer digits, up to 2 decimals, not all zeros. Spelled out by the
// position of the first non-zero integer digit, since without lookahead that is the only way to keep
// the 12-digit bound. Checked against the original over 4.4 million strings with zero mismatches.
const POSITIVE_AMOUNT_INT = Array.from(
  { length: 12 },
  (_, k) => `${k ? `0{${k}}` : ""}[1-9][0-9]{0,${11 - k}}`,
).join("|");
const LOOKAROUND_EQUIVALENTS = {
  "^(?!0+(\\.0+)?$)\\d{1,12}(\\.\\d{1,2})?$":
    `^(?:(?:${POSITIVE_AMOUNT_INT})(?:\\.[0-9]{1,2})?|0{1,12}\\.(?:0[1-9]|[1-9][0-9]?))$`,
};

const HTML_ENTITIES = { "&#39;": "'", "&quot;": '"', "&#x3D;": "=", "&#x60;": "`", "&lt;": "<", "&gt;": ">", "&amp;": "&" };

const deref = (spec, ref) => ref.split("/").slice(1).reduce((node, key) => node[key], spec);

// A schema with its own `$ref` and `allOf` flattened, later parts winning. Shallow, which is enough
// for the property-level keywords this file merges.
function flatten(spec, schema) {
  if (!schema) return undefined;
  if (schema.$ref) return flatten(spec, { ...deref(spec, schema.$ref), ...schema, $ref: undefined });
  const merge = (a, b) => {
    const properties = { ...a.properties };
    for (const [k, v] of Object.entries(b.properties ?? {})) properties[k] = { ...properties[k], ...v };
    return { ...a, ...b, properties };
  };
  let flat = {};
  for (const part of schema.allOf ?? []) flat = merge(flat, flatten(spec, part));
  flat = merge(flat, { ...schema, allOf: undefined });
  return JSON.parse(JSON.stringify(flat));
}

// A property as a schema declares it, looking through `allOf` and `$ref` on both.
function propertyOf(spec, schema, name) {
  return flatten(spec, flatten(spec, schema)?.properties?.[name]);
}

// Keywords that only narrow a value. An override made solely of these restates nothing about shape.
const CONSTRAINTS = new Set(["pattern", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum",
  "exclusiveMaximum", "multipleOf", "minItems", "maxItems", "uniqueItems", "description"]);
const SHAPE = new Set(["type", "format", "items", "enum"]);

// `allOf: [{$ref: X}, {properties: {p: {pattern: …}}}]` narrows one property of X. Valid JSON
// Schema, but rust-axum reads the override in isolation: one that restates `pattern` without `type`
// becomes `types::Object` — untyped JSON — with a regex validator that does not compile against it.
// Merging each override into a copy of the property it narrows says the same thing completely.
function completeOverrides(spec, node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node.allOf)) {
    const bases = node.allOf.filter((part) => part.$ref);
    for (const part of node.allOf) {
      if (part.$ref || !part.properties) continue;
      for (const [name, override] of Object.entries(part.properties)) {
        // Only pure narrowing with `type` left out: that is what degrades. The cover variants'
        // `cover_type: {enum: [life]}` is not narrowing in this sense and must stay exactly as it is.
        if (override.type || !Object.keys(override).every((k) => CONSTRAINTS.has(k))) continue;
        const base = bases.map((b) => propertyOf(spec, b, name)).find((p) => p?.type);
        if (!base) continue;
        // Shape only. A `title` carried across would have the generator mint a new named model.
        const shape = Object.fromEntries(Object.entries(base).filter(([k]) => SHAPE.has(k)));
        part.properties[name] = { ...shape, ...override };
      }
    }
  }
  for (const value of Object.values(node)) completeOverrides(spec, value);
}

function prepare(specPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  delete spec.webhooks;
  delete spec.components?.securitySchemes?.webhookSignature;
  completeOverrides(spec, spec);
  process.stdout.write(JSON.stringify(spec, null, 2) + "\n");
}

// Every `{ propertyName, mapping }` in the contract, wherever it sits.
function discriminators(node, found = []) {
  if (node && typeof node === "object") {
    if (node.discriminator?.mapping) found.push(node.discriminator);
    for (const value of Object.values(node)) discriminators(value, found);
  }
  return found;
}

// A Rust string literal's content back to the text it denotes. rust-axum emits two kinds: properly
// escaped (`\\d`) and raw (`\d`, which is not a Rust escape and does not compile). Any backslash
// followed by something Rust would not accept means the whole literal is raw.
function decodeLiteral(body) {
  // Escapes pair left to right, so `\\d` is an escaped backslash then `d` — not a stray `\d`.
  const escapes = [...body.matchAll(/\\(.)/g)].map((m) => m[1]);
  if (escapes.some((c) => !`\\"nrt0'`.includes(c))) return body;
  return body.replace(/\\(.)/g, (_, c) => ({ n: "\n", r: "\r", t: "\t", 0: "\0" })[c] ?? c);
}

function patch(specPath, crateDir) {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const models = path.join(crateDir, "src", "models.rs");
  let src = fs.readFileSync(models, "utf8");

  for (const { propertyName, mapping } of discriminators(spec)) {
    const wireFor = Object.fromEntries(Object.entries(mapping).map(([wire, ref]) => [ref.split("/").at(-1), wire]));
    const defaults = new RegExp(`(fn _name_for_${propertyName}\\(\\) -> String \\{\\s*String::from\\(")(\\w+)("\\))`, "g");
    src = src.replace(defaults, (whole, head, name, tail) => (name in wireFor ? head + wireFor[name] + tail : whole));
    // Every variant must now default to a wire value. Anything else means the output changed shape
    // and the rewrite above silently stopped applying.
    const found = [...src.matchAll(defaults)].map((m) => m[2]);
    if (found.length !== Object.keys(wireFor).length) {
      throw new Error(`${propertyName}: expected ${Object.keys(wireFor).length} variant defaults, found ${found.length}`);
    }
    for (const name of found) {
      if (!Object.values(wireFor).includes(name)) {
        throw new Error(`${propertyName}: a variant still defaults to "${name}", which is not a wire value`);
      }
    }
  }

  src = src.replace(/Regex::new\("((?:[^"\\]|\\.)*)"\)/g, (_, body) => {
    let pattern = decodeLiteral(body).replace(/&#39;|&quot;|&#x3D;|&#x60;|&lt;|&gt;|&amp;/g, (e) => HTML_ENTITIES[e]);
    pattern = LOOKAROUND_EQUIVALENTS[pattern] ?? pattern;
    if (/\(\?<?[=!]/.test(pattern)) {
      throw new Error(`lookaround the regex crate cannot run, with no known equivalent: ${pattern}`);
    }
    return `Regex::new(r#"${pattern}"#)`;
  });

  fs.writeFileSync(models, src);
}

const [command, ...args] = process.argv.slice(2);
if (command === "prepare" && args.length === 1) prepare(args[0]);
else if (command === "patch" && args.length === 2) patch(args[0], args[1]);
else {
  console.error("usage: rust-axum.mjs prepare <openapi.json>  |  rust-axum.mjs patch <openapi.json> <crate-dir>");
  process.exit(2);
}
