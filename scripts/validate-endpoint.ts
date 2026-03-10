#!/usr/bin/env bun
/**
 * Phase 2 — Deployed Endpoint Validation
 * Tests raw MCP protocol compliance against the deployed server.
 *
 * Usage: bun run scripts/validate-endpoint.ts
 */

const ENDPOINT = "https://research-mapper.tekipeps.com/mcp";

async function post(body: object): Promise<{ status: number; json: unknown }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

let pass = 0, fail = 0;
const ok  = (msg: string) => { console.log(`  ✓ ${msg}`); pass++; };
const err = (msg: string) => { console.log(`  ✗ ${msg}`); fail++; };

console.log("ResearchMapper — Deployed Endpoint Validation");
console.log("=".repeat(50));
console.log(`Target: ${ENDPOINT}\n`);

// ── Test 1: GET /mcp → 405 ────────────────────────────────────────────────────
console.log("Test 1: Method gating");
{
  const res = await fetch(ENDPOINT, { method: "GET" });
  res.status === 405
    ? ok("GET /mcp = 405 (method not allowed)")
    : err(`GET /mcp = ${res.status} (expected 405)`);
}

// ── Test 2: initialize handshake ──────────────────────────────────────────────
console.log("\nTest 2: MCP initialize handshake");
{
  const r = await post({
    jsonrpc: "2.0", id: 0, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "validator", version: "1" } },
  });
  (r.json as Record<string, unknown>)?.result
    ? ok("initialize succeeds")
    : err(`initialize failed: ${JSON.stringify(r.json).slice(0, 150)}`);
}

// ── Test 3: tools/list — schema & _meta audit ─────────────────────────────────
console.log("\nTest 3: tools/list — schema & _meta audit");
{
  const r = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const tools = ((r.json as Record<string, unknown>)?.result as Record<string, unknown>)?.tools as unknown[] | undefined;
  const tool = (tools ?? []).find(
    (t: unknown) => (t as Record<string, unknown>).name === "map_research_landscape"
  ) as Record<string, unknown> | undefined;

  tool
    ? ok("tools/list returns map_research_landscape")
    : err("map_research_landscape not found in tools/list");

  const meta    = tool?._meta    as Record<string, unknown> | undefined;
  const pricing = (meta?.pricing as Record<string, unknown> | undefined);

  meta?.queryEligible === true
    ? ok("_meta.queryEligible = true")
    : err("_meta.queryEligible missing or false");

  pricing?.queryUsd
    ? ok(`_meta.pricing.queryUsd = "${pricing.queryUsd}"`)
    : err("_meta.pricing.queryUsd MISSING");

  pricing?.executeUsd
    ? err(`_meta.pricing.executeUsd present ("${pricing.executeUsd}") — should be removed`)
    : ok("executeUsd absent (correct — query-only mode)");

  meta?.rateLimit
    ? ok("_meta.rateLimit present")
    : err("_meta.rateLimit MISSING");

  (meta?.rateLimit as Record<string, unknown> | undefined)?.maxRequestsPerMinute
    ? ok("_meta.rateLimit.maxRequestsPerMinute present")
    : err("_meta.rateLimit.maxRequestsPerMinute MISSING");

  tool?.outputSchema
    ? ok("outputSchema defined (Data Broker Standard)")
    : err("outputSchema MISSING — Data Broker Standard violation");

  tool?.inputSchema
    ? ok("inputSchema defined")
    : err("inputSchema MISSING");
}

// ── Test 4: Full tools/call — success path ────────────────────────────────────
console.log("\nTest 4: tools/call — success path (quick depth, ~15s)");
{
  const start = Date.now();
  const r = await post({
    jsonrpc: "2.0", id: 2, method: "tools/call",
    params: { name: "map_research_landscape", arguments: { topic: "federated learning privacy", depth: "quick" } },
  });
  const elapsed = Date.now() - start;
  const result = (r.json as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
  const sc     = result?.structuredContent as Record<string, unknown> | undefined;

  result && !result.isError
    ? ok(`tools/call succeeded (${elapsed}ms)`)
    : err(`tools/call failed: ${JSON.stringify(result).slice(0, 250)}`);

  elapsed < 30_000
    ? ok(`within 30s SLA (${elapsed}ms)`)
    : err(`exceeded 30s SLA: ${elapsed}ms`);

  const requiredKeys = [
    "foundational_papers", "prolific_authors", "citation_clusters",
    "publication_trends", "emerging_trends", "interdisciplinary_connections",
    "strategic_insights", "data_coverage", "summary", "generated_at",
  ];
  for (const k of requiredKeys) {
    sc?.[k] !== undefined
      ? ok(`  structuredContent.${k} present`)
      : err(`  structuredContent.${k} MISSING`);
  }

  const insightsLen = (sc?.strategic_insights as unknown[] | undefined)?.length;
  insightsLen === 5
    ? ok(`strategic_insights has exactly 5 items`)
    : err(`strategic_insights has ${insightsLen} items (expected 5)`);

  const respSize = JSON.stringify(r.json).length;
  respSize < 51_200
    ? ok(`response size OK (${respSize} bytes)`)
    : err(`response too large: ${respSize} bytes (CTX limit ~50KB)`);
}

// ── Test 5: Error path — topic too short ──────────────────────────────────────
console.log("\nTest 5: tools/call — error path (topic too short)");
{
  const r = await post({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "map_research_landscape", arguments: { topic: "x" } },
  });
  const result = (r.json as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
  const sc     = result?.structuredContent as Record<string, unknown> | undefined;

  result?.isError || sc?.error
    ? ok("error path returns error indicator")
    : err(`error path unclear: ${JSON.stringify(result).slice(0, 150)}`);

  sc?.message
    ? ok(`error structuredContent.message present: "${String(sc.message).slice(0, 60)}..."`)
    : err("error structuredContent.message MISSING — add message field to error path");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(50));
console.log(`Results: ${pass} passed, ${fail} failed`);
console.log(fail === 0 ? "✓ READY FOR SUBMISSION" : "✗ FIX FAILURES BEFORE SUBMISSION");
process.exit(fail > 0 ? 1 : 0);
