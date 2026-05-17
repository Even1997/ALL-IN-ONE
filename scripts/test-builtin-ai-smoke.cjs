const { Module } = require("module");
const path = require("path");

const resolvePlaywright = () => {
  const {
    buildDefaultNodeModulesCandidates,
    pickPreferredNodeModulesRoot,
  } = require(path.resolve(__dirname, "lib", "builtinPlaywrightResolver.cjs"));
  const candidates = buildDefaultNodeModulesCandidates(__dirname);
  const preferredCandidate = pickPreferredNodeModulesRoot(candidates);
  const orderedCandidates = preferredCandidate
    ? [preferredCandidate, ...candidates.filter((candidate) => candidate !== preferredCandidate)]
    : candidates;

  let lastError = null;
  for (const candidate of orderedCandidates) {
    process.env.NODE_PATH = candidate;
    Module._initPaths();
    try {
      return require("playwright");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to resolve playwright.");
};

const { chromium } = resolvePlaywright();

const maskApiKey = (value) => {
  if (!value) return "(empty)";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const joinUrl = (baseUrl, path) =>
  baseUrl.endsWith(path) ? baseUrl : `${baseUrl.replace(/\/+$/, "")}${path}`;

const EXPECTED_ASSISTANT_TEXT = "OK.";
const extractAssistantText = (parsedResponse) =>
  parsedResponse?.content?.filter?.((item) => item?.type === "text").map((item) => item.text).join("\n").trim() ||
  parsedResponse?.choices?.[0]?.message?.content?.trim?.() ||
  null;

(async () => {
  const origin = process.env.GN_APP_ORIGIN;
  const userDataDir = process.env.GN_USER_DATA_DIR;

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "msedge",
    args: ["--no-first-run", "--no-default-browser-check"],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2000);

    const raw = await page.evaluate(() => localStorage.getItem("goodnight-ai-store"));
    if (!raw) {
      throw new Error("goodnight-ai-store was not found in app localStorage.");
    }

    const parsed = JSON.parse(raw);
    const state = parsed.state;
    const selected = state.aiConfigs.find((item) => item.id === state.selectedConfigId);
    if (!selected) {
      throw new Error(`Selected config ${state.selectedConfigId || "(null)"} was not found.`);
    }

    const prompt = `Reply with exactly ${EXPECTED_ASSISTANT_TEXT}`;
    let url;
    let headers;
    let buildBody;

    if (selected.provider === "anthropic") {
      url = joinUrl(selected.baseURL, "/messages");
      headers = {
        "Content-Type": "application/json",
        "x-api-key": selected.apiKey,
        "anthropic-version": "2023-06-01",
      };
      buildBody = (maxTokens) => ({
        model: selected.model,
        max_tokens: maxTokens,
        temperature: 0,
        system: prompt,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      });
    } else {
      url = joinUrl(selected.baseURL, "/chat/completions");
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${selected.apiKey}`,
      };
      buildBody = (maxTokens) => ({
        model: selected.model,
        max_tokens: maxTokens,
        temperature: 0,
        stream: false,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: prompt },
        ],
      });
    }

    let finalAttempt = null;
    for (const maxTokens of selected.provider === "anthropic" ? [128, 512] : [64, 256]) {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody(maxTokens)),
      });

      const responseText = await response.text();

      let parsedResponse = null;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        parsedResponse = null;
      }

      const assistantText = extractAssistantText(parsedResponse);
      const stopReason =
        parsedResponse?.stop_reason || parsedResponse?.choices?.[0]?.finish_reason || null;

      finalAttempt = {
        maxTokens,
        response,
        responseText,
        parsedResponse,
        assistantText,
        stopReason,
      };

      if (!response.ok) {
        break;
      }

      if (assistantText === EXPECTED_ASSISTANT_TEXT && stopReason !== "max_tokens") {
        break;
      }
    }

    const { maxTokens, response, responseText, parsedResponse, assistantText, stopReason } = finalAttempt || {};
    if (!finalAttempt) {
      throw new Error("Smoke test did not execute any inference attempts.");
    }

    if (!response.ok) {
      throw new Error(`Smoke inference request failed with HTTP ${response.status}: ${responseText}`);
    }

    if (stopReason === "max_tokens") {
      throw new Error(
        `Smoke inference response was truncated at max_tokens=${maxTokens} before producing the expected text.`,
      );
    }

    if (assistantText !== EXPECTED_ASSISTANT_TEXT) {
      throw new Error(
        `Smoke inference response did not produce the expected assistant text. Expected "${EXPECTED_ASSISTANT_TEXT}" but received ${JSON.stringify(assistantText)}.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          selectedConfigId: selected.id,
          provider: selected.provider,
          baseURL: selected.baseURL,
          model: selected.model,
          apiKeyPreview: maskApiKey(selected.apiKey),
          appOrigin: origin,
          userDataDir,
          maxTokens,
          httpStatus: response.status,
          ok: response.ok,
          stopReason,
          assistantText,
          rawResponse: responseText,
          note:
            selected.provider === "anthropic"
              ? "The current built-in testConnection UI path is preset-only for anthropic configs, so this script performs a real inference request."
              : "This script performs a real inference request against the selected openai-compatible config.",
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
