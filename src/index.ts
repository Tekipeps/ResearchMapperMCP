import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createContextMiddleware } from "@ctxprotocol/sdk";
import { z } from "zod";
import { mapResearchLandscape } from "./tools/mapLandscape.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const GEMINI_API_KEY = process.env["GEMINI_API_KEY"] ?? "";
const INCEPTION_API_KEY = process.env["INCEPTION_API_KEY"] ?? "";
const PROVIDER = (
  process.env["SYNTHESIS_PROVIDER"] === "gemini" ? "gemini" : "mercury"
) as "gemini" | "mercury";
const OPENALEX_EMAIL = process.env["OPENALEX_EMAIL"] ?? undefined;

if (PROVIDER === "mercury" && !INCEPTION_API_KEY) {
  console.error(
    "ERROR: INCEPTION_API_KEY is required when SYNTHESIS_PROVIDER=mercury",
  );
  process.exit(1);
}
if (PROVIDER === "gemini" && !GEMINI_API_KEY) {
  console.error(
    "ERROR: GEMINI_API_KEY is required when SYNTHESIS_PROVIDER=gemini (default)",
  );
  process.exit(1);
}

// ── Input schema ──────────────────────────────────────────────────────────────
const inputSchema = {
  topic: z
    .string()
    .min(2)
    .max(200)
    .describe(
      "The research topic or field to map (e.g. 'transformer neural networks', 'CRISPR gene editing', 'quantum error correction')",
    ),
  depth: z
    .enum(["quick", "standard", "deep"])
    .optional()
    .default("standard")
    .describe(
      "Analysis depth: quick (5yr, 30 papers), standard (10yr, 60 papers), deep (15yr, 100 papers)",
    ),
  year_range: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe("Number of years back to analyze (overrides depth default)"),
};

// ── Output schema (JSON Schema for CTX structuredContent) ────────────────────
const outputSchema = {
  topic: z.string(),
  generated_at: z.string(),
  summary: z.string().describe("Executive synthesis of the research landscape"),
  foundational_papers: z.array(
    z.object({
      title: z.string(),
      authors: z.array(z.string()),
      year: z.number(),
      cited_by: z.number(),
      doi: z.string().nullable(),
      why_foundational: z.string(),
    }),
  ),
  prolific_authors: z.array(
    z.object({
      name: z.string(),
      institution: z.string(),
      country: z.string(),
      paper_count: z.number(),
      total_citations: z.number(),
      h_index: z.number(),
      specialization: z.string(),
    }),
  ),
  citation_clusters: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      key_papers: z.array(z.string()),
      key_authors: z.array(z.string()),
      size: z.enum(["small", "medium", "large"]),
    }),
  ),
  publication_trends: z.array(
    z.object({
      year: z.number(),
      count: z.number(),
      growth_rate: z.number(),
      notable: z.string().optional(),
    }),
  ),
  emerging_trends: z.array(
    z.object({
      theme: z.string(),
      evidence: z.string(),
      momentum_score: z.number(),
      comment: z.string(),
    }),
  ),
  interdisciplinary_connections: z.array(
    z.object({
      field: z.string(),
      connection_type: z.enum([
        "borrows_methods",
        "shared_applications",
        "theoretical_overlap",
      ]),
      description: z.string(),
      key_papers: z.array(z.string()),
    }),
  ),
  strategic_insights: z.array(z.string()),
  data_coverage: z.object({
    total_papers_analyzed: z.number(),
    year_range: z.string(),
    sources: z.array(z.string()),
  }),
};

// ── MCP Server factory (stateless — one per request) ─────────────────────────
function createServer(): McpServer {
  const server = new McpServer(
    { name: "research-landscape-mapper", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "map_research_landscape",
    {
      title: "Research Landscape Mapper",
      description:
        "Given any research topic, synthesizes a complete landscape map: foundational papers, prolific authors & institutions, citation clusters/schools of thought, publication trends, emerging themes, interdisciplinary connections, and strategic insights. Replaces SciVal/InCites analytics.",
      inputSchema,
      outputSchema,
      _meta: {
        surface: "both",
        queryEligible: true,
        latencyClass: "slow",
        pricing: {
          executeUsd: "0.1",
        },
      },
    },
    async (args, _extra) => {
      // Race against 28s deadline to stay under CTX 30s SLA
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error("Analysis timed out after 28s — try 'quick' depth"),
            ),
          28_000,
        ),
      );

      try {
        const result = await Promise.race([
          mapResearchLandscape(
            { ...args, email: OPENALEX_EMAIL },
            GEMINI_API_KEY,
            INCEPTION_API_KEY || undefined,
            PROVIDER,
          ),
          timeoutPromise,
        ]);

        return {
          structuredContent: result as unknown as Record<string, unknown>,
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        } as unknown as CallToolResult;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          structuredContent: { error: true },
          content: [{ type: "text" as const, text: msg }],
          isError: true,
        } as unknown as CallToolResult;
      }
    },
  );

  return server;
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check (open)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    tool: "research-landscape-mapper",
    version: "1.0.0",
  });
});

// MCP endpoint — POST only (stateless StreamableHTTP)
app.post(
  "/mcp",
  // createContextMiddleware(),
  async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    try {
      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("finish", () => server.close());
    } catch (err) {
      console.error("MCP handler error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

// SSE / session endpoints — not supported in stateless mode
app.get("/mcp", (_req, res) => {
  res
    .status(405)
    .set("Allow", "POST")
    .json({ error: "SSE not supported in stateless mode" });
});
app.delete("/mcp", (_req, res) => {
  res
    .status(405)
    .set("Allow", "POST")
    .json({ error: "Session management not supported in stateless mode" });
});

app.listen(PORT, () => {
  console.log(`Research Landscape Mapper running on http://localhost:${PORT}`);
  console.log(`  Health:  GET  http://localhost:${PORT}/health`);
  console.log(`  MCP:     POST http://localhost:${PORT}/mcp`);
});
