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
      content = <>{line(8, 20, 48, 20)}{dot(10, 20)}{dot(23, 20)}{dot(36, 20)}{dot(48, 20)}</>;
      break;
    case "radial":
      content = <>{line(28, 20, 12, 12)}{line(28, 20, 44, 12)}{line(28, 20, 14, 30)}{line(28, 20, 42, 30)}{dot(28, 20, 4)}{dot(12, 12)}{dot(44, 12)}{dot(14, 30)}{dot(42, 30)}</>;
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
      content = <>{line(28, 20, 12, 10)}{line(28, 20, 46, 14)}{line(28, 20, 20, 33)}{line(28, 20, 44, 32)}{dot(28, 20, 4.2, "#ef4444")}{dot(12, 10)}{dot(46, 14)}{dot(20, 33)}{dot(44, 32)}</>;
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
