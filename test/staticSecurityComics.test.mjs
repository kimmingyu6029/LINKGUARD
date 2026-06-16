import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("education page preloads and stacks comic loading frames", () => {
  const source = readFileSync(resolve("src/pages/EducationPage.jsx"), "utf8");

  assert.match(source, /className="comic-loading-preload"/);
  assert.match(source, /className="comic-loading-frame-stack"/);
  assert.match(source, /comicLoadingFrames\.map/);
  assert.doesNotMatch(source, /loadingFrameIndex|setInterval/);
});

test("static comic loading frames crossfade instead of snapping on and off", () => {
  const pageSource = readFileSync(resolve("src/pages/EducationPage.jsx"), "utf8");
  const styleSource = readFileSync(resolve("src/styles/global.css"), "utf8");

  assert.match(pageSource, /comicFrameFadeOverlapMs/);
  assert.doesNotMatch(styleSource, /steps\(1,\s*end\)/);
  assert.match(styleSource, /animation-timing-function:\s*ease-in-out/);
  assert.match(styleSource, /will-change:\s*opacity,\s*transform,\s*filter/);
  assert.match(styleSource, /4\.2%[\s\S]*opacity:\s*1/);
  assert.match(styleSource, /18%,[\s\S]*opacity:\s*0/);
});

test("static comic random picker avoids repeating the previous comic when possible", () => {
  const category = staticComicCategories[0];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.notEqual(pickRandomStaticComic(category, category.comics[0].id).id, category.comics[0].id);
  }
});
