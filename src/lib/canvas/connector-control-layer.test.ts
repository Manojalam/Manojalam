import assert from "node:assert/strict";
import test from "node:test";
import {
  CONNECTOR_CONTROL_Z_INDEX,
  REACT_FLOW_SELECTED_NODE_Z_INDEX,
} from "./connector-control-layer";

test("selected connector controls stay above React Flow's elevated nodes", () => {
  assert.ok(CONNECTOR_CONTROL_Z_INDEX > REACT_FLOW_SELECTED_NODE_Z_INDEX);
});
