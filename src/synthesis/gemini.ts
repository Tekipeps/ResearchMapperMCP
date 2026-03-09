import { GoogleGenAI, Type } from "@google/genai";
import type { OAWork, OAAuthor, OAYearCount } from "../data/openAlex.ts";
import type { S2Paper } from "../data/semanticScholar.ts";
import type { LandscapeResult } from "../tools/types.ts";

const MODEL = "gemini-2.5-flash";

export async function synthesizeLandscape(
  topic: string,
  works: (OAWork & { abstract: string })[],
  authors: OAAuthor[],
  trends: OAYearCount[],
  s2Papers: S2Paper[],
  apiKey: string
): Promise<LandscapeResult> {
  const ai = new GoogleGenAI({ apiKey });

  // Build a compact data payload for the prompt
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
  ).slice(0, 90_000); // stay within context limits

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      foundational_papers: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            authors: { type: Type.ARRAY, items: { type: Type.STRING } },
            year: { type: Type.NUMBER },
            cited_by: { type: Type.NUMBER },
            doi: { type: Type.STRING, nullable: true },
            why_foundational: { type: Type.STRING },
          },
          required: ["title", "authors", "year", "cited_by", "doi", "why_foundational"],
        },
      },
      prolific_authors: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            institution: { type: Type.STRING },
            country: { type: Type.STRING },
            paper_count: { type: Type.NUMBER },
            total_citations: { type: Type.NUMBER },
            h_index: { type: Type.NUMBER },
            specialization: { type: Type.STRING },
          },
          required: ["name", "institution", "country", "paper_count", "total_citations", "h_index", "specialization"],
        },
      },
      citation_clusters: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            key_papers: { type: Type.ARRAY, items: { type: Type.STRING } },
            key_authors: { type: Type.ARRAY, items: { type: Type.STRING } },
            size: { type: Type.STRING, enum: ["small", "medium", "large"] },
          },
          required: ["name", "description", "key_papers", "key_authors", "size"],
        },
      },
      publication_trends: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            year: { type: Type.NUMBER },
            count: { type: Type.NUMBER },
            growth_rate: { type: Type.NUMBER, nullable: true },
            notable: { type: Type.STRING, nullable: true },
          },
          required: ["year", "count", "growth_rate", "notable"],
        },
      },
      emerging_trends: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            theme: { type: Type.STRING },
            evidence: { type: Type.STRING },
            momentum_score: { type: Type.NUMBER },
            comment: { type: Type.STRING },
          },
          required: ["theme", "evidence", "momentum_score", "comment"],
        },
      },
      interdisciplinary_connections: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            field: { type: Type.STRING },
            connection_type: { type: Type.STRING, enum: ["borrows_methods", "shared_applications", "theoretical_overlap"] },
            description: { type: Type.STRING },
            key_papers: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["field", "connection_type", "description", "key_papers"],
        },
      },
      strategic_insights: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["summary", "foundational_papers", "prolific_authors", "citation_clusters", "publication_trends", "emerging_trends", "interdisciplinary_connections", "strategic_insights"],
  };

  const prompt = `You are an expert research analyst. Analyze this academic literature data and produce a comprehensive research landscape map.

Rules:
- foundational_papers: 8-12 most important papers (mix of most-cited AND historically pivotal)
- prolific_authors: top 8-10 by impact
- citation_clusters: 3-6 distinct schools of thought or sub-fields
- publication_trends: use the provided trend data, calculate growth_rate as YoY % change (null for first year)
- emerging_trends: 3-5 themes gaining momentum (momentum_score 1-10)
- interdisciplinary_connections: 2-4 most significant cross-field connections
- strategic_insights: exactly 5 concrete, non-obvious observations

DATA:
${dataPayload}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.2,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error("Gemini hit token limit — try 'quick' depth to reduce input size");
  }

  const text = response.text ?? "";

  try {
    return JSON.parse(text) as LandscapeResult;
  } catch {
    throw new Error(`Gemini returned invalid JSON (finish: ${finishReason}). Raw (first 500 chars): ${text.slice(0, 500)}`);
  }
}
