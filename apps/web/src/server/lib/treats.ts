import { get } from "../db/sql";

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

/** 首页点心小游戏的全站统计（`treat_stats` 只有 id=1 一行）。 */
export async function getTreatTotals(): Promise<TreatTotals> {
  const row = await get<TreatTotalsRow>(
    `SELECT cookie_eaten, tea_drunk, cookie_broken, tea_broken
     FROM treat_stats WHERE id = 1`,
  );

  return {
    cookieEaten: Number(row?.cookie_eaten ?? 0),
    teaDrunk: Number(row?.tea_drunk ?? 0),
    cookieBroken: Number(row?.cookie_broken ?? 0),
    teaBroken: Number(row?.tea_broken ?? 0),
  };
}
