const SODA_BASE = "https://data.sfgov.org/resource";

export interface SodaQuery {
  dataset: string;
  limit?: number;
  where?: string;
  order?: string;
  select?: string;
  group?: string;
  offset?: number;
  having?: string;
}

export async function fetchSoda<T>(query: SodaQuery): Promise<T[]> {
  const params = new URLSearchParams();
  params.set("$limit", String(query.limit ?? 200));
  if (query.where) params.set("$where", query.where);
  if (query.order) params.set("$order", query.order);
  if (query.select) params.set("$select", query.select);
  if (query.group) params.set("$group", query.group);
  if (query.offset) params.set("$offset", String(query.offset));
  if (query.having) params.set("$having", query.having);

  const url = `${SODA_BASE}/${query.dataset}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SODA ${res.status}: ${res.statusText}`);
  return res.json();
}

export const DATASETS = {
  PARKING_METERS: "8vzz-qzz9",
  METER_TRANSACTIONS: "imvp-dq3v",
} as const;
