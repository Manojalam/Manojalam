/** React Flow elevates selected nodes to z-index 1000. */
export const REACT_FLOW_SELECTED_NODE_Z_INDEX = 1000;

/** Visible controls for a selected connector must win hit-testing over nodes. */
export const CONNECTOR_CONTROL_Z_INDEX = REACT_FLOW_SELECTED_NODE_Z_INDEX + 1001;
