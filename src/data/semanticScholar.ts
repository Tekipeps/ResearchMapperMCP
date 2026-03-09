// Semantic Scholar API client — free, no auth required for basic use
// Docs: https://api.semanticscholar.org/graph/v1

const BASE_URL = "https://api.semanticscholar.org/graph/v1";
const TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ResearchMapper/1.0" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export interface S2Paper {
  paperId: string;
  title: string;
  year: number | null;
  citationCount: number;
  influentialCitationCount: number;
  abstract: string | null;
  authors: Array<{ authorId: string; name: string }>;
  fieldsOfStudy: string[] | null;
  publicationTypes: string[] | null;
  externalIds: { DOI?: string; ArXiv?: string } | null;
}

export async function searchRecentPapers(
  topic: string,
  limit = 20
): Promise<S2Paper[]> {
  const params = new URLSearchParams({
    query: topic,
    limit: String(Math.min(limit, 100)),
    fields: [
      "paperId", "title", "year", "citationCount",
      "influentialCitationCount", "abstract", "authors",
      "fieldsOfStudy", "publicationTypes", "externalIds",
    ].join(","),
  });
  const url = `${BASE_URL}/paper/search?${params}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { data: S2Paper[] };
    return data.data ?? [];
  } catch {
    // Non-critical — degrade gracefully
    return [];
  }
}
