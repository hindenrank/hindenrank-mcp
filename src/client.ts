const DEFAULT_BASE_URL = "https://hindenrank.com/api/v1";

export interface HindenrankClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export interface RateLimitMeta {
  used: number;
  remaining: number;
  resetsAt: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    tier: string;
    rateLimit: RateLimitMeta;
    [key: string]: unknown;
  };
}

export interface BasicProtocol {
  slug: string;
  name: string;
  sector: string;
  website: string;
  tvl: number | null;
  grade: string;
  rawScore: number;
  gradeBreakdown: Record<string, number>;
  topRisks: string[];
  verdict: string;
  retailSummary: string;
  lastScanned: string;
  [key: string]: unknown;
}

export interface ComparisonResult {
  protocols: Record<string, BasicProtocol>;
  comparison: {
    safest: string;
    riskiest: string;
    bestValue: string;
  };
  notFound?: string[];
}

export interface SectorInfo {
  name: string;
  protocolCount: number;
  averageRawScore: number;
}

export class HindenrankClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(options: HindenrankClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.apiKey = options.apiKey;
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    const response = await globalThis.fetch(url.toString(), { headers });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg = body?.error?.message ?? `HTTP ${response.status}`;
      throw new Error(msg);
    }

    return response.json() as Promise<ApiResponse<T>>;
  }

  async getProtocol(slug: string): Promise<ApiResponse<BasicProtocol>> {
    return this.fetch<BasicProtocol>(`${this.baseUrl}/protocols/${encodeURIComponent(slug)}`);
  }

  async searchProtocols(query: string, limit = 10): Promise<ApiResponse<BasicProtocol[]>> {
    return this.fetch<BasicProtocol[]>(`${this.baseUrl}/protocols/search`, {
      q: query,
      limit: String(limit),
    });
  }

  async listProtocols(options?: {
    sector?: string;
    minGrade?: string;
    maxGrade?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<BasicProtocol[]>> {
    const params: Record<string, string> = {};
    if (options?.sector) params.sector = options.sector;
    if (options?.minGrade) params.minGrade = options.minGrade;
    if (options?.maxGrade) params.maxGrade = options.maxGrade;
    if (options?.limit) params.limit = String(options.limit);
    if (options?.offset) params.offset = String(options.offset);
    return this.fetch<BasicProtocol[]>(`${this.baseUrl}/protocols`, params);
  }

  async compareProtocols(slugs: string[]): Promise<ApiResponse<ComparisonResult>> {
    return this.fetch<ComparisonResult>(`${this.baseUrl}/protocols/compare`, {
      slugs: slugs.join(","),
    });
  }

  async listSectors(): Promise<ApiResponse<SectorInfo[]>> {
    return this.fetch<SectorInfo[]>(`${this.baseUrl}/sectors`);
  }
}
