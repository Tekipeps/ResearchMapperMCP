#!/usr/bin/env bun
/**
 * CLI mode: bun run query "<topic>" [depth] [year_range] [provider]
 *
 * Examples:
 *   bun run query "transformer neural networks"
 *   bun run query "CRISPR gene editing" deep
 *   bun run query "quantum computing" standard 10 mercury
 *   bun run query "quantum computing" quick 5 gemini
 */

import { mapResearchLandscape } from "./tools/mapLandscape.ts";

const GEMINI_API_KEY = process.env["GEMINI_API_KEY"] ?? "";
const INCEPTION_API_KEY = process.env["INCEPTION_API_KEY"] ?? "";

const [, , topic, depth, yearRangeArg, providerArg] = process.argv;

const provider = (["gemini", "mercury"].includes(providerArg ?? "") ? providerArg : "mercury") as "gemini" | "mercury";

if (provider === "gemini" && !GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY environment variable is required for gemini provider");
  process.exit(1);
}
if (provider === "mercury" && !INCEPTION_API_KEY) {
  console.error("ERROR: INCEPTION_API_KEY environment variable is required for mercury provider");
  process.exit(1);
}

if (!topic) {
  console.error('Usage: bun run query "<topic>" [quick|standard|deep] [year_range] [gemini|mercury]');
  console.error('Example: bun run query "transformer neural networks" quick 5 mercury');
  process.exit(1);
}

const depthArg = (["quick", "standard", "deep"].includes(depth ?? "") ? depth : "standard") as
  | "quick"
  | "standard"
  | "deep";
const yearRange = yearRangeArg ? parseInt(yearRangeArg, 10) : undefined;

console.log(`\nResearch Landscape Mapper`);
console.log(`${"─".repeat(50)}`);
console.log(`Topic:    ${topic}`);
console.log(`Depth:    ${depthArg}${yearRange ? `  |  Year range: ${yearRange}yr` : ""}`);
console.log(`Provider: ${provider === "mercury" ? "Mercury 2 (Inception Labs)" : "Gemini 2.5 Flash"}`);
console.log(`\nFetching data and synthesizing landscape...`);
console.log("(This typically takes 15–30 seconds)\n");

const start = Date.now();

try {
  const result = await mapResearchLandscape(
    { topic, depth: depthArg, year_range: yearRange, email: process.env["OPENALEX_EMAIL"] },
    GEMINI_API_KEY,
    INCEPTION_API_KEY || undefined,
    provider
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`${"═".repeat(60)}`);
  console.log(`RESEARCH LANDSCAPE: ${result.topic.toUpperCase()}`);
  console.log(`Generated: ${result.generated_at}  |  ${elapsed}s`);
  console.log(`Coverage: ${result.data_coverage.total_papers_analyzed} papers, ${result.data_coverage.year_range}`);
  console.log(`${"═".repeat(60)}\n`);

  console.log("EXECUTIVE SUMMARY");
  console.log("─".repeat(40));
  console.log(result.summary);

  console.log("\nFOUNDATIONAL PAPERS");
  console.log("─".repeat(40));
  for (const p of result.foundational_papers) {
    console.log(`\n  [${p.year}] ${p.title}`);
    console.log(`  Authors: ${p.authors.slice(0, 3).join(", ")}`);
    console.log(`  Citations: ${p.cited_by.toLocaleString()}${p.doi ? `  |  DOI: ${p.doi}` : ""}`);
    console.log(`  Why foundational: ${p.why_foundational}`);
  }

  console.log("\nPROLIFIC AUTHORS");
  console.log("─".repeat(40));
  for (const a of result.prolific_authors) {
    console.log(`\n  ${a.name} (h-index: ${a.h_index})`);
    console.log(`  ${a.institution}, ${a.country}`);
    console.log(`  ${a.paper_count} papers | ${a.total_citations.toLocaleString()} citations`);
    console.log(`  Focus: ${a.specialization}`);
  }

  console.log("\nCITATION CLUSTERS / SCHOOLS OF THOUGHT");
  console.log("─".repeat(40));
  for (const c of result.citation_clusters) {
    console.log(`\n  ${c.name} [${c.size}]`);
    console.log(`  ${c.description}`);
    console.log(`  Key papers: ${c.key_papers.slice(0, 2).join("; ")}`);
    console.log(`  Key authors: ${c.key_authors.join(", ")}`);
  }

  console.log("\nPUBLICATION TRENDS");
  console.log("─".repeat(40));
  const maxCount = Math.max(...result.publication_trends.map((t) => t.count));
  for (const t of result.publication_trends) {
    const bar = "█".repeat(Math.round((t.count / maxCount) * 30));
    const gr = t.growth_rate ?? 0;
    const growth = gr > 0 ? `+${gr.toFixed(1)}%` : `${gr.toFixed(1)}%`;
    const note = t.notable ? `  ← ${t.notable}` : "";
    console.log(`  ${t.year}  ${bar.padEnd(30)}  ${String(t.count).padStart(6)} papers  (${growth})${note}`);
  }

  console.log("\nEMERGING TRENDS");
  console.log("─".repeat(40));
  for (const t of result.emerging_trends) {
    const bar = "▓".repeat(t.momentum_score);
    console.log(`\n  ${t.theme}  [${bar.padEnd(10, "░")} ${t.momentum_score}/10]`);
    console.log(`  Evidence: ${t.evidence}`);
    console.log(`  ${t.comment}`);
  }

  console.log("\nINTERDISCIPLINARY CONNECTIONS");
  console.log("─".repeat(40));
  for (const c of result.interdisciplinary_connections) {
    console.log(`\n  ↔ ${c.field} (${c.connection_type.replace("_", " ")})`);
    console.log(`  ${c.description}`);
  }

  console.log("\nSTRATEGIC INSIGHTS");
  console.log("─".repeat(40));
  result.strategic_insights.forEach((s, i) => {
    console.log(`\n  ${i + 1}. ${s}`);
  });

  console.log(`\n${"═".repeat(60)}`);
  if (process.env["NODE_ENV"] !== "production") {
    const slug = topic.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 40);
    const filename = `outputs/landscape_${slug}_${Date.now()}.json`;
    await Bun.write(filename, JSON.stringify(result, null, 2));
    console.log(`Full JSON saved to: ${filename}`);
  }
  console.log(`Done in ${elapsed}s\n`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\nError: ${msg}`);
  process.exit(1);
}
