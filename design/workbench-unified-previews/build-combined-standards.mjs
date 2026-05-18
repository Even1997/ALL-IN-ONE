import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCE_FILES = [
  {
    id: "foundation",
    eyebrow: "Section 01",
    title: "Foundation Standard",
    description:
      "The baseline workbench contract for shell anatomy, visual language, interaction rules, and reusable component logic.",
    source: "ui-standards.html",
  },
  {
    id: "boards",
    eyebrow: "Section 02",
    title: "Standard Boards",
    description:
      "Concrete page-level mockups that translate the foundation rules into AI, graph, overview, and workbench surfaces.",
    source: "overview-home.html",
  },
  {
    id: "states",
    eyebrow: "Section 03",
    title: "State Standard Sheet",
    description:
      "A dedicated single-page state reference for note surfaces, trees, canvases, and AI companions across light and dark themes.",
    source: "state-standards.html",
  },
];

const OUTPUT_FILE = "combined-standards.html";

const EXTRA_CSS = `
html {
  scroll-behavior: smooth;
}

body.combined-standards-body {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(0, 122, 255, 0.08), transparent 28%),
    linear-gradient(180deg, #eef1f5 0%, #e7eaee 100%);
}

.combined-standards-page {
  width: min(1600px, calc(100% - 32px));
  margin: 0 auto;
  padding: 24px 0 56px;
}

.combined-standards-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr);
  gap: 20px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(24px);
}

.combined-standards-copy h1 {
  margin: 8px 0 12px;
  font-size: clamp(34px, 4vw, 52px);
  line-height: 1.05;
}

.combined-standards-copy p {
  max-width: 720px;
  margin: 0;
  color: var(--wb-text-soft);
  font-size: 15px;
  line-height: 1.7;
}

.combined-standards-meta {
  display: grid;
  gap: 14px;
}

.combined-meta-card {
  padding: 18px 20px;
  border: 1px solid var(--wb-line);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.78);
}

.combined-meta-card strong,
.combined-meta-card span {
  display: block;
}

.combined-meta-card strong {
  margin: 6px 0 8px;
  font-size: 15px;
}

.combined-meta-card span:last-child {
  color: var(--wb-text-soft);
  line-height: 1.6;
}

.combined-standards-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 20px;
  margin-top: 20px;
  align-items: start;
}

.combined-standards-nav {
  position: sticky;
  top: 18px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(24px);
}

.combined-nav-list {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.combined-nav-link {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: rgba(245, 247, 250, 0.92);
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.combined-nav-link:hover,
.combined-nav-link:focus-visible {
  border-color: rgba(0, 122, 255, 0.18);
  background: rgba(255, 255, 255, 0.96);
  transform: translateY(-1px);
  outline: none;
}

.combined-nav-link strong {
  font-size: 14px;
}

.combined-nav-link span {
  color: var(--wb-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.combined-nav-note {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--wb-line);
  color: var(--wb-text-soft);
  font-size: 12px;
  line-height: 1.6;
}

.combined-standards-content {
  display: grid;
  gap: 20px;
}

.combined-standard-section {
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(24px);
}

.combined-section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 20px;
  margin-bottom: 18px;
}

.combined-section-head h2 {
  margin: 8px 0 0;
  font-size: clamp(24px, 2.4vw, 34px);
}

.combined-section-head p {
  margin: 0;
  max-width: 700px;
  color: var(--wb-text-soft);
  line-height: 1.65;
}

.combined-section-meta {
  color: var(--wb-text-faint);
  font-size: 12px;
  white-space: nowrap;
}

.combined-section-frame {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 22px;
  background: rgba(250, 251, 252, 0.86);
}

.combined-section-frame > div {
  min-width: 0;
}

.combined-section-frame .preview-shell,
.combined-section-frame .standards-shell,
.combined-section-frame .notes-hub-shell,
.combined-section-frame .state-standards-shell {
  min-height: auto;
}

.combined-section-frame .preview-window {
  min-height: auto;
}

@media (max-width: 1180px) {
  .combined-standards-layout {
    grid-template-columns: 1fr;
  }

  .combined-standards-nav {
    position: static;
  }
}

@media (max-width: 860px) {
  .combined-standards-page {
    width: min(100%, calc(100% - 20px));
    padding: 10px 0 36px;
  }

  .combined-standards-hero,
  .combined-standard-section {
    padding: 16px;
    border-radius: 20px;
  }

  .combined-standards-hero {
    grid-template-columns: 1fr;
  }

  .combined-section-head {
    flex-direction: column;
    align-items: start;
  }

  .combined-section-meta {
    white-space: normal;
  }
}
`;

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) {
    throw new Error("Could not locate <body> content in source HTML.");
  }

  return match[1]
    .trim()
    .replace(/<main\b/gi, "<div")
    .replace(/<\/main>/gi, "</div>")
    .replaceAll("./ui-standards.html", "#foundation")
    .replaceAll("./overview-home.html", "#boards")
    .replaceAll("./state-standards.html", "#states")
    .replaceAll("./index.html", "#top");
}

function renderNavItem(section) {
  return `            <a class="combined-nav-link" href="#${section.id}">
              <strong>${section.title}</strong>
              <span>${section.description}</span>
            </a>`;
}

function renderSection(section, body) {
  return `          <section class="combined-standard-section" id="${section.id}">
            <div class="combined-section-head">
              <div>
                <span class="eyebrow">${section.eyebrow}</span>
                <h2>${section.title}</h2>
                <p>${section.description}</p>
              </div>
              <div class="combined-section-meta">Source: ${section.source}</div>
            </div>
            <div class="combined-section-frame">
${indent(body, 14)}
            </div>
          </section>`;
}

function indent(text, spaces) {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length ? `${prefix}${line}` : line))
    .join("\n");
}

async function build() {
  const css = await readFile(path.join(__dirname, "workbench-preview.css"), "utf8");
  const sections = await Promise.all(
    SOURCE_FILES.map(async (section) => {
      const html = await readFile(path.join(__dirname, section.source), "utf8");
      return { ...section, body: extractBody(html) };
    }),
  );

  const output = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GoodNight Combined Workbench Standards</title>
    <style>
${css}

${EXTRA_CSS}
    </style>
  </head>
  <body class="combined-standards-body">
    <div class="combined-standards-page" id="top">
      <header class="combined-standards-hero">
        <div class="combined-standards-copy">
          <span class="eyebrow">Single File Standard Pack</span>
          <h1>GoodNight Combined Workbench Standards</h1>
          <p>
            A self-contained version of the core workbench standard set. This file keeps the
            existing desktop-native direction, bundles the shared CSS inline, and merges the
            foundation standard, board examples, and state sheet into one shareable document.
          </p>
        </div>
        <div class="combined-standards-meta">
          <div class="combined-meta-card">
            <span class="eyebrow">Included</span>
            <strong>Foundation, Boards, States</strong>
            <span>Three core standards gathered into one offline-friendly HTML file.</span>
          </div>
          <div class="combined-meta-card">
            <span class="eyebrow">Use</span>
            <strong>Review, handoff, and prompt input</strong>
            <span>Open directly in a browser, jump by anchor, or feed one file to future UI work.</span>
          </div>
        </div>
      </header>

      <div class="combined-standards-layout">
        <aside class="combined-standards-nav">
          <span class="eyebrow">Sections</span>
          <div class="combined-nav-list">
${sections.map(renderNavItem).join("\n")}
          </div>
          <div class="combined-nav-note">
            This file preserves the original pages as separate source files. The buttons inside each
            imported section now jump within this document so the pack stays easy to browse.
          </div>
        </aside>

        <main class="combined-standards-content">
${sections.map((section) => renderSection(section, section.body)).join("\n\n")}
        </main>
      </div>
    </div>
  </body>
</html>
`;

  await writeFile(path.join(__dirname, OUTPUT_FILE), output, "utf8");
  process.stdout.write(`Generated ${OUTPUT_FILE}\n`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
