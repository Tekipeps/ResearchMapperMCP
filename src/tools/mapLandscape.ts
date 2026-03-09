import { searchWorks, getPublicationTrends, getAuthors } from "../data/openAlex.ts";
import { searchRecentPapers } from "../data/semanticScholar.ts";
import { synthesizeLandscape } from "../synthesis/gemini.ts";
import { synthesizeLandscapeMercury } from "../synthesis/mercury.ts";
import type { MapLandscapeInput, MapLandscapeOutput } from "./types.ts";

const DEPTH_CONFIG = {
  quick: { workLimit: 30, yearRange: 5 },
  standard: { workLimit: 60, yearRange: 10 },
  deep: { workLimit: 100, yearRange: 15 },
};

// Deduplicate author IDs across top papers — skip null IDs (anonymous authors)
function extractTopAuthorIds(works: Awaited<ReturnType<typeof searchWorks>>, max = 25): string[] {
  const authorCitationMap = new Map<string, number>();
  for (const work of works) {
    for (const authorship of work.authorships) {
      const id = authorship.author.id;
      if (!id) continue;
      const existing = authorCitationMap.get(id) ?? 0;
      authorCitationMap.set(id, existing + work.cited_by_count);
    }
  }
  return [...authorCitationMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => id);
}

export async function mapResearchLandscape(
  input: MapLandscapeInput,
  geminiApiKey: string,
  inceptionApiKey?: string,
  provider: "gemini" | "mercury" = "mercury"
): Promise<MapLandscapeOutput> {
  const { topic, depth = "standard", year_range, email } = input;
  const config = DEPTH_CONFIG[depth];
  const resolvedYearRange = year_range ?? config.yearRange;
  const yearFrom = new Date().getFullYear() - resolvedYearRange;

  // Phase 1: Parallel data fetch (OpenAlex works + trends + Semantic Scholar)
  const t1 = Date.now();
  const [works, trends, s2Papers] = await Promise.all([
    searchWorks(topic, yearFrom, config.workLimit, email),
    getPublicationTrends(topic, yearFrom, email),
    searchRecentPapers(topic, 20),
  ]);
  const t1ms = Date.now() - t1;

  if (works.length === 0) {
    throw new Error(`No papers found for topic "${topic}". Try a broader or differently phrased topic.`);
  }

  // Phase 2: Enrich top authors
  const t2 = Date.now();
  const topAuthorIds = extractTopAuthorIds(works, 25);
  const authors = await getAuthors(topAuthorIds, email);
  const t2ms = Date.now() - t2;

  // Phase 3: Synthesis (Gemini or Mercury)
  const t3 = Date.now();
  let synthesis;
  if (provider === "mercury") {
    if (!inceptionApiKey) throw new Error("INCEPTION_API_KEY is required for mercury provider");
    synthesis = await synthesizeLandscapeMercury(topic, works, authors, trends, s2Papers, inceptionApiKey);
  } else {
    synthesis = await synthesizeLandscape(topic, works, authors, trends, s2Papers, geminiApiKey);
  }
  const t3ms = Date.now() - t3;

  if (process.env["NODE_ENV"] !== "production") {
    console.log(`\nTiming breakdown [provider: ${provider}]:`);
    console.log(`  Phase 1 — data fetch (parallel):  ${t1ms}ms`);
    console.log(`  Phase 2 — author enrichment:       ${t2ms}ms`);
    console.log(`  Phase 3 — synthesis:               ${t3ms}ms`);
    console.log(`  Total:                             ${t1ms + t2ms + t3ms}ms`);
  }

  // Coerce nulls for schema compliance: growth_rate null→0, notable null→undefined
  const normalizedTrends = synthesis.publication_trends.map(({ notable, ...t }) => ({
    ...t,
    growth_rate: t.growth_rate ?? 0,
    ...(notable != null ? { notable } : {}),
  }));

  return {
    ...synthesis,
    publication_trends: normalizedTrends,
    topic,
    generated_at: new Date().toISOString(),
    data_coverage: {
      total_papers_analyzed: works.length,
      year_range: `${yearFrom}–${new Date().getFullYear()}`,
      sources: ["OpenAlex", "Semantic Scholar"],
    },
  };
}
