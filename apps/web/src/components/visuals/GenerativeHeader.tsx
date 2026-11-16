import type { CSSProperties, ReactNode } from "react";
import {
  hashSlug,
  resolveVisualTheme,
  type ResolvedVisualTheme,
  type VisualTheme,
} from "@/lib/visual-theme";

export type GenerativeHeaderVariant = "banner" | "cover" | "compact";

type GenerativeHeaderProps = {
  slug: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 后台选择的主题；非法值按 `auto` 处理。 */
  theme?: VisualTheme | string | null;
  variant?: GenerativeHeaderVariant;
  /** 题头标题的语义层级，默认用 `<strong>`。 */
  headingLevel?: 1 | 2 | 3;
  className?: string;
  /** 额外元信息（活动状态、发布时间、所属活动等）。 */
  children?: ReactNode;
};

type ArtParams = {
  seed: number;
  rings: number;
  offsetX: number;
  offsetY: number;
  tilt: number;
  gap: number;
  uid: string;
};

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 220;

function buildParams(slug: string, theme: ResolvedVisualTheme): ArtParams {
  const seed = hashSlug(`${slug}:${theme}`);
  return {
    seed,
    rings: 3 + (seed % 5),
    offsetX: 120 + (seed % 560),
    offsetY: 46 + ((seed >> 8) % 96),
    tilt: (seed >> 4) % 60,
    gap: 16 + ((seed >> 12) % 14),
    uid: `gh-${seed.toString(36)}-${hashSlug(slug).toString(36)}`,
  };
}

function astrolabeArt({ rings, offsetX, offsetY, tilt, uid }: ArtParams) {
  const radians = (tilt * Math.PI) / 180;
  return (
    <>
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${uid}-grid)`} />
      {Array.from({ length: rings }).map((_, index) => (
        <circle
          key={`ring-${index}`}
          cx={offsetX}
          cy={offsetY}
          r={(index + 1) * 30}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.3 - index * 0.04}
          strokeDasharray={index % 2 === 0 ? "none" : "3 5"}
        />
      ))}
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = radians + (index * Math.PI) / 6;
        const radius = 30 * rings + 22;
        return (
          <line
            key={`spoke-${index}`}
            x1={offsetX}
            y1={offsetY}
            x2={offsetX + Math.cos(angle) * radius}
            y2={offsetY + Math.sin(angle) * radius}
            stroke="currentColor"
            strokeOpacity={index % 3 === 0 ? 0.24 : 0.12}
          />
        );
      })}
      <circle cx={offsetX} cy={offsetY} r={3.5} fill="currentColor" fillOpacity={0.55} />
      <line
        x1={0}
        y1={offsetY}
        x2={VIEW_WIDTH}
        y2={offsetY}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeDasharray="6 4"
      />
      <line
        x1={offsetX}
        y1={0}
        x2={offsetX}
        y2={VIEW_HEIGHT}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeDasharray="6 4"
      />
    </>
  );
}

function steleArt({ seed, offsetX, gap, uid }: ArtParams) {
  const columns = 5 + (seed % 4);
  const top = 34 + (seed % 26);
  return (
    <>
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${uid}-lattice)`} />
      {Array.from({ length: columns }).map((_, index) => {
        const x = 90 + index * (620 / Math.max(columns - 1, 1));
        return (
          <line
            key={`groove-${index}`}
            x1={x}
            y1={top}
            x2={x}
            y2={VIEW_HEIGHT - top / 2}
            stroke="currentColor"
            strokeOpacity={0.16 + (index % 2) * 0.08}
          />
        );
      })}
      <line
        x1={offsetX - 140}
        y1={VIEW_HEIGHT - 46}
        x2={offsetX + 140}
        y2={VIEW_HEIGHT - 46}
        stroke="currentColor"
        strokeOpacity={0.22}
      />
      <line
        x1={offsetX - 96}
        y1={VIEW_HEIGHT - 34}
        x2={offsetX + 96}
        y2={VIEW_HEIGHT - 34}
        stroke="currentColor"
        strokeOpacity={0.16}
      />
      <line
        x1={40}
        y1={top + gap}
        x2={VIEW_WIDTH - 40}
        y2={top + gap}
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeDasharray="2 6"
      />
    </>
  );
}

function graticuleArt({ seed, offsetX, offsetY, tilt }: ArtParams) {
  const meridians = 7 + (seed % 4);
  return (
    <>
      {Array.from({ length: meridians }).map((_, index) => {
        const x = (VIEW_WIDTH / meridians) * index + 24;
        const bend = ((index % 3) - 1) * 26;
        return (
          <path
            key={`meridian-${index}`}
            d={`M ${x} 0 Q ${x + bend} ${VIEW_HEIGHT / 2} ${x} ${VIEW_HEIGHT}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.16 + (index % 2) * 0.08}
          />
        );
      })}
      {Array.from({ length: 6 }).map((_, index) => {
        const y = 24 + index * 34;
        return (
          <line
            key={`parallel-${index}`}
            x1={18}
            y1={y}
            x2={VIEW_WIDTH - 18}
            y2={y + ((index % 2) - 0.5) * 8}
            stroke="currentColor"
            strokeOpacity={0.14 + (index % 3) * 0.05}
            strokeDasharray={index % 2 === 0 ? "none" : "5 5"}
          />
        );
      })}
      <ellipse
        cx={offsetX}
        cy={offsetY}
        rx={168}
        ry={112}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.24}
      />
      <ellipse
        cx={offsetX}
        cy={offsetY}
        rx={112}
        ry={74}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeDasharray="4 6"
      />
      {Array.from({ length: 4 }).map((_, index) => {
        const angle = ((tilt + index * 45) * Math.PI) / 180;
        return (
          <line
            key={`rhumb-${index}`}
            x1={offsetX - Math.cos(angle) * 420}
            y1={offsetY - Math.sin(angle) * 420}
            x2={offsetX + Math.cos(angle) * 420}
            y2={offsetY + Math.sin(angle) * 420}
            stroke="currentColor"
            strokeOpacity={0.1}
          />
        );
      })}
    </>
  );
}

function manuscriptArt({ seed, gap, offsetX, uid }: ArtParams) {
  const margin = 58 + (seed % 28);
  return (
    <>
      <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill={`url(#${uid}-ruled)`} />
      <line
        x1={margin}
        y1={0}
        x2={margin}
        y2={VIEW_HEIGHT}
        stroke="currentColor"
        strokeOpacity={0.3}
      />
      <line
        x1={margin + 7}
        y1={0}
        x2={margin + 7}
        y2={VIEW_HEIGHT}
        stroke="currentColor"
        strokeOpacity={0.18}
      />
      {Array.from({ length: 5 }).map((_, index) => (
        <line
          key={`note-${index}`}
          x1={margin + 34}
          y1={26 + index * gap + 4}
          x2={margin + 34 + 120 + ((seed >> index) % 190)}
          y2={26 + index * gap + 4}
          stroke="currentColor"
          strokeOpacity={0.14}
        />
      ))}
      <circle
        cx={offsetX}
        cy={VIEW_HEIGHT - 54}
        r={38}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.14}
      />
      <circle
        cx={offsetX + 12}
        cy={VIEW_HEIGHT - 46}
        r={26}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.1}
      />
    </>
  );
}

function artFor(theme: ResolvedVisualTheme, params: ArtParams) {
  switch (theme) {
    case "stele":
      return steleArt(params);
    case "graticule":
      return graticuleArt(params);
    case "manuscript":
      return manuscriptArt(params);
    case "astrolabe":
    default:
      return astrolabeArt(params);
  }
}

function patternsFor(theme: ResolvedVisualTheme, { uid, gap }: ArtParams) {
  return (
    <defs>
      <pattern
        id={`${uid}-grid`}
        width="26"
        height="26"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(0)"
      >
        <path
          d="M 26 0 L 0 0 0 26"
          fill="none"
          stroke="currentColor"
          strokeOpacity={theme === "astrolabe" ? 0.13 : 0.09}
          strokeWidth="0.75"
        />
      </pattern>
      <pattern id={`${uid}-lattice`} width={gap * 2} height={gap * 2} patternUnits="userSpaceOnUse">
        <path
          d={`M ${gap} 0 L ${gap} ${gap * 2} M 0 ${gap} L ${gap * 2} ${gap}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.08}
          strokeWidth="0.75"
        />
      </pattern>
      <pattern id={`${uid}-ruled`} width={VIEW_WIDTH} height={gap} patternUnits="userSpaceOnUse">
        <line
          x1="0"
          y1={gap - 0.5}
          x2={VIEW_WIDTH}
          y2={gap - 0.5}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth="0.75"
        />
      </pattern>
    </defs>
  );
}

/**
 * 零图片的确定性题头：同一 `slug` + 主题永远渲染同一幅 SVG 版画。
 * 不使用 `Math.random`，也不引用任何外部图片或字体。
 */
export function GenerativeHeader({
  slug,
  title,
  subtitle,
  theme = "auto",
  variant = "banner",
  headingLevel,
  className,
  children,
}: GenerativeHeaderProps) {
  const resolved = resolveVisualTheme(theme, slug);
  const params = buildParams(slug, resolved);
  const Heading: "h1" | "h2" | "h3" | null = headingLevel
    ? (`h${headingLevel}` as "h1" | "h2" | "h3")
    : null;
  const style = {
    "--generative-hue": 22 + (params.seed % 38),
    "--generative-tilt": `${params.tilt}deg`,
  } as CSSProperties;

  return (
    <header
      className={`generative-header${className ? ` ${className}` : ""}`}
      data-theme={resolved}
      data-variant={variant}
      style={style}
    >
      <svg
        className="generative-header-art"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        {patternsFor(resolved, params)}
        {artFor(resolved, params)}
        <rect
          x="9"
          y="9"
          width={VIEW_WIDTH - 18}
          height={VIEW_HEIGHT - 18}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.32}
          strokeWidth="1.5"
        />
        <rect
          x="15"
          y="15"
          width={VIEW_WIDTH - 30}
          height={VIEW_HEIGHT - 30}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth="0.75"
        />
      </svg>
      <div className="generative-header-body">
        <span className="generative-header-code">ARCHIVE · {slug.toUpperCase()}</span>
        {Heading ? (
          <Heading className="generative-header-title">{title}</Heading>
        ) : (
          <strong className="generative-header-title">{title}</strong>
        )}
        {subtitle ? <p className="generative-header-subtitle">{subtitle}</p> : null}
        {children ? <div className="generative-header-extra">{children}</div> : null}
      </div>
    </header>
  );
}
