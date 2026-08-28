// Domain types for the RxTruth pipeline.

export interface HarvestedClaim {
  id: string;
  text: string;
  sourceUrl: string | null;
  sourceName: string | null;
  harvestQuery: string;
  harvestedAt: string; // ISO timestamp
}

export type Verdict = 'TRUE' | 'FALSE' | 'MISLEADING' | 'UNVERIFIABLE';

export interface AiSpamCheck {
  isAi: boolean;
  confidence: number;
}

export interface VerificationResult {
  verdict: Verdict;
  confidence: number; // 0..1
  reasoning: string;
  sources: string[];
  aiSpam: AiSpamCheck | null;
  factCheck: {
    answer: string;
    evidence: string[];
    sources: string[];
  } | null;
  txHashes: string[]; // on-chain proof — one per paid Miner call
  verifiedAt: string; // ISO timestamp
}

export interface ClaimRecord {
  claim: HarvestedClaim;
  verification: VerificationResult | null;
  status: 'harvested' | 'verifying' | 'verified' | 'failed';
  error?: string;
}

export interface TopFalseClaim {
  text: string;
  sourceName: string | null;
  confidence: number;
  reasoning: string;
  txHashes: string[];
}

export interface DailyIndex {
  date: string; // YYYY-MM-DD in local timezone
  totalClaims: number;
  verdictCounts: Record<Verdict, number>;
  topFalseClaims: TopFalseClaim[];
  generatedAt: string; // ISO timestamp
}
