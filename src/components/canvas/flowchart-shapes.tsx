import type { ReactNode } from "react";
import {
  ArrowRight,
  Circle,
  Cloud,
  Database,
  Diamond,
  FileText,
  Flower2,
  Hexagon,
  Leaf,
  RectangleHorizontal,
  Square,
  SquareStack,
  Star,
  Triangle,
} from "lucide-react";
import type { ShapeType } from "@/lib/types";

export interface FlowchartShapeOption {
  variant: ShapeType;
  label: string;
  icon: ReactNode;
}

function MiniPolygonIcon({ points }: { points: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <polygon points={points} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function MiniPathIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function EllipseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export const FLOWCHART_SHAPES: readonly FlowchartShapeOption[] = [
  { variant: "rectangle", label: "Rectangle", icon: <Square className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "rounded", label: "Rounded", icon: <RectangleHorizontal className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "circle", label: "Circle", icon: <Circle className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "ellipse", label: "Ellipse", icon: <EllipseIcon /> },
  { variant: "capsule", label: "Capsule", icon: <RectangleHorizontal className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "triangle", label: "Triangle", icon: <Triangle className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "diamond", label: "Diamond", icon: <Diamond className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "hexagon", label: "Hexagon", icon: <Hexagon className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "star", label: "Star", icon: <Star className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "arrow", label: "Arrow", icon: <ArrowRight className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "callout", label: "Callout", icon: <MiniPolygonIcon points="2,2 22,2 22,17 15,17 12,22 9,17 2,17" /> },
  { variant: "parallelogram", label: "Data", icon: <MiniPolygonIcon points="6,3 22,3 18,21 2,21" /> },
  { variant: "trapezoid", label: "Manual operation", icon: <MiniPolygonIcon points="6,3 18,3 22,21 2,21" /> },
  { variant: "document", label: "Document", icon: <FileText className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "database", label: "Database", icon: <Database className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "predefinedProcess", label: "Predefined process", icon: <SquareStack className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "delay", label: "Delay", icon: <MiniPathIcon d="M4 3h8c5 0 9 4 9 9s-4 9-9 9H4z" /> },
  { variant: "cloud", label: "Cloud", icon: <Cloud className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "offPageConnector", label: "Off-page connector", icon: <MiniPolygonIcon points="3,3 21,3 21,16 12,22 3,16" /> },
  { variant: "flower", label: "Flower", icon: <Flower2 className="h-5 w-5 stroke-[1.5]" /> },
  { variant: "leaf", label: "Leaf", icon: <Leaf className="h-5 w-5 stroke-[1.5]" /> },
];
