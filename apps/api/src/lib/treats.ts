import { getDb } from "@/lib/db";

export type TreatKind = "cookie" | "tea";
export type TreatOutcome = "served" | "broken";

export type TreatTotals = {
  cookieEaten: number;
  teaDrunk: number;
  cookieBroken: number;
  teaBroken: number;
};

type TreatTotalsRow = {
  cookie_eaten: number;
  tea_drunk: number;
  cookie_broken: number;
  tea_broken: number;
};

export function getTreatTotals(): TreatTotals {
  const row = getDb()
    .prepare(
      `SELECT cookie_eaten, tea_drunk, cookie_broken, tea_broken
       FROM treat_stats WHERE id = 1`,
    )
    .get() as TreatTotalsRow;

  return {
    cookieEaten: row.cookie_eaten,
    teaDrunk: row.tea_drunk,
    cookieBroken: row.cookie_broken,
    teaBroken: row.tea_broken,
  };
}
