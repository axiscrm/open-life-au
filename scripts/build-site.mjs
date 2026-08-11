#!/usr/bin/env node
/**
 * Build the published reference site into `site/`.
 *
 * Three jobs, and the reason they live in a script rather than in the deploy workflow is that they
 * used to live in the workflow. That meant `npm run docs` produced something materially DIFFERENT
 * from what got published: no landing page, no version banner, and no way to look at the real site
 * before pushing it. A publishing step you cannot run locally is one you find out about afterwards.
 *
 *   1. Render each contract's reference documentation.
 *   2. Stamp each page with its version and whether this build is a released one, so a reader can
 *      tell a contract they can rely on from work in progress. We publish from `main` rather than
 *      only from tags — the site should be something we can send an insurer today — and this banner
 *      is the entire price of that choice.
 *   3. Write the landing page. A bare `/` used to redirect straight to quoting, which was fine when
 *      quoting was the only contract and actively misleading afterwards: the policy reference was
 *      published and reachable, and nothing anywhere linked to it.
 *
 * The contract list comes from `redocly.yaml`'s `apis` block, which is already the single place a
 * contract is registered for linting and bundling. Adding a domain there is enough; nothing here
 * needs editing.
 *
 * Usage: node scripts/build-site.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITE = path.join(ROOT, "site");
const REPO = "https://github.com/axiscrm/open-life-au";

/** Escape for interpolation into HTML text or an attribute value. */
const esc = (s) =>
    String(s).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

/**
 * Whether HEAD is exactly the release tag for this contract. Anything else — a commit after the
 * tag, a shallow clone, no git at all — is reported as unreleased, which is the safe direction: a
 * released build mislabelled as work in progress costs a reader nothing, and the converse invites
 * an insurer to build against something that has not been cut.
 */
function releaseState(name) {
    // stderr piped, not inherited: `git describe` with no matching tag writes "fatal: No names
    // found" and exits non-zero, which is the ordinary answer here rather than a problem worth
    // printing on every build.
    const git = (args) =>
        execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    try {
        git(["describe", "--tags", "--exact-match", "--match", `${name}-v*`, "HEAD"]);
        return { released: true };
    } catch {
        let sha = "";
        try {
            sha = git(["rev-parse", "--short", "HEAD"]);
        } catch {
            /* not a git checkout — leave the sha out of the banner */
        }
        return { released: false, sha };
    }
}

// Rebuild from empty. `site/` is uploaded to GitHub Pages wholesale, so anything left there by a
// previous build — a contract since renamed, a file someone dropped in while debugging — gets
// published. Cheap to prevent, and impossible to notice once it has happened.
fs.rmSync(SITE, { recursive: true, force: true });

const config = YAML.parse(fs.readFileSync(path.join(ROOT, "redocly.yaml"), "utf8"));
const apis = Object.entries(config.apis ?? {});
if (apis.length === 0) {
    console.error("✗ redocly.yaml declares no `apis`. Nothing to build.");
    process.exit(1);
}

const contracts = [];

for (const [name, api] of apis) {
    const root = path.join(ROOT, api.root);
    if (!fs.existsSync(root)) {
        console.error(`✗ ${name}: ${api.root} does not exist`);
        process.exit(1);
    }
    const info = YAML.parse(fs.readFileSync(root, "utf8")).info ?? {};
    const out = path.join(SITE, name, "index.html");

    execFileSync("npx", ["redocly", "build-docs", root, "-o", out], {
        cwd: ROOT,
        stdio: "inherit",
    });

    const state = releaseState(name);
    const title = info.title ?? name;
    const version = info.version ?? "0.0.0";

    const banner = state.released
        ? `${esc(title)} <strong>v${esc(version)}</strong> — released`
        : `${esc(title)} <strong>v${esc(version)}</strong> — unreleased build` +
          `${state.sha ? ` (${esc(state.sha)})` : ""}. May differ from the released contract.`;
    const colour = state.released ? "#0b7285" : "#a15c00";

    // Insert immediately after <body...> so the bar sits above the rendered reference.
    const html = fs.readFileSync(out, "utf8");
    const at = html.indexOf(">", html.indexOf("<body")) + 1;
    if (at === 0) {
        console.error(`✗ ${name}: no <body> in the generated page — cannot stamp it`);
        process.exit(1);
    }
    const bar =
        `<div style="background:${colour};color:#fff;font:14px/1.5 system-ui,sans-serif;` +
        `padding:8px 16px;text-align:center">${banner}</div>`;
    fs.writeFileSync(out, html.slice(0, at) + bar + html.slice(at));

    contracts.push({ name, title, version, summary: info.summary ?? "", ...state });
    console.log(`✓ ${name}: v${version}${state.released ? " (released)" : " (unreleased)"}`);
}

const cards = contracts
    .map(
        (c) => `      <a class="card" href="./${esc(c.name)}/">
        <h2>${esc(c.title)}</h2>
        <p class="version"><span class="v">v${esc(c.version)}</span> · ${c.released ? "released" : "draft, open for comment"}</p>
        <p>${esc(c.summary)}</p>
        <span class="go">Read the reference &rarr;</span>
      </a>`,
    )
    .join("\n");

fs.writeFileSync(
    path.join(SITE, "index.html"),
    `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Life Data Standards (AU)</title>
<meta name="description" content="Vendor-neutral contracts for Australian life insurance.">
<style>
  :root {
    --bg: #ffffff; --fg: #1a1d21; --muted: #5c6670; --line: #e2e6ea;
    --accent: #0b7285; --card: #f8fafb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14171a; --fg: #e8ecef; --muted: #9aa5ae; --line: #2b3136;
      --accent: #4db3c6; --card: #1b1f23;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 46rem; margin: 0 auto; padding: 4rem 1.5rem 5rem; }
  h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 .5rem; letter-spacing: -.02em; }
  .lede { color: var(--muted); font-size: 1.05rem; margin: 0 0 2.5rem; }
  .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); }
  .card {
    display: block; padding: 1.25rem 1.4rem; border: 1px solid var(--line);
    border-radius: 10px; background: var(--card); color: inherit; text-decoration: none;
    transition: border-color .15s ease, transform .15s ease;
  }
  .card:hover, .card:focus-visible { border-color: var(--accent); transform: translateY(-2px); }
  .card h2 { font-size: 1.1rem; margin: 0 0 .25rem; }
  .card p { margin: 0 0 .6rem; font-size: .92rem; color: var(--muted); }
  .card .version {
    font-variant-numeric: tabular-nums; font-size: .8rem;
    text-transform: uppercase; letter-spacing: .04em;
  }
  /* The version is a literal, so its leading v stays lowercase while the status beside it is capsed. */
  .card .version .v { text-transform: none; }
  .go { font-size: .88rem; font-weight: 600; color: var(--accent); }
  .note { margin-top: 3rem; padding-top: 1.75rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .92rem; }
  .note a { color: var(--accent); }
</style>
</head>
<body>
  <main class="wrap">
    <h1>Open Life Data Standards (AU)</h1>
    <p class="lede">
      Vendor-neutral contracts for Australian life insurance, so that adviser software and insurers
      can integrate once instead of once per pair.
    </p>
    <div class="cards">
${cards}
    </div>
    <p class="note">
      Everything here is a draft published for insurers to argue with. Feedback that says
      &ldquo;no insurer can produce this field&rdquo; is worth more than anything else you could
      send &mdash; <a href="${REPO}/issues">open an issue</a>.
      Source and bundled specifications: <a href="${REPO}">${esc(REPO.replace("https://", ""))}</a>.
      Licensed Apache-2.0.
    </p>
  </main>
</body>
</html>
`,
);

console.log(`✓ landing page: ${contracts.length} contract${contracts.length === 1 ? "" : "s"}`);
