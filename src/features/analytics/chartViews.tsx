import { useEffect, useRef, useState } from "react";
import { type ChartDatum, EmptyChart, useHasMounted } from "./charts";

type ColorFor = (datum: ChartDatum, index: number) => string;

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const target = element;
    const resizeObserver = new ResizeObserver(() => setWidth(target.clientWidth));
    setWidth(target.clientWidth);
    resizeObserver.observe(target);

    return () => resizeObserver.disconnect();
  }, []);

  return [ref, width] as const;
}

// Picks dark or light ink for text drawn on a coloured fill. Accepts hex
// colours and CSS custom properties that resolve to hex.
function readableTextColor(color: string) {
  let hex = color;

  if (color.startsWith("var(")) {
    const name = color.slice(4, -1).trim();
    hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  const match = /^#?([0-9a-f]{6})$/i.exec(hex);

  if (!match) {
    return "#ffffff";
  }

  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.4 ? "#172033" : "#ffffff";
}

function sharePercent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/* ------------------------------------------------------------------ */
/* Treemap                                                             */
/* ------------------------------------------------------------------ */

interface TreemapRect {
  datum: ChartDatum;
  height: number;
  index: number;
  width: number;
  x: number;
  y: number;
}

const TREEMAP_HEIGHT = 260;

export function TreemapChart({
  colorFor,
  data,
}: {
  colorFor: ColorFor;
  data: ChartDatum[];
}) {
  const [containerRef, width] = useElementWidth();
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const items = data
    .map((datum, index) => ({ datum, index }))
    .filter((item) => item.datum.value > 0);
  const total = items.reduce((sum, item) => sum + item.datum.value, 0);

  if (total === 0) {
    return <EmptyChart />;
  }

  const rects = width > 0 ? squarify(items, 0, 0, width, TREEMAP_HEIGHT) : [];
  const active = rects.find((rect) => rect.datum.label === activeLabel);

  return (
    <div>
      <div
        className="relative w-full overflow-hidden rounded-md"
        onPointerLeave={() => setActiveLabel(null)}
        ref={containerRef}
        style={{ height: TREEMAP_HEIGHT }}
      >
        {rects.map((rect) => {
          const showLabel = rect.width > 64 && rect.height > 36;
          const isDimmed = activeLabel !== null && activeLabel !== rect.datum.label;

          return (
            <div
              aria-label={`${rect.datum.label}: ${rect.datum.value} (${sharePercent(rect.datum.value, total)}%)`}
              className="absolute overflow-hidden rounded-[4px] p-2 outline-none transition-[opacity,transform] duration-500 ease-out focus-visible:ring-2 focus-visible:ring-foreground"
              key={rect.datum.label}
              onBlur={() => setActiveLabel(null)}
              onFocus={() => setActiveLabel(rect.datum.label)}
              onPointerEnter={() => setActiveLabel(rect.datum.label)}
              style={{
                backgroundColor: colorFor(rect.datum, rect.index),
                color: readableTextColor(colorFor(rect.datum, rect.index)),
                height: Math.max(0, rect.height - 2),
                left: rect.x,
                opacity: hasMounted ? (isDimmed ? 0.45 : 1) : 0,
                top: rect.y,
                transform: hasMounted ? "scale(1)" : "scale(0.96)",
                width: Math.max(0, rect.width - 2),
              }}
              tabIndex={0}
            >
              {showLabel ? (
                <>
                  <p className="truncate text-xs font-semibold leading-4">
                    {rect.datum.label}
                  </p>
                  <p className="text-lg font-semibold leading-6 tabular-nums">
                    {rect.datum.value}
                  </p>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-2 h-4 truncate text-xs text-muted">
        {active
          ? `${active.datum.label}: ${active.datum.value} (${sharePercent(active.datum.value, total)}%)`
          : "Area is proportional to the count · hover a tile for details"}
      </p>
    </div>
  );
}

// Squarified treemap layout (Bruls, Huizing & van Wijk).
function squarify(
  items: Array<{ datum: ChartDatum; index: number }>,
  x: number,
  y: number,
  width: number,
  height: number,
): TreemapRect[] {
  const sorted = [...items].sort((left, right) => right.datum.value - left.datum.value);
  const total = sorted.reduce((sum, item) => sum + item.datum.value, 0);
  const scale = (width * height) / total;
  const areas = sorted.map((item) => ({ ...item, area: item.datum.value * scale }));
  const rects: TreemapRect[] = [];
  let remaining = areas;
  let box = { x, y, width, height };

  while (remaining.length > 0) {
    const shortSide = Math.min(box.width, box.height);
    let row = [remaining[0]];
    let rowIndex = 1;

    while (rowIndex < remaining.length) {
      const candidate = [...row, remaining[rowIndex]];

      if (worstRatio(candidate, shortSide) > worstRatio(row, shortSide)) {
        break;
      }

      row = candidate;
      rowIndex += 1;
    }

    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    const isHorizontal = box.width >= box.height;
    const thickness = rowArea / shortSide;
    let offset = 0;

    row.forEach((item) => {
      const length = item.area / thickness;

      rects.push({
        datum: item.datum,
        index: item.index,
        height: isHorizontal ? length : thickness,
        width: isHorizontal ? thickness : length,
        x: isHorizontal ? box.x : box.x + offset,
        y: isHorizontal ? box.y + offset : box.y,
      });
      offset += length;
    });

    box = isHorizontal
      ? { x: box.x + thickness, y: box.y, width: box.width - thickness, height: box.height }
      : { x: box.x, y: box.y + thickness, width: box.width, height: box.height - thickness };
    remaining = remaining.slice(row.length);
  }

  return rects;
}

function worstRatio(row: Array<{ area: number }>, side: number) {
  const sum = row.reduce((total, item) => total + item.area, 0);
  const max = Math.max(...row.map((item) => item.area));
  const min = Math.min(...row.map((item) => item.area));
  const sideSquared = side * side;

  return Math.max((sideSquared * max) / (sum * sum), (sum * sum) / (sideSquared * min));
}

/* ------------------------------------------------------------------ */
/* Waffle                                                              */
/* ------------------------------------------------------------------ */

export function WaffleChart({
  colorFor,
  data,
}: {
  colorFor: ColorFor;
  data: ChartDatum[];
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const items = data
    .map((datum, index) => ({ datum, index }))
    .filter((item) => item.datum.value > 0);
  const total = items.reduce((sum, item) => sum + item.datum.value, 0);

  if (total === 0) {
    return <EmptyChart />;
  }

  // Largest-remainder rounding so the 100 squares always add up.
  const exact = items.map((item) => (item.datum.value / total) * 100);
  const cells = exact.map(Math.floor);
  let leftover = 100 - cells.reduce((sum, count) => sum + count, 0);
  exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((left, right) => right.remainder - left.remainder)
    .forEach(({ index }) => {
      if (leftover > 0) {
        cells[index] += 1;
        leftover -= 1;
      }
    });
  const squares = items.flatMap((item, itemIndex) =>
    Array.from({ length: cells[itemIndex] }, () => item),
  );

  return (
    <div
      className="flex flex-col items-center gap-5 sm:flex-row sm:items-center"
      onPointerLeave={() => setActiveLabel(null)}
    >
      <div aria-hidden="true" className="grid shrink-0 grid-cols-10 gap-[3px]">
        {squares.map((item, squareIndex) => (
          <span
            className="h-3.5 w-3.5 rounded-[3px] transition-opacity duration-500"
            key={squareIndex}
            onPointerEnter={() => setActiveLabel(item.datum.label)}
            style={{
              backgroundColor: colorFor(item.datum, item.index),
              opacity: !hasMounted
                ? 0
                : activeLabel && activeLabel !== item.datum.label
                  ? 0.25
                  : 1,
              transitionDelay: hasMounted ? `${squareIndex * 4}ms` : "0ms",
            }}
          />
        ))}
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {items.map((item, itemIndex) => (
          <li
            aria-label={`${item.datum.label}: ${item.datum.value} (${cells[itemIndex]} of 100 squares)`}
            className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
              activeLabel && activeLabel !== item.datum.label ? "opacity-50" : ""
            } ${activeLabel === item.datum.label ? "bg-slate-50" : ""}`}
            key={item.datum.label}
            onBlur={() => setActiveLabel(null)}
            onFocus={() => setActiveLabel(item.datum.label)}
            onPointerEnter={() => setActiveLabel(item.datum.label)}
            tabIndex={0}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colorFor(item.datum, item.index) }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{item.datum.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{item.datum.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">
              {cells[itemIndex]}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Radial bars                                                         */
/* ------------------------------------------------------------------ */

const RADIAL_SIZE = 220;
const RADIAL_SWEEP = 270;

export function RadialBarChart({
  colorFor,
  data,
  formatValue = String,
  maxValue,
}: {
  colorFor: ColorFor;
  data: ChartDatum[];
  formatValue?: (value: number) => string;
  maxValue?: number;
}) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const rings = data.slice(0, 6);
  const max = maxValue ?? Math.max(1, ...rings.map((item) => item.value));

  if (rings.length === 0) {
    return <EmptyChart />;
  }

  const ringWidth = 12;
  const gap = 6;
  const outerRadius = RADIAL_SIZE / 2 - ringWidth / 2 - 2;

  return (
    <div
      className="flex flex-col items-center gap-4 sm:flex-row"
      onPointerLeave={() => setActiveLabel(null)}
    >
      <svg aria-hidden="true" className="shrink-0" height={RADIAL_SIZE} width={RADIAL_SIZE}>
        {rings.map((item, index) => {
          const radius = outerRadius - index * (ringWidth + gap);
          const circumference = 2 * Math.PI * radius;
          const trackLength = (RADIAL_SWEEP / 360) * circumference;
          const valueLength = Math.min(1, item.value / max) * trackLength;
          const isDimmed = activeLabel !== null && activeLabel !== item.label;

          if (radius <= ringWidth) {
            return null;
          }

          return (
            <g
              key={item.label}
              onPointerEnter={() => setActiveLabel(item.label)}
              opacity={isDimmed ? 0.35 : 1}
              style={{ transition: "opacity 200ms" }}
              transform={`rotate(135 ${RADIAL_SIZE / 2} ${RADIAL_SIZE / 2})`}
            >
              <circle
                cx={RADIAL_SIZE / 2}
                cy={RADIAL_SIZE / 2}
                fill="none"
                r={radius}
                stroke="#f1f5f9"
                strokeDasharray={`${trackLength} ${circumference}`}
                strokeLinecap="round"
                strokeWidth={ringWidth}
              />
              <circle
                cx={RADIAL_SIZE / 2}
                cy={RADIAL_SIZE / 2}
                fill="none"
                r={radius}
                stroke={colorFor(item, index)}
                strokeDasharray={`${hasMounted ? valueLength : 0} ${circumference}`}
                strokeLinecap="round"
                strokeWidth={ringWidth}
                style={{ transition: "stroke-dasharray 900ms ease-out" }}
              />
            </g>
          );
        })}
      </svg>
      <ul className="w-full min-w-0 space-y-1.5">
        {rings.map((item, index) => (
          <li
            aria-label={`${item.label}: ${formatValue(item.value)}`}
            className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary ${
              activeLabel && activeLabel !== item.label ? "opacity-50" : ""
            } ${activeLabel === item.label ? "bg-slate-50" : ""}`}
            key={item.label}
            onBlur={() => setActiveLabel(null)}
            onFocus={() => setActiveLabel(item.label)}
            onPointerEnter={() => setActiveLabel(item.label)}
            tabIndex={0}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(item, index) }}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatValue(item.value)}
            </span>
          </li>
        ))}
        {data.length > rings.length ? (
          <li className="px-2 text-xs text-muted">
            Showing the first {rings.length} of {data.length}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Radar                                                               */
/* ------------------------------------------------------------------ */

const RADAR_SIZE = 260;

export function RadarChart({
  color,
  data,
  shortLabel = (label) => label,
}: {
  color: string;
  data: ChartDatum[];
  shortLabel?: (label: string) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const hasMounted = useHasMounted();
  const max = Math.max(1, ...data.map((item) => item.value));

  if (data.length < 3 || data.every((item) => item.value === 0)) {
    return <EmptyChart />;
  }

  const center = RADAR_SIZE / 2;
  const radius = center - 36;
  const angleFor = (index: number) => (Math.PI * 2 * index) / data.length - Math.PI / 2;
  const pointFor = (index: number, value: number) => {
    const distance = (value / max) * radius * (hasMounted ? 1 : 0);
    return [center + Math.cos(angleFor(index)) * distance, center + Math.sin(angleFor(index)) * distance];
  };
  const polygon = data.map((item, index) => pointFor(index, item.value).join(",")).join(" ");
  const active = activeIndex === null ? null : data[activeIndex];

  return (
    <div className="flex flex-col items-center">
      <svg
        aria-label={data.map((item) => `${item.label}: ${item.value}`).join(", ")}
        height={RADAR_SIZE}
        onPointerLeave={() => setActiveIndex(null)}
        role="img"
        width={RADAR_SIZE}
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            fill="none"
            key={ring}
            points={data
              .map((_, index) =>
                [
                  center + Math.cos(angleFor(index)) * radius * ring,
                  center + Math.sin(angleFor(index)) * radius * ring,
                ].join(","),
              )
              .join(" ")}
            stroke="var(--color-border)"
          />
        ))}
        {data.map((item, index) => {
          const labelX = center + Math.cos(angleFor(index)) * (radius + 20);
          const labelY = center + Math.sin(angleFor(index)) * (radius + 20);

          return (
            <g key={item.label}>
              <line
                stroke="var(--color-border)"
                x1={center}
                x2={center + Math.cos(angleFor(index)) * radius}
                y1={center}
                y2={center + Math.sin(angleFor(index)) * radius}
              />
              <text
                className={`text-[11px] ${activeIndex === index ? "fill-foreground font-semibold" : "fill-muted"}`}
                dominantBaseline="middle"
                textAnchor="middle"
                x={labelX}
                y={labelY}
              >
                {shortLabel(item.label)}
              </text>
            </g>
          );
        })}
        <polygon
          fill={color}
          fillOpacity={0.18}
          points={polygon}
          stroke={color}
          strokeLinejoin="round"
          strokeWidth={2}
          style={{ transition: "all 800ms ease-out" }}
        />
        {data.map((item, index) => {
          const [x, y] = pointFor(index, item.value);

          return (
            <g key={item.label} onPointerEnter={() => setActiveIndex(index)}>
              <circle cx={x} cy={y} fill="transparent" r={14} />
              <circle
                cx={x}
                cy={y}
                fill={color}
                r={activeIndex === index ? 5.5 : 3.5}
                stroke="var(--color-surface)"
                strokeWidth={2}
                style={{ transition: "all 800ms ease-out" }}
              />
            </g>
          );
        })}
      </svg>
      <p className="h-4 text-xs text-muted">
        {active
          ? `${active.label}: ${active.value}`
          : "Further from the centre means more · hover a point"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked columns over time                                           */
/* ------------------------------------------------------------------ */

const STACK_HEIGHT = 220;

export function StackedColumnChart({
  formatLabel,
  labels,
  series,
}: {
  formatLabel: (label: string, short: boolean) => string;
  labels: string[];
  series: Array<{ color: string; id: string; label: string; values: number[] }>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const hasMounted = useHasMounted();
  const totals = labels.map((_, index) =>
    series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const labelEvery = Math.max(1, Math.ceil(labels.length / 8));

  if (labels.length === 0 || totals.every((total) => total === 0)) {
    return <EmptyChart />;
  }

  return (
    <div className="relative">
      <div
        className="flex items-end gap-1"
        onPointerLeave={() => setActiveIndex(null)}
        style={{ height: STACK_HEIGHT }}
      >
        {labels.map((label, index) => (
          <div
            className={`flex h-full min-w-0 flex-1 flex-col-reverse gap-[2px] transition-opacity ${
              activeIndex !== null && activeIndex !== index ? "opacity-45" : ""
            }`}
            key={label}
            onPointerEnter={() => setActiveIndex(index)}
          >
            {series.map((item) => {
              const value = item.values[index] ?? 0;

              return value > 0 ? (
                <div
                  className="w-full rounded-[3px] transition-[height] duration-700 ease-out"
                  key={item.id}
                  style={{
                    backgroundColor: item.color,
                    height: hasMounted ? `${(value / max) * 100}%` : "0%",
                  }}
                />
              ) : null;
            })}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 border-t border-border pt-1.5">
        {labels.map((label, index) => (
          <span className="min-w-0 flex-1 truncate text-center text-[11px] text-muted" key={label}>
            {index % labelEvery === 0 ? formatLabel(label, true) : ""}
          </span>
        ))}
      </div>
      {activeIndex !== null ? (
        <div className="pointer-events-none absolute right-0 top-0 z-10 min-w-40 whitespace-nowrap rounded-md border border-border bg-surface px-3 py-2 shadow-popover">
          <p className="mb-1 text-xs font-medium text-foreground">
            {formatLabel(labels[activeIndex], false)} · {totals[activeIndex]} total
          </p>
          {series.map((item) => (
            <p className="flex items-center gap-2 text-xs" key={item.id}>
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-semibold tabular-nums text-foreground">
                {item.values[activeIndex] ?? 0}
              </span>
              <span className="text-muted">{item.label}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Flow (one-step Sankey)                                              */
/* ------------------------------------------------------------------ */

export interface FlowLink {
  from: string;
  to: string;
  value: number;
}

const FLOW_HEIGHT = 280;
const FLOW_NODE_WIDTH = 10;
const FLOW_NODE_GAP = 10;
const FLOW_LABEL_SPACE = 132;

export function FlowChart({
  colorFor,
  links,
  order,
}: {
  colorFor: (label: string) => string;
  links: FlowLink[];
  // Node order top to bottom on both sides.
  order: readonly string[];
}) {
  const [containerRef, width] = useElementWidth();
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const hasMounted = useHasMounted();
  const total = links.reduce((sum, link) => sum + link.value, 0);

  if (total === 0) {
    return <EmptyChart message="No status changes recorded yet." />;
  }

  const sortByOrder = (labels: string[]) =>
    [...new Set(labels)].sort((left, right) => order.indexOf(left) - order.indexOf(right));
  const sources = sortByOrder(links.map((link) => link.from));
  const targets = sortByOrder(links.map((link) => link.to));
  const sumFor = (label: string, side: "from" | "to") =>
    links.filter((link) => link[side] === label).reduce((sum, link) => sum + link.value, 0);
  const maxNodes = Math.max(sources.length, targets.length);
  const scale = (FLOW_HEIGHT - FLOW_NODE_GAP * (maxNodes - 1)) / total;

  function layoutNodes(labels: string[], side: "from" | "to") {
    let y = 0;
    return new Map(
      labels.map((label) => {
        const height = Math.max(2, sumFor(label, side) * scale);
        const node = { height, y };
        y += height + FLOW_NODE_GAP;
        return [label, node] as const;
      }),
    );
  }

  const sourceNodes = layoutNodes(sources, "from");
  const targetNodes = layoutNodes(targets, "to");
  const leftX = FLOW_LABEL_SPACE;
  const rightX = Math.max(leftX + 80, width - FLOW_LABEL_SPACE);
  const sourceOffsets = new Map(sources.map((label) => [label, 0]));
  const targetOffsets = new Map(targets.map((label) => [label, 0]));
  const orderedLinks = [...links].sort(
    (left, right) =>
      order.indexOf(left.from) - order.indexOf(right.from) ||
      order.indexOf(left.to) - order.indexOf(right.to),
  );
  const ribbons = orderedLinks.map((link) => {
    const thickness = Math.max(1.5, link.value * scale);
    const source = sourceNodes.get(link.from)!;
    const target = targetNodes.get(link.to)!;
    const y0 = source.y + (sourceOffsets.get(link.from) ?? 0);
    const y1 = target.y + (targetOffsets.get(link.to) ?? 0);
    sourceOffsets.set(link.from, (sourceOffsets.get(link.from) ?? 0) + thickness);
    targetOffsets.set(link.to, (targetOffsets.get(link.to) ?? 0) + thickness);
    const x0 = leftX + FLOW_NODE_WIDTH;
    const x1 = rightX;
    const midX = (x0 + x1) / 2;

    return {
      key: `${link.from}→${link.to}`,
      link,
      path: `M${x0},${y0} C${midX},${y0} ${midX},${y1} ${x1},${y1} L${x1},${y1 + thickness} C${midX},${y1 + thickness} ${midX},${y0 + thickness} ${x0},${y0 + thickness} Z`,
    };
  });
  const active = ribbons.find((ribbon) => ribbon.key === activeLink);

  return (
    <div ref={containerRef}>
      {width > 0 ? (
        <svg
          aria-label={links.map((link) => `${link.from} to ${link.to}: ${link.value}`).join(", ")}
          className="block overflow-visible"
          height={FLOW_HEIGHT}
          onPointerLeave={() => setActiveLink(null)}
          role="img"
          width={width}
        >
          {ribbons.map((ribbon) => (
            <path
              d={ribbon.path}
              fill={colorFor(ribbon.link.from)}
              key={ribbon.key}
              onPointerEnter={() => setActiveLink(ribbon.key)}
              opacity={!hasMounted ? 0 : activeLink === null ? 0.4 : activeLink === ribbon.key ? 0.75 : 0.12}
              style={{ cursor: "pointer", transition: "opacity 400ms ease-out" }}
            />
          ))}
          {[...sourceNodes].map(([label, node]) => (
            <g key={`from-${label}`}>
              <rect fill={colorFor(label)} height={node.height} rx={2} width={FLOW_NODE_WIDTH} x={leftX} y={node.y} />
              <text
                className="fill-foreground text-[11px]"
                dominantBaseline="middle"
                textAnchor="end"
                x={leftX - 8}
                y={node.y + node.height / 2}
              >
                {label} · {sumFor(label, "from")}
              </text>
            </g>
          ))}
          {[...targetNodes].map(([label, node]) => (
            <g key={`to-${label}`}>
              <rect fill={colorFor(label)} height={node.height} rx={2} width={FLOW_NODE_WIDTH} x={rightX} y={node.y} />
              <text
                className="fill-foreground text-[11px]"
                dominantBaseline="middle"
                x={rightX + FLOW_NODE_WIDTH + 8}
                y={node.y + node.height / 2}
              >
                {label} · {sumFor(label, "to")}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div style={{ height: FLOW_HEIGHT }} />
      )}
      <p className="mt-2 h-4 truncate text-xs text-muted">
        {active
          ? `${active.link.from} → ${active.link.to}: ${active.link.value} ${active.link.value === 1 ? "change" : "changes"}`
          : "Left: status before · Right: status after · hover a flow"}
      </p>
    </div>
  );
}
