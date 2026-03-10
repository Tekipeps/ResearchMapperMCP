#!/usr/bin/env bun
/**
 * Phase 3 — CTX Marketplace Validation
 * Uses @ctxprotocol/sdk to validate the tool after marketplace listing.
 *
 * Requires:
 *   - CTX_PROTOCOL_SECRET_KEY in .env
 *   - Tool submitted and staked at https://context.app/contribute
 *
 * Usage: bun run scripts/validate-ctx.ts
 */

import { ContextClient } from "@ctxprotocol/sdk";

const apiKey = process.env["CTX_PROTOCOL_SECRET_KEY"];
if (!apiKey) {
  console.error("ERROR: CTX_PROTOCOL_SECRET_KEY not set in .env");
  process.exit(1);
}

const client = new ContextClient({ apiKey });
let pass = 0, fail = 0;
const ok  = (msg: string) => { console.log(`  ✓ ${msg}`); pass++; };
const err = (msg: string) => { console.log(`  ✗ ${msg}`); fail++; };

console.log("ResearchMapper — CTX Marketplace Validation");
console.log("=".repeat(50));

// ── Step 1: Discover tool on marketplace ─────────────────────────────────────
console.log("\nStep 1: Discovering tool on marketplace...");
const allTools = await client.discovery.search({ query: "research landscape mapper" });
const tool = allTools.find(
  (t) =>
    t.name.toLowerCase().includes("research") ||
    (t.description ?? "").toLowerCase().includes("openalex") ||
    (t.description ?? "").toLowerCase().includes("landscape"),
);

if (!tool) {
  console.error(
    "\nTool not found on marketplace.\n" +
    "Submit via https://context.app/contribute first, then stake to activate.\n" +
    `Discovery returned ${allTools.length} result(s): ${allTools.map((t) => t.name).join(", ") || "(none)"}`,
  );
  process.exit(1);
}

ok(`Found: "${tool.name}" (id: ${tool.id})`);
ok(`Price: ${tool.price} USDC`);
tool.isVerified && ok("Tool is verified");

// ── Step 2: Query mode — canonical "Try asking" prompts ──────────────────────
const PROMPTS = [
  // 1. Core happy-path
  "Map the research landscape for CRISPR gene editing, standard depth",
  // 2. Discovery/listing
  "What are the most prolific authors and top-cited papers in transformer neural networks?",
  // 3. Comparative
  "Compare the citation clusters in federated learning versus centralized machine learning",
  // 4. Advanced filtered (year_range override)
  "Show publication trend data for mRNA vaccine delivery over the last 15 years",
  // 5. Multi-step workflow
  "Map the landscape for quantum error correction then identify which emerging themes overlap with materials science",
  // 6. Edge-case / ambiguity
  "Map the landscape for 'attention mechanism' — is this too narrow or should I broaden it?",
  // 7. Power-user
  "Deep analysis of large language model alignment, summarize the strategic insights as research gap bullets",
];

console.log(`\nStep 2: Running ${PROMPTS.length} Query mode prompts pinned to tool ${tool.id}...`);
console.log("(Each call invokes the live tool — expect 20-40s per prompt)\n");

let totalCost = 0;
let promptsFailed = 0;

for (let i = 0; i < PROMPTS.length; i++) {
  const prompt = PROMPTS[i];
  console.log(`  [${i + 1}/${PROMPTS.length}] ${prompt.slice(0, 70)}${prompt.length > 70 ? "..." : ""}`);

  try {
    const answer = await client.query.run({
      query: prompt,
      tools: [tool.id],
      queryDepth: "deep",
      includeDeveloperTrace: true,
    });

    const usedOurTool    = answer.toolsUsed?.some((t) => t.id === tool.id) ?? false;
    const isApology      = /sorry|cannot|don't have access|no information available/i.test(answer.response ?? "");
    const costUsd        = parseFloat(answer.cost?.totalCostUsd ?? "0");
    totalCost += costUsd;

    answer.response && !isApology
      ? ok("response is substantive")
      : err("response is generic apology or empty — tool may not be routing correctly");

    usedOurTool
      ? ok("correct tool was invoked")
      : err(`wrong tool routed — toolsUsed: ${JSON.stringify(answer.toolsUsed?.map((t) => t.name))}`);

    // Developer trace health
    const summary = answer.developerTrace?.summary as Record<string, unknown> | undefined;
    if (summary) {
      const retries = (summary.retryCount as number) ?? 0;
      const loops   = (summary.loopCount   as number) ?? 0;
      retries <= 3
        ? ok(`retry count OK (${retries})`)
        : err(`excessive retries: ${retries} (suggests schema mismatch or timeout)`);
      loops <= 3
        ? ok(`loop count OK (${loops})`)
        : err(`excessive loops: ${loops} (suggests tool description too vague)`);
    }

    console.log(`     cost: $${costUsd.toFixed(4)}  duration: ${answer.durationMs}ms\n`);
  } catch (e) {
    err(`query threw: ${e instanceof Error ? e.message : String(e)}`);
    promptsFailed++;
    console.log();
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("=".repeat(50));
console.log(`Total query cost: $${totalCost.toFixed(4)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);

if (fail === 0) {
  console.log("✓ MARKETPLACE VALIDATION PASSED — tool is ready for grant submission");
} else {
  console.log("✗ FIX FAILURES — see above for details");
  console.log("  Common fixes:");
  console.log("  - Generic apology: improve tool description or add more inputSchema examples");
  console.log("  - Wrong tool routed: make description more specific (name data sources explicitly)");
  console.log("  - Excessive retries: check outputSchema matches actual structuredContent");
}

process.exit(fail > 0 ? 1 : 0);
