export interface FoundationalPaper {
  title: string;
  authors: string[];
  year: number;
  cited_by: number;
  doi: string | null;
  why_foundational: string;
}

export interface ProlificAuthor {
  name: string;
  institution: string;
  country: string;
  paper_count: number;
  total_citations: number;
  h_index: number;
  specialization: string;
}

export interface CitationCluster {
  name: string;
  description: string;
  key_papers: string[];
  key_authors: string[];
  size: "small" | "medium" | "large";
}

export interface PublicationTrend {
  year: number;
  count: number;
  growth_rate: number;
  notable?: string;
}

export interface EmergingTrend {
  theme: string;
  evidence: string;
  momentum_score: number;
  comment: string;
}

export interface InterdisciplinaryConnection {
  field: string;
  connection_type: "borrows_methods" | "shared_applications" | "theoretical_overlap";
  description: string;
  key_papers: string[];
}

export interface LandscapeResult {
  summary: string;
  foundational_papers: FoundationalPaper[];
  prolific_authors: ProlificAuthor[];
  citation_clusters: CitationCluster[];
  publication_trends: PublicationTrend[];
  emerging_trends: EmergingTrend[];
  interdisciplinary_connections: InterdisciplinaryConnection[];
  strategic_insights: string[];
}

export interface MapLandscapeInput {
  topic: string;
  depth?: "quick" | "standard" | "deep";
  year_range?: number;
  email?: string;
}

export interface MapLandscapeOutput extends LandscapeResult {
  topic: string;
  generated_at: string;
  data_coverage: {
    total_papers_analyzed: number;
    year_range: string;
    sources: string[];
  };
}
