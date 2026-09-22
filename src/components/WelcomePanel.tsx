"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TreatKind, TreatOutcome, TreatTotals } from "@/lib/treats";
import { fetchJson } from "@/lib/client-fetch";

export type WelcomeCopy = {
  title: string;
  opening: string;
  aboutLink: string;
  randomLink: string;
  treatPrefix: string;
  cookieButton: string;
  teaButton: string;
  treatSuffix: string;
  closing: string;
  visitPrefix: string;
  visitSuffix: string;
};

type TreatAnimation = {
  kind: TreatKind;
  outcome: TreatOutcome;
  id: number;
} | null;

type TreatResponse = {
  kind: TreatKind;
  outcome: TreatOutcome;
  totals: TreatTotals;
};

function treatMessage(animation: NonNullable<TreatAnimation>, totals: TreatTotals) {
  if (animation.outcome === "broken") {
    const isCookie = animation.kind === "cookie";
    return (
      <>
        {isCookie ? "……摔碎了。这是全站摔碎的第 " : "……茶杯摔碎了。这是全站摔碎的第 "}
        <span className="welcome-treat-number">
          {isCookie ? totals.cookieBroken : totals.teaBroken}
        </span>
        {isCookie ? " 块饼干。" : " 只茶杯。"}
      </>
    );
  }

  const isCookie = animation.kind === "cookie";
  return (
    <>
      {isCookie ? "大家已经吃掉了 " : "大家已经喝掉了 "}
      <span className="welcome-treat-number">
        {isCookie ? totals.cookieEaten : totals.teaDrunk}
      </span>
      {isCookie ? " 块饼干。" : " 杯红茶。"}
    </>
  );
}

export function WelcomePanel({
  initialVisits,
  welcome,
}: {
  initialVisits: number;
  welcome: WelcomeCopy;
}) {
  const [visits, setVisits] = useState(initialVisits);
  const [totals, setTotals] = useState<TreatTotals | null>(null);
  const [treat, setTreat] = useState<TreatAnimation>(null);
  const [busy, setBusy] = useState<TreatKind | null>(null);
  const [treatError, setTreatError] = useState("");

  async function requestTreat(kind: TreatKind) {
    if (busy) return;
    setBusy(kind);
    setTreatError("");

    const { response, data: result } = await fetchJson<TreatResponse>("/api/treat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });

    if (
      !response?.ok ||
      !result?.totals ||
      !["cookie", "tea"].includes(result.kind) ||
      !["served", "broken"].includes(result.outcome)
    ) {
      setBusy(null);
      setTreatError("点心柜暂时卡住了，请稍后再试。");
      return;
    }

    setTotals(result.totals);
    // id 会让连续点击同一种点心时重新播放动画。
    setTreat({ kind: result.kind, outcome: result.outcome, id: Date.now() });
    setBusy(null);
  }

  useEffect(() => {
    let active = true;

    fetch("/api/visit", { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (active && result && Number.isFinite(result.count)) {
          setVisits(result.count);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel welcome">
      <h1 className="panel-title yellow">{welcome.title}</h1>
      <div className="panel-body welcome-lines">
        <p>{welcome.opening}</p>
        <p>
          <Link href="/about">{welcome.aboutLink}</Link>
        </p>
        <p>
          <Link href="/random">{welcome.randomLink}</Link>
        </p>
        <p className="welcome-treats">
          {welcome.treatPrefix}
          <button type="button" disabled={Boolean(busy)} onClick={() => requestTreat("cookie")}>
            {busy === "cookie" ? "正在拿饼干……" : welcome.cookieButton}
          </button>
          ，
          <button type="button" disabled={Boolean(busy)} onClick={() => requestTreat("tea")}>
            {busy === "tea" ? "正在倒红茶……" : welcome.teaButton}
          </button>
          {welcome.treatSuffix}
        </p>
        {treat && totals ? (
          <div className="welcome-treat-result" key={treat.id} role="status">
            <span
              className={`welcome-treat-animation is-${treat.kind} is-${treat.outcome}`}
              aria-hidden="true"
            >
              {treat.kind === "cookie" ? (
                <>
                  <span className="cookie-picture" />
                  <span className="treat-plate" />
                  <span className="cookie-crumb crumb-one" />
                  <span className="cookie-crumb crumb-two" />
                  <span className="cookie-crumb crumb-three" />
                  <span className="cookie-crumb crumb-four" />
                </>
              ) : (
                <>
                  <span className="tea-steam" />
                  <span className="tea-cup" />
                  <span className="treat-plate" />
                  <span className="tea-spill" />
                  <span className="cup-shard shard-one" />
                  <span className="cup-shard shard-two" />
                  <span className="cup-shard shard-three" />
                </>
              )}
            </span>
            <span>{treatMessage(treat, totals)}</span>
          </div>
        ) : null}
        {treatError ? <p className="welcome-treat-error">{treatError}</p> : null}
        <p>{welcome.closing}</p>
        <p className="welcome-visit-count">
          {welcome.visitPrefix}
          <strong aria-live="polite">{Math.max(0, visits)}</strong>
          {welcome.visitSuffix}
        </p>
      </div>
    </section>
  );
}
