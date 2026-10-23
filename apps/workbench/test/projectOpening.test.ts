import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyProject, type WorkbenchProject } from "@streamweave/core";
import { createProjectOpener } from "../src/projectOpening";

function pendingRead() {
  let resolve!: (project: WorkbenchProject) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<WorkbenchProject>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("a late file open cannot replace a newer workspace", async () => {
  let version = 0;
  const pending = pendingRead();
  const open = createProjectOpener(
    () => version,
    () => pending.promise,
  );
  const result = open(new File([], "old.json"));
  version++;
  pending.resolve(emptyProject());
  assert.equal(await result, null);
});

test("the latest open wins even when reads complete out of order", async () => {
  const first = pendingRead();
  const second = pendingRead();
  const open = createProjectOpener(
    () => 0,
    (file) => (file.name === "first.json" ? first.promise : second.promise),
  );
  const oldResult = open(new File([], "first.json"));
  const newResult = open(new File([], "second.json"));
  const project = emptyProject();
  second.resolve(project);
  assert.equal(await newResult, project);
  first.resolve(emptyProject());
  assert.equal(await oldResult, null);
});

test("only failures from the current document read are surfaced", async () => {
  let version = 0;
  const pending = pendingRead();
  const open = createProjectOpener(
    () => version,
    () => pending.promise,
  );
  const obsolete = open(new File([], "obsolete.json"));
  version++;
  pending.reject(new Error("Obsolete error"));
  assert.equal(await obsolete, null);
  const invalid = createProjectOpener(
    () => version,
    async () => {
      throw new Error("Invalid project");
    },
  );
  await assert.rejects(invalid(new File([], "invalid.json")), /Invalid project/);
});
