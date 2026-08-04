export interface ConnectorHandleInteractionInput {
  connectorToolActive: boolean;
  connectionInProgress: boolean;
  reconnectInProgress: boolean;
  selected: boolean;
}

/**
 * A moving connector gets one large drop target per node. The four fixed side
 * handles remain available only for deliberately starting a connection from a
 * selected node, so they cannot compete with perimeter snapping.
 */
export function connectorHandleInteractionState({
  connectorToolActive,
  connectionInProgress,
  reconnectInProgress,
  selected,
}: ConnectorHandleInteractionInput): {
  perimeterActive: boolean;
  fixedHandlesActive: boolean;
} {
  const perimeterActive = connectorToolActive || connectionInProgress || reconnectInProgress;
  return {
    perimeterActive,
    fixedHandlesActive: selected && !perimeterActive,
  };
}
