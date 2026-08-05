import type { LayoutMode } from "@/lib/layout";

const dot = (x: number, y: number, r = 3.2, fill = "#4262ff") => (
  <circle cx={x} cy={y} r={r} fill={fill} />
);
const line = (x1: number, y1: number, x2: number, y2: number) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1" />
);

export function LayoutPreview({
  mode,
  className = "h-10 w-14",
}: {
  mode: LayoutMode | "cards";
  className?: string;
}) {
  let content: React.ReactNode;
  switch (mode) {
    case "topDown":
      content = <>{line(28, 8, 12, 24)}{line(28, 8, 28, 24)}{line(28, 8, 44, 24)}{dot(28, 8)}{dot(12, 26)}{dot(28, 26)}{dot(44, 26)}</>;
      break;
    case "horizontal":
      content = <>{line(10, 20, 30, 8)}{line(10, 20, 30, 20)}{line(10, 20, 30, 32)}{dot(10, 20)}{dot(32, 8)}{dot(32, 20)}{dot(32, 32)}</>;
      break;
    case "vertical":
      content = <>{line(28, 6, 14, 20)}{line(28, 6, 42, 20)}{line(14, 20, 8, 34)}{line(42, 20, 48, 34)}{dot(28, 6)}{dot(14, 20)}{dot(42, 20)}{dot(8, 34)}{dot(48, 34)}</>;
      break;
    case "list":
      content = <>{dot(10, 8, 2.6)}{dot(18, 16, 2.6)}{dot(26, 24, 2.6)}{dot(18, 32, 2.6)}{line(10, 8, 10, 34)}</>;
      break;
    case "linear":
      content = <>
        {line(16, 17, 30, 17)}
        {line(34, 17, 46, 17)}
        <path d="M 10 24 L 10 31 L 30 31" fill="none" stroke="#94a3b8" strokeWidth="1" />
        <rect x="4" y="10" width="12" height="14" rx="4" fill="#4262ff" />
        {dot(32, 17)}
        {dot(48, 17)}
        {dot(32, 31)}
      </>;
      break;
    case "radial":
      content = <>
        <path d="M 28 2 A 18 18 0 0 1 46 20 L 39 20 A 11 11 0 0 0 28 9 Z" fill="#4262ff" />
        <path d="M 46 20 A 18 18 0 0 1 28 38 L 28 31 A 11 11 0 0 0 39 20 Z" fill="#818cf8" />
        <path d="M 28 38 A 18 18 0 0 1 10 20 L 17 20 A 11 11 0 0 0 28 31 Z" fill="#a5b4fc" />
        <path d="M 10 20 A 18 18 0 0 1 28 2 L 28 9 A 11 11 0 0 0 17 20 Z" fill="#c7d2fe" />
        <path d="M 28 9 A 11 11 0 0 1 28 31 L 28 25 A 5 5 0 0 0 28 15 Z" fill="#6366f1" />
        <path d="M 28 31 A 11 11 0 0 1 28 9 L 28 15 A 5 5 0 0 0 28 25 Z" fill="#93c5fd" />
        <circle cx="28" cy="20" r="5" fill="#3730a3" />
      </>;
      break;
    case "matrix":
      content = <>
        <rect x="6" y="5" width="44" height="7" rx="1" fill="#4262ff" />
        <rect x="6" y="14" width="14" height="20" rx="1" fill="#a5b4fc" />
        <rect x="22" y="14" width="12" height="6" rx="1" fill="#c7d2fe" />
        <rect x="36" y="14" width="14" height="6" rx="1" fill="#dbeafe" />
        <rect x="22" y="22" width="12" height="5" rx="1" fill="#c7d2fe" />
        <rect x="36" y="22" width="14" height="5" rx="1" fill="#dbeafe" />
        <rect x="22" y="29" width="12" height="5" rx="1" fill="#c7d2fe" />
        <rect x="36" y="29" width="14" height="5" rx="1" fill="#dbeafe" />
      </>;
      break;
    case "cards":
      content = <>
        <rect x="5" y="5" width="13" height="12" rx="2" fill="#a5b4fc" />
        <rect x="21.5" y="5" width="13" height="12" rx="2" fill="#c7d2fe" />
        <rect x="38" y="5" width="13" height="12" rx="2" fill="#dbeafe" />
        <rect x="5" y="22" width="13" height="12" rx="2" fill="#c7d2fe" />
        <rect x="21.5" y="22" width="13" height="12" rx="2" fill="#dbeafe" />
        <rect x="38" y="22" width="13" height="12" rx="2" fill="#a5b4fc" />
      </>;
      break;
    case "fromParentFreeForm":
      content = <>
        {line(28, 20, 12, 9)}
        {line(28, 20, 43, 8)}
        {line(28, 20, 48, 24)}
        {line(28, 20, 38, 34)}
        {line(28, 20, 15, 33)}
        {line(28, 20, 7, 21)}
        {line(43, 8, 51, 5)}
        {line(15, 33, 7, 36)}
        {dot(28, 20, 4.2)}
        {dot(12, 9)}
        {dot(43, 8)}
        {dot(48, 24)}
        {dot(38, 34)}
        {dot(15, 33)}
        {dot(7, 21)}
        {dot(51, 5, 2.4, "#a5b4fc")}
        {dot(7, 36, 2.4, "#a5b4fc")}
      </>;
      break;
    case "mindMap":
      content = <>
        {line(22, 20, 17, 10)}
        {line(22, 20, 17, 30)}
        {line(34, 20, 39, 10)}
        {line(34, 20, 39, 30)}
        {line(8, 10, 4, 5)}
        {line(8, 10, 4, 16)}
        {line(48, 30, 52, 25)}
        {line(48, 30, 52, 35)}
        <rect x="22" y="16" width="12" height="8" rx="3" fill="#4262ff" />
        <rect x="8" y="7" width="9" height="6" rx="2" fill="#818cf8" />
        <rect x="8" y="27" width="9" height="6" rx="2" fill="#818cf8" />
        <rect x="39" y="7" width="9" height="6" rx="2" fill="#818cf8" />
        <rect x="39" y="27" width="9" height="6" rx="2" fill="#818cf8" />
        <rect x="1" y="3" width="6" height="4" rx="1.5" fill="#c7d2fe" />
        <rect x="1" y="14" width="6" height="4" rx="1.5" fill="#c7d2fe" />
        <rect x="49" y="23" width="6" height="4" rx="1.5" fill="#c7d2fe" />
        <rect x="49" y="33" width="6" height="4" rx="1.5" fill="#c7d2fe" />
      </>;
      break;
    default:
      content = <>{dot(12, 12)}{dot(40, 10)}{dot(22, 28)}{dot(46, 30)}{dot(10, 32)}</>;
  }
  return (
    <svg
      viewBox="0 0 56 40"
      aria-hidden="true"
      className={`${className} rounded-md border border-border bg-muted/40`}
    >
      {content}
    </svg>
  );
}
