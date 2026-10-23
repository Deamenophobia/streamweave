import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyProject, executeWorkbench, multiSourceExample } from "@streamweave/core";
import { compatibleKinds, deleteElements, insertModule, sourceDraft } from "../src/editorModel";
import { appendDatasets, readDatasets } from "../src/projectFiles";
import { initialHistory, projectHistory } from "../src/projectHistory";

test("inserting at a chosen point connects a compatible module in one reversible edit", () => {
  const project = multiSourceExample();
  const original = JSON.stringify(project);
  const graph = insertModule(project, { type: "smooth" }, { x: -75, y: 380 }, "smooth", "wire", {
    source: "source_a",
    sourcePort: "series",
  });
  assert.deepEqual(graph.nodes.at(-1)?.position, { x: -75, y: 380 });
  assert.deepEqual(graph.edges.at(-1), {
    id: "wire",
    source: "source_a",
    sourcePort: "series",
    target: "smooth",
    targetPort: "series",
  });
  assert.equal(executeWorkbench(graph, project.datasets).nodes.smooth?.state, "ready");
  assert.equal(JSON.stringify(project), original);
  const edited = projectHistory(initialHistory(project), {
    type: "edit",
    update: { ...project, graph },
    record: true,
  });
  assert.equal(edited.past.length, 1);
  assert.equal(projectHistory(edited, { type: "undo" }).present, project);
});

test("wire search offers only compatible inputs and invalid insertion leaves the project intact", () => {
  const project = multiSourceExample();
  const origin = { source: "source_a", sourcePort: "series" };
  const kinds = compatibleKinds(project.graph, origin);
  assert.ok(kinds.includes("smooth"));
  assert.ok(kinds.includes("align"));
  assert.ok(kinds.includes("chart"));
  assert.ok(!kinds.includes("source"));
  assert.ok(!kinds.includes("regression"));
  assert.throws(
    () => insertModule(project, { type: "regression" }, { x: 0, y: 0 }, "new", "wire", origin),
    /cannot accept/,
  );
  assert.equal(project.graph.nodes.length, 9);
  assert.equal(project.graph.edges.length, 8);
});

test("deleting a selection removes incident wires and one undo restores the whole graph", () => {
  const project = multiSourceExample();
  const graph = deleteElements(project.graph, [{ id: "alignment" }], []);
  assert.equal(graph.nodes.length, 8);
  assert.equal(graph.edges.length, 3);
  assert.ok(
    graph.edges.every((edge) => edge.source !== "alignment" && edge.target !== "alignment"),
  );
  assert.equal(deleteElements(graph, [{ id: "alignment" }], []), graph);
  const edited = projectHistory(initialHistory(project), {
    type: "edit",
    update: { ...project, graph },
    record: true,
  });
  assert.equal(projectHistory(edited, { type: "undo" }).present, project);
  const wireOnly = deleteElements(project.graph, [], [project.graph.edges[0]!]);
  assert.equal(wireOnly.nodes, project.graph.nodes);
  assert.equal(wireOnly.edges.length, 7);
});

test("dragging records one checkpoint; undo/redo skips intermediate pointer positions", () => {
  const project = multiSourceExample();
  let history = projectHistory(initialHistory(project), { type: "checkpoint" });
  for (const x of [50, 80, 150]) {
    history = projectHistory(history, {
      type: "edit",
      record: false,
      update: (previous) => ({
        ...previous,
        graph: {
          ...previous.graph,
          nodes: previous.graph.nodes.map((node) =>
            node.id === "source_a" ? { ...node, position: { x, y: 70 } } : node,
          ),
        },
      }),
    });
  }
  assert.equal(history.past.length, 1);
  const undone = projectHistory(history, { type: "undo" });
  assert.equal(undone.present, project);
  assert.deepEqual(projectHistory(undone, { type: "redo" }).present.graph.nodes[0]?.position, {
    x: 150,
    y: 70,
  });
  const branched = projectHistory(undone, { type: "edit", update: emptyProject(), record: true });
  assert.equal(branched.future.length, 0);
});

test("history is bounded and no-op changes do not create undo entries", () => {
  let history = initialHistory(emptyProject());
  assert.equal(projectHistory(history, { type: "undo" }), history);
  assert.equal(
    projectHistory(history, { type: "edit", update: (previous) => previous, record: true }),
    history,
  );
  for (let index = 0; index < 75; index++)
    history = projectHistory(history, { type: "edit", update: emptyProject(), record: true });
  assert.equal(history.past.length, 50);
});

test("import creates data assets only; a source binds to its own dataset when explicitly placed", async () => {
  const initial = emptyProject();
  const file = new File(["timestampMs,temperature\n0,21\n1000,22\n"], "sensor.csv");
  const datasets = await readDatasets([file]);
  const project = appendDatasets(initial, datasets);
  assert.equal(project.graph, initial.graph);
  assert.equal(project.graph.nodes.length, 0);
  assert.equal(initial.datasets.length, 0);
  const graph = insertModule(
    project,
    sourceDraft(datasets[0]!),
    { x: 40, y: 90 },
    "sensor",
    "unused",
  );
  assert.equal(graph.nodes[0]?.params.datasetId, datasets[0]?.id);
  assert.equal(graph.nodes[0]?.params.column, "temperature");
  assert.equal(executeWorkbench(graph, datasets).nodes.sensor?.state, "ready");
  assert.throws(() => appendDatasets(project, Array(12).fill(datasets[0])), /12 datasets/);
  await assert.rejects(readDatasets([new File(["invalid"], "sensor.txt")]), /CSV, JSON, or JSONL/);
});
