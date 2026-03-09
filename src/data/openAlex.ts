// OpenAlex API client — free, no auth required
// Docs: https://docs.openalex.org/

const BASE_URL = "https://api.openalex.org";
const TIMEOUT_MS = 10_000;

function politeHeader(email?: string): Record<string, string> {
  return email ? { "User-Agent": `ResearchMapper/1.0 (mailto:${email})` } : {};
}

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export interface OAWork {
  id: string;
  title: string;
  publication_year: number;
  cited_by_count: number;
  doi: string | null;
  authorships: Array<{
    author: { id: string; display_name: string };
    institutions: Array<{ id: string; display_name: string; country_code: string }>;
  }>;
  concepts: Array<{ display_name: string; score: number; level: number }>;
  topics: Array<{ display_name: string; score: number; subfield?: { display_name: string } }>;
  abstract_inverted_index: Record<string, number[]> | null;
  primary_location: {
    source?: { display_name: string; type: string };
  } | null;
}

export interface OAAuthor {
  id: string;
  display_name: string;
  works_count: number;
  cited_by_count: number;
  summary_stats: { h_index: number; i10_index: number; "2yr_mean_citedness": number } | null;
  last_known_institutions: Array<{
    display_name: string;
    country_code: string;
    type: string;
  }> | null;
  x_concepts: Array<{ display_name: string; score: number }> | null;
}

export interface OAYearCount {
  year: number;
  works_count: number;
}

// Reconstruct abstract from inverted index
function reconstructAbstract(inv: Record<string, number[]> | null): string {
  if (!inv) return "";
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, w]) => w).join(" ").slice(0, 600);
}

export async function searchWorks(
  topic: string,
  yearFrom: number,
  limit = 60,
  email?: string
): Promise<(OAWork & { abstract: string })[]> {
  const params = new URLSearchParams({
    search: topic,
    filter: `publication_year:>${yearFrom - 1},type:article`,
    sort: "cited_by_count:desc",
    "per-page": String(Math.min(limit, 100)),
    select: [
      "id", "title", "publication_year", "cited_by_count", "doi",
      "authorships", "concepts", "topics", "abstract_inverted_index",
      "primary_location",
    ].join(","),
  });

  const url = `${BASE_URL}/works?${params}`;
  const res = await fetchWithTimeout(url, politeHeader(email));
  if (!res.ok) throw new Error(`OpenAlex works error: ${res.status}`);
  const data = (await res.json()) as { results: OAWork[] };
  return data.results.map((w) => ({
    ...w,
    abstract: reconstructAbstract(w.abstract_inverted_index),
  }));
}

export async function getPublicationTrends(
  topic: string,
  yearFrom: number,
  email?: string
): Promise<OAYearCount[]> {
  // Use group_by=publication_year to get counts per year
  const params = new URLSearchParams({
    search: topic,
    filter: `publication_year:>${yearFrom - 1},type:article`,
    "group-by": "publication_year",
  });
  const url = `${BASE_URL}/works?${params}`;
  const res = await fetchWithTimeout(url, politeHeader(email));
  if (!res.ok) throw new Error(`OpenAlex trends error: ${res.status}`);
  const data = (await res.json()) as {
    group_by: Array<{ key: string; key_display_name: string; count: number }>;
  };
  return data.group_by
    .map((g) => ({ year: parseInt(g.key), works_count: g.count }))
    .filter((g) => !isNaN(g.year) && g.year >= yearFrom)
    .sort((a, b) => a.year - b.year);
}

export async function getAuthors(
  authorIds: string[],
  email?: string
): Promise<OAAuthor[]> {
  if (authorIds.length === 0) return [];
  // Batch up to 50 IDs, extract short ID from full URL (e.g. "https://openalex.org/A123" → "A123")
  const batch = authorIds.filter(Boolean).slice(0, 50);
  if (batch.length === 0) return [];
  const filter = `ids.openalex:${batch.map((id) => id.split("/").pop() ?? "").filter(Boolean).join("|")}`;
  const params = new URLSearchParams({
    filter,
    "per-page": "50",
    select: "id,display_name,works_count,cited_by_count,summary_stats,last_known_institutions,x_concepts",
  });
  const url = `${BASE_URL}/authors?${params}`;
  const res = await fetchWithTimeout(url, politeHeader(email));
  if (!res.ok) throw new Error(`OpenAlex authors error: ${res.status}`);
  const data = (await res.json()) as { results: OAAuthor[] };
  return data.results;
}
