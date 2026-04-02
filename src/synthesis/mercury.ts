// Inception Labs Mercury 2 synthesis — OpenAI-compatible API
// Docs: https://docs.inceptionlabs.ai
// Base URL: https://api.inceptionlabs.ai/v1
// Model: mercury-2 (diffusion LLM, 5-10x faster than autoregressive models)

import type { OAWork, OAAuthor, OAYearCount } from "../data/openAlex.ts";
import type { S2Paper } from "../data/semanticScholar.ts";
import type { LandscapeResult } from "../tools/types.ts";

const BASE_URL = "https://api.inceptionlabs.ai/v1";
const MODEL = "mercury-2";
const TIMEOUT_MS = 28_000;

export async function synthesizeLandscapeMercury(
  topic: string,
  works: (OAWork & { abstract: string })[],
  authors: OAAuthor[],
  trends: OAYearCount[],
  s2Papers: S2Paper[],
  apiKey: string
): Promise<LandscapeResult> {
  const topWorks = works.slice(0, 50).map((w) => ({
    title: w.title,
    year: w.publication_year,
    citations: w.cited_by_count,
    doi: w.doi,
    authors: w.authorships.slice(0, 3).map((a) => ({
      name: a.author.display_name,
      institution: a.institutions[0]?.display_name ?? "Unknown",
    })),
    concepts: w.concepts.slice(0, 5).map((c) => c.display_name),
    abstract: w.abstract.slice(0, 400),
  }));

  const topAuthors = authors.slice(0, 20).map((a) => {
    const inst = (a.last_known_institutions ?? [])[0];
    return {
      name: a.display_name,
      institution: inst?.display_name ?? "Unknown",
      country: inst?.country_code ?? "?",
      works: a.works_count,
      citations: a.cited_by_count,
      h_index: a.summary_stats?.h_index ?? 0,
      specialties: (a.x_concepts ?? []).slice(0, 4).map((c) => c.display_name),
    };
  });

  const recentS2 = s2Papers.slice(0, 15).map((p) => ({
    title: p.title,
    year: p.year,
    citations: p.citationCount,
    influential: p.influentialCitationCount,
    fields: p.fieldsOfStudy ?? [],
    abstract: p.abstract?.slice(0, 300) ?? "",
  }));

  const dataPayload = JSON.stringify(
    { topic, topWorks, topAuthors, publicationTrends: trends, recentHighImpact: recentS2 },
    null,
    2
  ).slice(0, 90_000);

  const responseSchema = {
    name: "LandscapeResult",
    strict: true,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        foundational_papers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              authors: { type: "array", items: { type: "string" } },
              year: { type: "number" },
              cited_by: { type: "number" },
              doi: { type: ["string", "null"] },
              why_foundational: { type: "string" },
            },
            required: ["title", "authors", "year", "cited_by", "doi", "why_foundational"],
            additionalProperties: false,
          },
        },
        prolific_authors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              institution: { type: "string" },
              country: { type: "string" },
              paper_count: { type: "number" },
              total_citations: { type: "number" },
              h_index: { type: "number" },
              specialization: { type: "string" },
            },
            required: ["name", "institution", "country", "paper_count", "total_citations", "h_index", "specialization"],
            additionalProperties: false,
          },
        },
        citation_clusters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              key_papers: { type: "array", items: { type: "string" } },
              key_authors: { type: "array", items: { type: "string" } },
              size: { type: "string", enum: ["small", "medium", "large"] },
            },
            required: ["name", "description", "key_papers", "key_authors", "size"],
            additionalProperties: false,
          },
        },
        publication_trends: {
          type: "array",
          items: {
            type: "object",
            properties: {
              year: { type: "number" },
              count: { type: "number" },
              growth_rate: { type: ["number", "null"] },
              notable: { type: ["string", "null"] },
            },
            required: ["year", "count", "growth_rate", "notable"],
            additionalProperties: false,
          },
        },
        emerging_trends: {
          type: "array",
          items: {
            type: "object",
            properties: {
              theme: { type: "string" },
              evidence: { type: "string" },
              momentum_score: { type: "number" },
              comment: { type: "string" },
            },
            required: ["theme", "evidence", "momentum_score", "comment"],
            additionalProperties: false,
          },
        },
        interdisciplinary_connections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              connection_type: { type: "string", enum: ["borrows_methods", "shared_applications", "theoretical_overlap"] },
              description: { type: "string" },
              key_papers: { type: "array", items: { type: "string" } },
            },
            required: ["field", "connection_type", "description", "key_papers"],
            additionalProperties: false,
          },
        },
        strategic_insights: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "foundational_papers", "prolific_authors", "citation_clusters", "publication_trends", "emerging_trends", "interdisciplinary_connections", "strategic_insights"],
      additionalProperties: false,
    },
  };

  const systemPrompt = `You are an expert research analyst. Analyze academic literature data and produce a comprehensive research landscape map. Never mention, reference, or allude to any specific data providers, APIs, databases, or tools used to collect the underlying data (e.g. do not name any academic databases, search APIs, or AI models). Present all findings as your own analysis.`;

  const userPrompt = `Analyze this data and produce a comprehensive research landscape map. Rules: foundational_papers 8-12 items, prolific_authors 8-10, citation_clusters 3-6, emerging_trends 3-5 (momentum_score 1-10), interdisciplinary_connections 2-4, strategic_insights exactly 5. For publication_trends, set growth_rate to null for the first year (no prior year to compare). Do not mention any data sources, APIs, or databases by name in any field.

DATA:
${dataPayload}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 16384,
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: responseSchema },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Mercury API error ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content ?? "";

    try {
      return JSON.parse(text) as LandscapeResult;
    } catch {
      throw new Error(`Mercury returned invalid JSON. Raw (first 500): ${text.slice(0, 500)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
