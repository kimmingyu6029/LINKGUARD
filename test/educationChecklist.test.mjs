import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const educationPageSource = readFileSync(
  resolve(rootDir, "src/pages/EducationPage.jsx"),
  "utf8",
);

test("education checklist uses real controlled checkbox inputs", () => {
  assert.match(educationPageSource, /type="checkbox"/);
  assert.match(educationPageSource, /checked=\{isChecked\}/);
  assert.match(
    educationPageSource,
    /onChange=\{\(\) => handleToggleChecklistItem\(item\)\}/,
  );
  assert.doesNotMatch(
    educationPageSource,
    /<li key=\{item\}>\s*<span className="empty-check" \/>/s,
  );
});
