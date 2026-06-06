import { comicCharacters, createSecurityComic } from "./securityComicGenerator.js";

export const defaultImageModel = "gpt-image-2";
export const defaultGeminiImageModel = "gemini-3.1-flash-image-preview";
export const maxComicReferenceImages = 4;

const maxDataUrlLength = 12 * 1024 * 1024;

export async function requestSecurityComicImages({ topic, characters }) {
  const response = await fetch("/api/security-comic", {
    body: JSON.stringify({ characters, topic }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "이미지 만화를 생성하지 못했습니다.");
  }

  return payload;
}

export async function prepareCharacterImage(file) {
  if (!file) {
    return "";
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("캐릭터 참고 이미지는 이미지 파일만 사용할 수 있습니다.");
  }

  return resizeImageFile(file, 1024, 0.9);
}

export async function generateSecurityComicImages(
  payload,
  {
    apiKey,
    fetchImpl = fetch,
    geminiApiKey,
    geminiImageModel = defaultGeminiImageModel,
    imageModel = defaultImageModel,
    provider = "openai",
  } = {},
) {
  const selectedProvider = provider === "gemini" ? "gemini" : "openai";

  if (selectedProvider === "openai" && !apiKey) {
    const error = new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
    error.statusCode = 503;
    throw error;
  }

  if (selectedProvider === "gemini" && !geminiApiKey) {
    const error = new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
    error.statusCode = 503;
    throw error;
  }

  const request = normalizeSecurityComicImageRequest(payload);
  const comic = createSecurityComic(request.topic, Date.now());
  const references = request.characters.map((character) => ({
    ...character,
    ...dataUrlToBlobParts(character.imageDataUrl),
  }));
  const model = selectedProvider === "gemini" ? geminiImageModel : imageModel;

  const images = [];

  for (const panel of comic.panels) {
    const image =
      selectedProvider === "gemini"
        ? await createGeminiComicPanelImage({
            apiKey: geminiApiKey,
            characterReferences: references,
            fetchImpl,
            imageModel: geminiImageModel,
            panel,
            topic: comic.topic,
          })
        : await createOpenAIComicPanelImage({
            apiKey,
            characterReferences: references,
            fetchImpl,
            imageModel,
            panel,
            topic: comic.topic,
          });

    images.push({
      ...panel,
      image,
    });
  }

  return {
    checklist: comic.checklist,
    images,
    model,
    provider: selectedProvider,
    summary: comic.summary,
    title: comic.title,
    topic: comic.topic,
  };
}

export function normalizeSecurityComicImageRequest(payload) {
  const topic = String(payload?.topic ?? "").trim();
  const characters = Array.isArray(payload?.characters) ? payload.characters : [];
  const normalizedCharacters = comicCharacters.map((profile) => {
    const match = characters.find((character) => character?.id === profile.id);
    return {
      description: profile.description,
      id: profile.id,
      imageDataUrl: String(match?.imageDataUrl ?? ""),
      name: profile.name,
      role: profile.role,
    };
  });

  const missingCharacters = normalizedCharacters.filter(
    (character) => !isValidImageDataUrl(character.imageDataUrl),
  );

  if (missingCharacters.length > 0) {
    const error = new Error(
      `캐릭터 참고 이미지가 필요합니다: ${missingCharacters
        .map((character) => character.name)
        .join(", ")}`,
    );
    error.statusCode = 400;
    throw error;
  }

  for (const character of normalizedCharacters) {
    if (character.imageDataUrl.length > maxDataUrlLength) {
      const error = new Error(`${character.name} 이미지가 너무 큽니다. 더 작은 파일을 사용해주세요.`);
      error.statusCode = 413;
      throw error;
    }
  }

  return {
    characters: normalizedCharacters.slice(0, maxComicReferenceImages),
    topic: topic || "생활 보안",
  };
}

export function buildComicPanelImagePrompt({ characterReferences, panel, topic }) {
  const castGuide = characterReferences
    .map(
      (character, index) =>
        `${index + 1}. ${character.name}: ${character.role}. ${character.description}`,
    )
    .join("\n");
  const dialogueGuide = panel.dialogue
    .map((line) => `${line.speaker}: ${line.text}`)
    .join(" / ");

  return [
    `Create panel ${panel.number} of a 6-panel Korean cybersecurity education comic about "${topic}".`,
    "Use the uploaded reference images as the exact character visual guides, in this order:",
    castGuide,
    "Keep each character visually consistent with their reference image. Do not redesign their core appearance, colors, clothes, face shape, or accessories.",
    "Make one square comic panel image, not a collage and not a page of multiple panels.",
    "Style: polished Korean educational webtoon, bright 3D-cartoon look, clean lighting, friendly classroom/security-lab mood.",
    `Panel title: ${panel.title}`,
    `Scene: ${panel.scene}`,
    `Characters visible: ${panel.characters.join(", ")}`,
    `Short dialogue intent: ${dialogueGuide}`,
    `Security learning point: ${panel.tip}`,
    "If speech bubbles appear, keep Korean text extremely short and legible. Prefer icons and expressions over long text.",
    "No gore, no violence, no scary realism. Make it playful, clear, and suitable for students.",
  ].join("\n");
}

async function createOpenAIComicPanelImage({
  apiKey,
  characterReferences,
  fetchImpl,
  imageModel,
  panel,
  topic,
}) {
  const form = new FormData();
  form.append("model", imageModel);
  form.append(
    "prompt",
    buildComicPanelImagePrompt({ characterReferences, panel, topic }),
  );
  form.append("size", "1024x1024");
  form.append("quality", "medium");

  for (const reference of characterReferences) {
    form.append(
      "image[]",
      new Blob([reference.bytes], { type: reference.mimeType }),
      `${reference.id}.${reference.extension}`,
    );
  }

  const response = await fetchImpl("https://api.openai.com/v1/images/edits", {
    body: form,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    method: "POST",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      getOpenAIImageErrorMessage(
        data?.error?.message || `OpenAI 이미지 생성 요청이 실패했습니다. (${response.status})`,
      ),
    );
    error.statusCode = response.status;
    throw error;
  }

  const b64 = data?.data?.[0]?.b64_json;

  if (!b64) {
    const error = new Error("OpenAI 응답에 이미지 데이터가 없습니다.");
    error.statusCode = 502;
    throw error;
  }

  return `data:image/png;base64,${b64}`;
}

async function createGeminiComicPanelImage({
  apiKey,
  characterReferences,
  fetchImpl,
  imageModel,
  panel,
  topic,
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    imageModel,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = buildComicPanelImagePrompt({ characterReferences, panel, topic });
  const response = await fetchImpl(endpoint, {
    body: JSON.stringify({
      contents: [
        {
          parts: [
            ...characterReferences.map((reference) => ({
              inlineData: {
                data: reference.base64,
                mimeType: reference.mimeType,
              },
            })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || `Gemini 이미지 생성 요청이 실패했습니다. (${response.status})`;
    const error = new Error(getGeminiImageErrorMessage(message));
    error.statusCode = response.status;
    throw error;
  }

  const imagePart = data?.candidates?.[0]?.content?.parts?.find((part) =>
    part?.inlineData?.data && String(part.inlineData.mimeType || "").startsWith("image/"),
  );

  if (!imagePart?.inlineData?.data) {
    const textPart = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join(" ");
    const error = new Error(textPart || "Gemini 응답에 이미지 데이터가 없습니다.");
    error.statusCode = 502;
    throw error;
  }

  return `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`;
}

function getOpenAIImageErrorMessage(message) {
  if (/billing hard limit/i.test(message)) {
    return "OpenAI 계정의 결제 한도에 도달해서 이미지 생성이 중단되었습니다. OpenAI 결제/사용 한도를 확인해주세요.";
  }

  if (/insufficient_quota|quota/i.test(message)) {
    return "OpenAI 이미지 생성 할당량이 부족합니다. OpenAI 계정의 크레딧 또는 사용 한도를 확인해주세요.";
  }

  if (/invalid.*api.*key|incorrect api key|unauthorized/i.test(message)) {
    return "OpenAI API 키가 올바르지 않습니다. .env.local의 OPENAI_API_KEY 값을 확인해주세요.";
  }

  return message;
}

function getGeminiImageErrorMessage(message) {
  if (/api key not valid|invalid api key/i.test(message)) {
    return "Gemini API 키가 올바르지 않습니다. .env.local의 GEMINI_API_KEY 값을 확인해주세요.";
  }

  if (/quota|billing|exceeded/i.test(message)) {
    return "Gemini 이미지 생성 할당량 또는 결제 한도에 걸렸습니다. Google AI Studio의 API 사용량/결제 한도를 확인해주세요. 현재 이미지 모델은 무료 티어 한도가 0일 수 있습니다.";
  }

  if (/not found|not supported/i.test(message)) {
    return "현재 설정된 Gemini 이미지 모델을 사용할 수 없습니다. GEMINI_IMAGE_MODEL 값을 확인해주세요.";
  }

  return message;
}

function isValidImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(String(value || ""));
}

function dataUrlToBlobParts(dataUrl) {
  const match = String(dataUrl).match(/^data:(image\/(png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i);

  if (!match) {
    const error = new Error("이미지 데이터 형식이 올바르지 않습니다.");
    error.statusCode = 400;
    throw error;
  }

  const [, mimeType, extensionType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    base64,
    bytes,
    extension: extensionType === "jpeg" ? "jpg" : extensionType,
    mimeType,
  };
}

function resizeImageFile(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", quality));
      };

      image.onerror = () => reject(new Error("캐릭터 이미지를 읽지 못했습니다."));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("캐릭터 이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}
