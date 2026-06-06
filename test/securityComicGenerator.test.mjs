import assert from "node:assert/strict";
import test from "node:test";
import {
  comicCharacters,
  createSecurityComic,
  formatSecurityComicScript,
} from "../src/lib/securityComicGenerator.js";
import {
  buildComicPanelImagePrompt,
  generateSecurityComicImages,
  normalizeSecurityComicImageRequest,
} from "../src/lib/securityComicImageApi.js";

test("security comic generator creates a six-panel comic with the full cast", () => {
  const comic = createSecurityComic("스미싱 문자", 1);
  const castNames = new Set(comicCharacters.map((character) => character.name));
  const panelNames = new Set(comic.panels.flatMap((panel) => panel.characters));

  assert.equal(comic.panels.length, 6);
  assert.equal(comic.topic, "스미싱 문자");
  for (const name of castNames) {
    assert.ok(panelNames.has(name), `${name} should appear in the generated comic`);
  }
});

test("security comic script export includes panel dialogue and safety checklist", () => {
  const comic = createSecurityComic("비밀번호 재사용", 2);
  const script = formatSecurityComicScript(comic);

  assert.match(script, /비밀번호 재사용 6컷 보안 만화/);
  assert.match(script, /체크리스트/);
  assert.match(script, /오박사:/);
  assert.match(script, /포인트:/);
});

test("security comic image request requires all character reference images", () => {
  assert.throws(
    () => normalizeSecurityComicImageRequest({ characters: [], topic: "스미싱" }),
    /캐릭터 참고 이미지가 필요합니다/,
  );
});

test("security comic image generation calls OpenAI once per panel", async () => {
  const imageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const calls = [];
  const result = await generateSecurityComicImages(
    {
      characters: comicCharacters.map((character) => ({
        id: character.id,
        imageDataUrl,
      })),
      topic: "스미싱 문자",
    },
    {
      apiKey: "test-key",
      fetchImpl: async (url, options) => {
        calls.push({ options, url });
        return new Response(JSON.stringify({ data: [{ b64_json: "abc123" }] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
      imageModel: "test-image-model",
    },
  );

  assert.equal(calls.length, 6);
  assert.equal(result.images.length, 6);
  assert.equal(result.images[0].image, "data:image/png;base64,abc123");
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/edits");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
});

test("security comic image generation can use Gemini provider", async () => {
  const imageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const calls = [];
  const result = await generateSecurityComicImages(
    {
      characters: comicCharacters.map((character) => ({
        id: character.id,
        imageDataUrl,
      })),
      topic: "개인정보 입력",
    },
    {
      fetchImpl: async (url, options) => {
        calls.push({ options, url });
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        data: "gemini-image",
                        mimeType: "image/png",
                      },
                    },
                  ],
                },
              },
            ],
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      },
      geminiApiKey: "gemini-key",
      geminiImageModel: "gemini-test-image-model",
      provider: "gemini",
    },
  );

  assert.equal(calls.length, 6);
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-test-image-model");
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(calls[0].url, /gemini-test-image-model/);
  assert.equal(result.images[0].image, "data:image/png;base64,gemini-image");
});

test("security comic image prompt tells the model to keep character references", () => {
  const comic = createSecurityComic("악성 앱 설치", 0);
  const prompt = buildComicPanelImagePrompt({
    characterReferences: comicCharacters,
    panel: comic.panels[0],
    topic: comic.topic,
  });

  assert.match(prompt, /uploaded reference images/);
  assert.match(prompt, /Keep each character visually consistent/);
  assert.match(prompt, /악성 앱 설치/);
});
