// PubMed E-utilities client — real PMIDs, not AI-generated lookalikes.
// Free public API, no key required: https://www.ncbi.nlm.nih.gov/books/NBK25500/
//
// Pipeline:
//   1. esearch.fcgi?db=pubmed&term=<query>&retmax=5&retmode=json
//   2. for each id, esummary.fcgi?db=pubmed&id=<id>&retmode=json
//   3. return [{ pmid, title, journal, year, url }, ...]
//
// Used to give every claim a "real" medical citation (PMID + PubMed URL)
// instead of the AI guessing at journal names.

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TIMEOUT_MS = 12_000;
const MAX_RESULTS = 3;

export interface PubMedCitation {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  url: string;
}

function cleanQuery(claim: string): string {
  // Strip common prefixes, stopwords that don't help PubMed search,
  // and limit length. PubMed handles ~5-10 keyword queries best.
  const stripped = claim
    .toLowerCase()
    .replace(/^(that|claim|the fact that|is it true that|is it safe|can|do|does|are|will|is)\s+/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(' ').filter((w) =>
    w.length > 3 &&
    !['that', 'this', 'with', 'from', 'they', 'have', 'been', 'will', 'your', 'their', 'about', 'which', 'these', 'those', 'where', 'there', 'because', 'should', 'would', 'could'].includes(w)
  );
  return words.slice(0, 8).join(' ');
}

async function esearch(term: string): Promise<string[]> {
  const url = `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=${MAX_RESULTS}&retmode=json&sort=relevance`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) return [];
    const j = (await r.json()) as { esearchresult?: { idlist?: string[] } };
    return j.esearchresult?.idlist ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function esummary(id: string): Promise<PubMedCitation | null> {
  const url = `${EUTILS}/esummary.fcgi?db=pubmed&id=${encodeURIComponent(id)}&retmode=json`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: Record<string, { title?: string; fulljournalname?: string; journalabbreviation?: string; pubdate?: string; sortpubdate?: string }> };
    const rec = j.result?.[id];
    if (!rec?.title) return null;
    const date = rec.pubdate ?? rec.sortpubdate ?? '';
    const year = (date.match(/\b(19|20)\d{2}\b/) ?? [''])[0];
    return {
      pmid: id,
      title: rec.title,
      journal: rec.fulljournalname ?? rec.journalabbreviation ?? '',
      year,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Search PubMed for a claim, return up to 3 real citations.
 * Returns [] on any error (network, no results, malformed) — never throws.
 */
export async function pubmedSearch(claim: string): Promise<PubMedCitation[]> {
  const term = cleanQuery(claim);
  if (term.length < 5) return [];
  const ids = await esearch(term);
  if (ids.length === 0) return [];
  const out: PubMedCitation[] = [];
  for (const id of ids.slice(0, MAX_RESULTS)) {
    const c = await esummary(id);
    if (c) out.push(c);
  }
  return out;
}
