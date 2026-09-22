import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { getTreatTotals } from "@/lib/treats";
import type { TreatKind, TreatOutcome } from "@/lib/treats";
import { getUserFromRequest } from "@/lib/user-auth";
import { consumeRateLimit } from "@/lib/request-security";

// 每次点击有千分之一的概率摔碎。调整这个数字即可改变概率。
const BREAK_CHANCE_DENOMINATOR = 1000;

const counterFields = {
  cookie: {
    served: "cookie_eaten",
    broken: "cookie_broken",
  },
  tea: {
    served: "tea_drunk",
    broken: "tea_broken",
  },
} as const;

export function GET() {
  return Response.json({ totals: getTreatTotals() });
}

export async function POST(request: Request) {
  const limit = consumeRateLimit("treat", request, 120, 15 * 60);
  if (!limit.allowed) {
    return Response.json(
      { error: "点心拿得太快了，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  if (body?.kind !== "cookie" && body?.kind !== "tea") {
    return Response.json({ error: "点心种类不正确。" }, { status: 400 });
  }

  const kind: TreatKind = body.kind;
  const outcome: TreatOutcome =
    crypto.randomInt(BREAK_CHANCE_DENOMINATOR) === 0 ? "broken" : "served";
  const field = counterFields[kind][outcome];
  const user = getUserFromRequest(request);
  const db = getDb();

  db.transaction(() => {
    // 字段名来自上面的固定映射，不使用用户输入。
    db.prepare(
      `UPDATE treat_stats
       SET ${field} = ${field} + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    ).run();

    if (user) {
      db.prepare(
        `INSERT INTO user_treat_stats(user_id, ${field}) VALUES (?, 1)
         ON CONFLICT(user_id) DO UPDATE SET
           ${field} = ${field} + 1,
           updated_at = CURRENT_TIMESTAMP`,
      ).run(user.id);
    }
  })();

  return Response.json({
    kind,
    outcome,
    totals: getTreatTotals(),
  });
}
