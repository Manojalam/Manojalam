import type { Edge } from "@xyflow/react";
import type { VidyaEdgeData } from "../types";
import {
  findConnectorLabelOwnerEdge,
  findLogicalConnectorEdgeIds,
} from "./connector-junction";

export const DEFAULT_CONNECTOR_LABEL_FONT_SIZE = 10;
export const DEFAULT_CONNECTOR_LABEL_COLOR = "#111827";
export const MIN_CONNECTOR_LABEL_FONT_SIZE = 8;
export const MAX_CONNECTOR_LABEL_FONT_SIZE = 48;

export interface ConnectorLabelStyleUpdate {
  label?: string;
  connectorColor?: string;
  labelColor?: string;
  labelColorSynced?: boolean;
  labelFontFamily?: string;
  labelFontSize?: number;
  labelFontWeight?: "normal" | "bold";
  labelFontStyle?: "normal" | "italic";
}

export interface ConnectorLabelPresentation {
  color?: string;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  synced: boolean;
}

function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONNECTOR_LABEL_FONT_SIZE;
  return Math.max(MIN_CONNECTOR_LABEL_FONT_SIZE, Math.min(MAX_CONNECTOR_LABEL_FONT_SIZE, Math.round(value)));
}

export function resolveConnectorColor(data: VidyaEdgeData): string {
  return data.color ?? data.layoutColor ?? "#94a3b8";
}

export function resolveConnectorLabelPresentation(data: VidyaEdgeData): ConnectorLabelPresentation {
  const synced = data.labelColorSynced === true;
  return {
    color: synced ? data.labelColor ?? resolveConnectorColor(data) : data.labelColor,
    fontFamily: data.labelFontFamily,
    fontSize: typeof data.labelFontSize === "number"
      ? clampFontSize(data.labelFontSize)
      : DEFAULT_CONNECTOR_LABEL_FONT_SIZE,
    fontWeight: data.labelFontWeight,
    fontStyle: data.labelFontStyle,
    synced,
  };
}

function markerWithColor(marker: Edge["markerStart"], color: string): Edge["markerStart"] {
  if (!marker || typeof marker === "string") return marker;
  return { ...marker, color };
}

/** Applies label styling to the label owner and synced line color to every junction segment. */
export function applyConnectorLabelStyleUpdate(
  edges: Edge[],
  connectorEdgeId: string,
  update: ConnectorLabelStyleUpdate
): Edge[] {
  const connector = edges.find((edge) => edge.id === connectorEdgeId);
  if (!connector) return edges;
  const owner = findConnectorLabelOwnerEdge(edges, connectorEdgeId) ?? connector;
  const ownerData = (owner.data ?? {}) as VidyaEdgeData;
  const logicalIds = new Set(findLogicalConnectorEdgeIds(edges, connectorEdgeId));
  const syncAfter = update.labelColorSynced ?? ownerData.labelColorSynced === true;

  let nextLabelColor = update.labelColor;
  let nextConnectorColor = update.connectorColor;
  if (update.labelColorSynced === true) {
    const color = update.labelColor
      ?? ownerData.labelColor
      ?? DEFAULT_CONNECTOR_LABEL_COLOR;
    nextLabelColor = color;
    nextConnectorColor = color;
  } else if (syncAfter && update.labelColor) {
    nextConnectorColor = update.labelColor;
  } else if (syncAfter && update.connectorColor) {
    nextLabelColor = update.connectorColor;
  }

  return edges.map((edge) => {
    const isOwner = edge.id === owner.id;
    const recolorConnector = logicalIds.has(edge.id) && typeof nextConnectorColor === "string";
    if (!isOwner && !recolorConnector) return edge;
    const data = { ...(edge.data ?? {}) } as VidyaEdgeData;

    if (recolorConnector && nextConnectorColor) data.color = nextConnectorColor;
    if (isOwner) {
      if ("label" in update) data.label = update.label;
      if ("labelColorSynced" in update) data.labelColorSynced = update.labelColorSynced;
      if (typeof nextLabelColor === "string") data.labelColor = nextLabelColor;
      if ("labelFontFamily" in update) {
        if (update.labelFontFamily) data.labelFontFamily = update.labelFontFamily;
        else delete data.labelFontFamily;
      }
      if ("labelFontSize" in update && typeof update.labelFontSize === "number") {
        data.labelFontSize = clampFontSize(update.labelFontSize);
      }
      if ("labelFontWeight" in update) data.labelFontWeight = update.labelFontWeight;
      if ("labelFontStyle" in update) data.labelFontStyle = update.labelFontStyle;
    }

    return {
      ...edge,
      markerStart: recolorConnector && nextConnectorColor
        ? markerWithColor(edge.markerStart, nextConnectorColor)
        : edge.markerStart,
      markerEnd: recolorConnector && nextConnectorColor
        ? markerWithColor(edge.markerEnd, nextConnectorColor)
        : edge.markerEnd,
      data,
    };
  });
}
