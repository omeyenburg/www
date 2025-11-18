/**
 * Build script:
 *
 * - Copies `public/` into the project root (`/`)
 * - Copies `assets/` into `/assets/`
 * - Generates all pages, preserving their directory structure
 *   - Uses the base template with the navbar
 *   - Inline all css files from `inline/` into the template
 *   - Inline css file foo-inlined.css (of a page foo.html) into the template
 *   - Copies css file foo.css (of a page foo.html) to the output
 */

import fs from "fs";
import path from "path";

import CleanCSS from "clean-css";
import { minify as htmlMinify } from "html-minifier-terser";
import { minify as terserMinify } from "terser";

const src = path.resolve("src");
const dist = path.resolve("dist");

await clean();
await addPublicRessources();
await buildPages();

async function clean() {
  if (fs.existsSync(dist)) {
    fs.readdirSync(dist).forEach(file => {
      const curPath = path.join(dist, file);
      fs.rmSync(curPath, { recursive: true, force: true });
    });
  }
  fs.mkdirSync(dist, { recursive: true });
}

async function addPublicRessources() {
  fs.cpSync(path.join(src, "public"), dist, { recursive: true });
}

async function buildPages() {
  const pagesDir = path.join(src, "pages");
  const htmlFiles = getHtmlFiles(pagesDir);

  const template = await generateTemplate();

  for (const relFilePath of htmlFiles) {
    let html = await buildPage(template, relFilePath);
    html = await minifyHTML(html);

    const outPath = path.join(dist, relFilePath);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, "utf-8");
  }
}

/**
 * Returns list of relative file paths of all html files within a directory.
 */
function getHtmlFiles(dir) {
  let files = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      getHtmlFiles(path.join(dir, entry.name)).forEach(name => files.push(path.join(entry.name, name)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(entry.name);
    }
  }

  return files
}

async function generateTemplate() {
  const nav = fs.readFileSync(path.join(src, "partials", "_nav.html"), "utf-8");
  const base = fs.readFileSync(path.join(src, "partials", "_base.html"), "utf-8");
  const footer = fs.readFileSync(path.join(src, "partials", "_footer.html"), "utf-8");

  // Read inline css from `inline/`
  let inlineCSS = "";
  const entries = fs.readdirSync(path.join(src, "inline"), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".css")) {
      const cssPath = path.join(src, "inline", entry.name);
      inlineCSS += fs.readFileSync(cssPath, "utf-8");
    }
  }

  const css = `<style>${await minifyCSS(inlineCSS)}</style>`;

  // Generate html template
  console.assert("{{nav}}");
  console.assert("{{footer}}");
  console.assert("{{inline-css}}");
  const html = base
    .replace("{{nav}}", nav)
    .replace("{{footer}}", footer)
    .replace("{{inline-css}}", css);

  return html;
}

async function buildPage(template, filePath) {
  const pagePrefix = path.join(path.dirname(filePath), path.basename(filePath, ".html"))

  const jsPath = path.join(src, "pages", pagePrefix + ".js");
  const cssPath = path.join(src, "pages", pagePrefix + ".css");
  const contentPath = path.join(src, "pages", pagePrefix + ".html");
  const cssInlinedPath = path.join(src, "pages", "css-inlined", pagePrefix + ".css");

  const content = fs.readFileSync(contentPath, "utf-8");

  let html = template;

  console.assert(html.includes("{{page-js}}"));
  if (fs.existsSync(jsPath)) {
    const js = await minifyJS(fs.readFileSync(jsPath, "utf-8"));
    fs.writeFileSync(path.join(dist, pagePrefix + ".js"), js);
    html = html.replace("{{page-js}}", `<script src="/${pagePrefix}.js" defer></script>`);
  } else {
    html = html.replace("{{page-js}}", "");
  }

  console.assert(html.includes("{{page-css}}"));
  if (fs.existsSync(cssPath)) {
    const css = await minifyCSS(fs.readFileSync(cssPath, "utf-8"));
    fs.writeFileSync(path.join(dist, pagePrefix + ".css"), css);
    html = html.replace("{{page-css}}", `<link rel="stylesheet" href="/${pagePrefix}.css">`);
  } else {
    html = html.replace("{{page-css}}", "");
  }

  console.assert(html.includes("{{inline-page-css}}"));
  if (fs.existsSync(cssInlinedPath)) {
    const css = await minifyCSS(fs.readFileSync(cssInlinedPath, "utf-8"));
    html = html.replace("{{inline-page-css}}", `<style>${css}</style>`);
  } else {
    html = html.replace("{{inline-page-css}}", "");
  }

  console.assert(html.includes("{{content}}"));
  html = html.replace("{{content}}", content);

  const topLevelPage = pagePrefix.split('/')[0];
  const labeledPlaceholders = [...html.matchAll(/\{\{(.*?):(.*?)\}\}/g)];
  labeledPlaceholders.forEach(placeholder => {
    if (placeholder[1] === "nav-button") {
      const query = `{{${placeholder[1]}:${placeholder[2]}}}`;
      console.assert(html.includes(query));
      if (placeholder[2] === topLevelPage) {
        html = html.replace(query, 'class="nav-item-active"');
      } else {
        html = html.replace(query, "");
      }
    }
  });

  return html;
}

async function minifyCSS(css) {
  return new CleanCSS({ level: 2 }).minify(css).styles;
}

async function minifyJS(js) {
  return (await terserMinify(js)).code;
}

async function minifyHTML(html) {
  return await htmlMinify(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeEmptyAttributes: true,
    minifyJS: true,
    minifyCSS: true,
    sortAttributes: true,
    sortClassName: true
  });
}

console.log("Build complete!");
