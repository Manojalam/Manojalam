"use client";

import { BaseEdge, type BaseEdgeProps } from "@xyflow/react";
import type { SVGProps } from "react";
import type { VidyaEdgeData } from "@/lib/types";
import {
  connectorStrokeDasharray,
  doubleConnectorStrokeWidths,
  resolveConnectorPathStyle,
} from "@/lib/canvas/connector-path-style";

interface ConnectorSvgPathProps extends Omit<SVGProps<SVGPathElement>, "d" | "color"> {
  d: string;
  edgeData: VidyaEdgeData;
  color: string;
  normalColor: string;
  width: number;
}

/** Paints a connector path without adding a second interaction path. */
export function ConnectorSvgPath({
  d,
  edgeData,
  color,
  normalColor,
  width,
  markerStart,
  markerEnd,
  ...props
}: ConnectorSvgPathProps) {
  const pathStyle = resolveConnectorPathStyle(edgeData);
  const commonProps: SVGProps<SVGPathElement> = {
    ...props,
    d,
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke",
    pointerEvents: props.pointerEvents ?? "none",
  };

  if (pathStyle === "double") {
    const strokes = doubleConnectorStrokeWidths(width);
    return (
      <>
        <path
          {...commonProps}
          data-export-normal-stroke={normalColor}
          stroke={color}
          strokeWidth={strokes.outer}
        />
        <path
          {...commonProps}
          stroke="var(--background)"
          strokeWidth={strokes.separator}
          markerStart={markerStart}
          markerEnd={markerEnd}
        />
      </>
    );
  }

  return (
    <path
      {...commonProps}
      data-export-normal-stroke={normalColor}
      stroke={color}
      strokeWidth={width}
      strokeDasharray={connectorStrokeDasharray(pathStyle)}
      markerStart={markerStart}
      markerEnd={markerEnd}
    />
  );
}

interface ConnectorPathProps {
  id: string;
  path: string;
  edgeData: VidyaEdgeData;
  color: string;
  normalColor: string;
  width: number;
  markerStart?: BaseEdgeProps["markerStart"];
  markerEnd?: BaseEdgeProps["markerEnd"];
  interactionWidth?: number;
}

/** Paints a normal React Flow edge while preserving its generous selection target. */
export function ConnectorPath({
  id,
  path,
  edgeData,
  color,
  normalColor,
  width,
  markerStart,
  markerEnd,
  interactionWidth,
}: ConnectorPathProps) {
  const pathStyle = resolveConnectorPathStyle(edgeData);

  if (pathStyle === "double") {
    return (
      <>
        <ConnectorSvgPath
          d={path}
          edgeData={edgeData}
          color={color}
          normalColor={normalColor}
          width={width}
          markerStart={markerStart}
          markerEnd={markerEnd}
        />
        <BaseEdge
          id={id}
          path={path}
          interactionWidth={interactionWidth}
          style={{ stroke: "transparent", strokeWidth: width }}
        />
      </>
    );
  }

  return (
    <BaseEdge
      data-export-normal-stroke={normalColor}
      id={id}
      path={path}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
      style={{
        stroke: color,
        strokeWidth: width,
        strokeDasharray: connectorStrokeDasharray(pathStyle),
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }}
    />
  );
}
