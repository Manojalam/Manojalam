import assert from "node:assert/strict";
import test from "node:test";
import type { Edge } from "@xyflow/react";
import {
  clearChangedConnectorEndpointAnchors,
  clearConnectorEndpointAnchor,
  connectorAnchorHandleId,
  connectorEndpointAnchor,
  rebindConnectorAnchorHandles,
  setConnectorEndpointAnchor,
} from "./connector-anchors";

test("a manual perimeter point receives a stable edge-specific handle", () => {
  const edge: Edge = { id: "edge-1", source: "a", target: "b" };
  const anchored = setConnectorEndpointAnchor(edge, "target", {
    x: 73,
    y: 100,
    side: "bottom",
  });

  assert.equal(anchored.targetHandle, connectorAnchorHandleId("edge-1", "target"));
  assert.deepEqual(connectorEndpointAnchor(anchored, "target"), {
    x: 73,
    y: 100,
    side: "bottom",
  });
  assert.equal(anchored.data?.preserveHandles, true);
  assert.equal(anchored.data?.manualRoute, true);
});

test("copied edges rebind normalized anchors to their new id", () => {
  const copied: Edge = {
    id: "new-edge",
    source: "a-copy",
    target: "b-copy",
    sourceHandle: "connector-anchor:old-edge:source",
    targetHandle: "connector-anchor:old-edge:target",
    data: {
      sourceAnchor: { x: 100, y: 35, side: "right" },
      targetAnchor: { x: 0, y: 65, side: "left" },
    },
  };
  const rebound = rebindConnectorAnchorHandles(copied);

  assert.equal(rebound.sourceHandle, connectorAnchorHandleId("new-edge", "source"));
  assert.equal(rebound.targetHandle, connectorAnchorHandleId("new-edge", "target"));
});

test("reconnecting one endpoint clears only that endpoint's saved anchor", () => {
  const edge: Edge = {
    id: "edge",
    source: "a",
    target: "b",
    data: {
      sourceAnchor: { x: 100, y: 30, side: "right" },
      targetAnchor: { x: 0, y: 70, side: "left" },
    },
  };
  const cleared = clearConnectorEndpointAnchor(edge, "target");

  assert.ok(connectorEndpointAnchor(cleared, "source"));
  assert.equal(connectorEndpointAnchor(cleared, "target"), undefined);
});

test("reparenting clears the old parent anchor but preserves the child's anchor", () => {
  const previous: Edge = {
    id: "edge",
    source: "old-parent",
    target: "child",
    data: {
      sourceAnchor: { x: 100, y: 30, side: "right" },
      targetAnchor: { x: 0, y: 70, side: "left" },
    },
  };
  const reparented = clearChangedConnectorEndpointAnchors(previous, {
    ...previous,
    source: "new-parent",
  });

  assert.equal(connectorEndpointAnchor(reparented, "source"), undefined);
  assert.deepEqual(connectorEndpointAnchor(reparented, "target"), {
    x: 0,
    y: 70,
    side: "left",
  });
});
