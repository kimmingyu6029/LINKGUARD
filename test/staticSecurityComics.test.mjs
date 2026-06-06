import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  comicLoadingFrames,
  pickRandomStaticComic,
  staticComicCategories,
} from "../src/lib/staticSecurityComics.js";

test("static security comics define six categories with three comics each", () => {
  assert.equal(staticComicCategories.length, 6);

  for (const category of staticComicCategories) {
    assert.equal(category.comics.length, 3, `${category.title} should have three comics`);

    for (const comic of category.comics) {
      assert.equal(existsSync(resolve("public", comic.src.replace(/^\//, ""))), true);
    }
  }
});

test("static comic loading frames exist in order", () => {
  assert.equal(comicLoadingFrames.length, 8);

  for (const [index, frame] of comicLoadingFrames.entries()) {
    assert.equal(frame.src, `/ai_image/ai_image_${index + 1}.png`);
    assert.equal(existsSync(resolve("public", frame.src.replace(/^\//, ""))), true);
  }
});

test("static comic random picker avoids repeating the previous comic when possible", () => {
  const category = staticComicCategories[0];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.notEqual(pickRandomStaticComic(category, category.comics[0].id).id, category.comics[0].id);
  }
});
