# Research Landscape Mapper

An MCP tool that synthesizes complete research landscape maps from academic literature — replacing expensive institutional platforms like Elsevier SciVal (€13k+/yr) and Clarivate InCites.

Given any topic, it returns:
- **Foundational papers** with reasoning for their significance
- **Prolific authors** with institution, h-index, specialization
- **Citation clusters** / schools of thought
- **Publication trends** with year-over-year growth rates
- **Emerging trends** with momentum scores
- **Interdisciplinary connections** to adjacent fields
- **Strategic insights** for researchers and institutions

## Setup

```bash
# 1. Copy env file and add your Gemini API key
cp .env.example .env
# Edit .env: set GEMINI_API_KEY

# 2. Install dependencies
bun install
```

Get a free Gemini API key at: https://aistudio.google.com/apikey

## Usage

### CLI (local testing)

```bash
bun run query "transformer neural networks"
bun run query "CRISPR gene editing" deep
bun run query "quantum error correction" quick
```

Output: formatted report in terminal + `landscape_<topic>_<timestamp>.json`

### MCP Server

```bash
# Start server
bun run dev          # development (with watch)
bun run start        # production

# Health check
curl http://localhost:3000/health
```

The server exposes an MCP endpoint at `POST /mcp` with the `map_research_landscape` tool.

## Tool: `map_research_landscape`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `topic` | string | required | Research topic (e.g. "transformer neural networks") |
| `depth` | enum | `standard` | `quick` (5yr/30 papers), `standard` (10yr/60), `deep` (15yr/100) |
| `year_range` | number | — | Override depth's year range |
| `email` | string | — | Email for OpenAlex polite pool (faster) |

Response time: ~15–25 seconds (under CTX Protocol's 30s SLA).

## Data Sources

- **OpenAlex** — free, open bibliometric data (primary source)
- **Semantic Scholar** — citation context, recent papers
- **Gemini 2.0 Flash** — synthesis, clustering, trend detection

## CTX Protocol Submission

This tool targets **Tier S** ($1,000 + 90% revenue share) — replaces SciVal/InCites analytics.

Deploy to Railway/Render (free tier, auto HTTPS):
```bash
# Railway
railway login && railway init && railway up

# Render: connect GitHub repo, set env vars, deploy
```

Register at: https://ctxprotocol.com/contribute
