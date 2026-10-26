import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTheme } from "../src/features/appearance/themes";
import {
  readAppearancePreference,
  saveAppearancePreference,
} from "../src/platform/appearanceStorage";

function withStorage(
  storage: Pick<Storage, "getItem" | "setItem"> | (() => never),
  check: () => void,
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: typeof storage === "function" ? storage : () => storage,
  });
  try {
    check();
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("new and unrecognized appearance preferences use Classic", () => {
  for (const value of [null, undefined, "", "unknown", "classic", {}, 1]) {
    assert.equal(resolveTheme(value), "classic");
  }
  assert.equal(resolveTheme("studio"), "studio");
});

test("appearance persists independently of saved project data", () => {
  const values = new Map([["streamweave.project.v2", "saved workspace"]]);
  withStorage(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    },
    () => {
      assert.equal(resolveTheme(readAppearancePreference()), "classic");
      assert.equal(saveAppearancePreference("studio"), true);
      assert.equal(resolveTheme(readAppearancePreference()), "studio");
      assert.equal(values.get("streamweave.project.v2"), "saved workspace");
      assert.equal(saveAppearancePreference("classic"), true);
      assert.equal(resolveTheme(readAppearancePreference()), "classic");
    },
  );
});

test("blocked storage falls back safely and failed preference writes are reported", () => {
  withStorage(
    () => {
      throw new Error("Storage unavailable");
    },
    () => {
      assert.equal(resolveTheme(readAppearancePreference()), "classic");
      assert.equal(saveAppearancePreference("studio"), false);
    },
  );
  withStorage(
    {
      getItem: () => "studio",
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    },
    () => {
      assert.equal(resolveTheme(readAppearancePreference()), "studio");
      assert.equal(saveAppearancePreference("classic"), false);
    },
  );
});
