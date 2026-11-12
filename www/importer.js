"use strict";
// Safe, in-browser import of HTML question-bank exports. Scripts in imported files never run:
// the embedded TESTS_LIST JSON is streamed, parsed test-by-test, and rich text is allowlist-sanitized.

const KNOWN_SOURCES = {
  "old_corebtr-1": ["Core BTR", "Core BTR · Older tests", "test"],
  "image_only_marrow_qb": ["Marrow", "Marrow · Image bank", "image"],
  "corebtr_questions_banks": ["Core BTR", "Core BTR · Qbank", "qbank"],
  "cerebellum_qbank": ["Cerebellum", "Cerebellum · Qbank", "qbank"],
  "marrow_qb": ["Marrow", "Marrow · Qbank", "qbank"],
  "marrow_previous_year_question_papers": ["Marrow", "Marrow · Previous-year papers", "pyq"],
  "core_btr_tests": ["Core BTR", "Core BTR · Tests", "test"],
};

function fileKey(name) {
  // Downloads often get suffixes such as "marrow_qb (1).html" or "marrow_qb-2.html".
  const base = name.toLowerCase().replace(/\.html?$/, "").trim();
  const noCopy = base.replace(/\s*\(\d+\)$/, "");
  return [base, noCopy, noCopy.replace(/[-_ ]\d+$/, "")].find(k => KNOWN_SOURCES[k]) || noCopy;
}

function describeFile(name) {
  const key = fileKey(name);
  const exact = KNOWN_SOURCES[key];
  if (exact) return { platform: exact[0], name: exact[1], kind: exact[2], key };
  const platform = /cerebell/.test(key) ? "Cerebellum" : /btr/.test(key) ? "Core BTR" : /marrow/.test(key) ? "Marrow" : "Other";
  const kind = /previous|pyq/.test(key) ? "pyq" : /image/.test(key) ? "image" : /test/.test(key) ? "test" : "qbank";
  const label = name.replace(/\.html?$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Imported bank";
  return { platform, name: `${platform} · ${label}`, kind, key };
}

// 128-bit non-cryptographic hash (cyrb128 variant); used for stable IDs and change detection.
function hash128(text) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

const clean = value => String(value ?? "").replace(/[\u200b-\u200f\ufeff]/g, "").trim();
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));

const inertDoc = document.implementation.createHTMLDocument("");
const inertBox = inertDoc.createElement("div");
const inertText = inertDoc.createElement("textarea");
function decodeEntities(value) {
  if (!value.includes("&")) return value;
  inertText.innerHTML = value; // RCDATA: decodes entities, never creates elements
  return inertText.value;
}
function safeUrl(value, image = false) {
  value = decodeEntities(clean(value));
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.host) return value;
  } catch { /* not an absolute URL */ }
  if (image && /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return value;
  return "";
}

const ALLOWED = new Set(["p", "br", "b", "strong", "i", "em", "u", "s", "sub", "sup", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "h1", "h2", "h3", "h4", "blockquote", "div", "span", "hr", "a", "img"]);
const BLOCKED = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "frame", "frameset", "link", "meta", "base", "form", "textarea", "select", "title"]);
const VOID = new Set(["br", "hr", "img"]);
const NEWLINE = new Set(["p", "br", "div", "li", "tr"]);
const richCache = new Map();

function rich(value) {
  const input = clean(value).replace(/\\n/g, "\n");
  if (!input) return ["", ""];
  if (input.length < 120 && richCache.has(input)) return richCache.get(input);
  const out = [], text = [];
  if (!/[<&]/.test(input)) {
    text.push(input); out.push(formatText(input));
  } else {
    inertBox.innerHTML = input;
    walk(inertBox, out, text);
    inertBox.textContent = "";
  }
  const result = [out.join(""), clean(text.join(""))];
  if (input.length < 120) { if (richCache.size > 20000) richCache.clear(); richCache.set(input, result); }
  return result;
}
function formatText(data) {
  return escapeHtml(data).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}
function walk(node, out, text) {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) { text.push(child.data); out.push(formatText(child.data)); continue; }
    if (child.nodeType !== 1) continue;
    const tag = child.localName;
    if (BLOCKED.has(tag)) continue;
    if (!ALLOWED.has(tag)) { walk(child, out, text); continue; }
    let extra = "";
    if (tag === "a") {
      const url = safeUrl(child.getAttribute("href"));
      if (url) extra = ` href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"`;
    } else if (tag === "img") {
      const url = safeUrl(child.getAttribute("src"), true);
      if (!url) continue;
      extra = ` src="${escapeHtml(url)}" alt="${escapeHtml(clean(child.getAttribute("alt")) || "Question image")}" loading="lazy" referrerpolicy="no-referrer"`;
    }
    out.push(`<${tag}${extra}>`);
    if (NEWLINE.has(tag)) text.push("\n");
    if (!VOID.has(tag)) { walk(child, out, text); out.push(`</${tag}>`); }
  }
}

const SUBJECTS = {
  "anesthesia": "Anaesthesia", "anaesthesia": "Anaesthesia", "orthopedics": "Orthopaedics", "orthopaedics": "Orthopaedics",
  "pediatrics": "Paediatrics", "paediatrics": "Paediatrics", "obstetrics gynecology": "Obstetrics & Gynaecology",
  "obstetrics gynaecology": "Obstetrics & Gynaecology", "obstetrics and gynecology": "Obstetrics & Gynaecology",
  "obstetrics and gynaecology": "Obstetrics & Gynaecology", "preventive social medicine": "Community Medicine",
  "preventive and social medicine": "Community Medicine", "community medicine": "Community Medicine",
  "forensic medicine toxicology": "Forensic Medicine", "general pathology": "Pathology",
  "general pharmacology": "Pharmacology", "general physiology": "Physiology",
};
const SYSTEMS = new Set(["endocrine", "gi hepatobiliary system", "hematology", "immunology", "neurology", "renal electrolytes", "respiratory system", "rheumatology"]);
function subjectName(path) {
  const label = clean(path).replace(/^\d+[\s_]+/, "").replace(/_/g, " ");
  const key = label.toLowerCase().replace(/&/g, " ").replace(/ and /g, " ").replace(/\s+/g, " ").trim();
  if (["online tests", "offline tests", "grand test", "mini test", "subject test", ""].includes(key)) return "Mixed subjects";
  if (SYSTEMS.has(key)) return "Integrated systems";
  return SUBJECTS[key] || label;
}

const imgSources = html => [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]);
function normalizeQuestion(raw, platform) {
  if (!raw || typeof raw !== "object") throw new Error("A question is not an object.");
  const [stemHtml, stem] = rich(raw.raw_text || raw.text);
  const rawOptions = raw.options;
  if (!Array.isArray(rawOptions) || rawOptions.length < 2) throw new Error(`Question ${raw.id} has fewer than two options.`);
  const correct = rawOptions.map((o, i) => o?.correct === true ? i : -1).filter(i => i >= 0);
  if (correct.length !== 1) throw new Error(`Question ${raw.id} does not have exactly one correct option.`);
  const options = rawOptions.map(o => { const [html, text] = rich(o?.text); return { text, html }; });
  const urls = list => [...new Set((Array.isArray(list) ? list : []).map(v => safeUrl(v, true)).filter(Boolean))];
  const images = urls(raw.question_images), explanationImages = urls(raw.explanation_images);
  if (!stem && !images.length && !stemHtml.includes("<img")) throw new Error(`Question ${raw.id} has no question content.`);
  const fingerprint = [platform, stem.replace(/\s+/g, " "), options.map(o => o.text.replace(/\s+/g, " ")), correct[0], images,
    imgSources(stemHtml), options.map(o => imgSources(o.html))];
  const [explanation] = rich(raw.explanation);
  return {
    id: hash128(JSON.stringify(fingerprint)), platform, original_id: clean(raw.id), stem, stem_html: stemHtml, options,
    correct_index: correct[0], explanation, images, explanation_images: explanationImages, video: safeUrl(raw.video),
    image_based: images.length || stemHtml.includes("<img") || options.some(o => o.html.includes("<img")) ? 1 : 0,
  };
}

// Streams `const TESTS_LIST = [ {...}, {...} ]` element by element, so 90+ MB files fit on phones and tablets.
async function* streamTests(file, onBytes) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  const marker = /(?:const|let|var)\s+TESTS_LIST\s*=\s*\[/;
  let buf = "", seeking = true, i = 0, depth = 0, inString = false, escaped = false, start = -1, done = false, read = 0;
  while (!done) {
    const { value, done: end } = await reader.read();
    if (end) break;
    read += value.length; onBytes?.(read);
    buf += value;
    if (seeking) {
      const match = marker.exec(buf);
      if (!match) { buf = buf.slice(-200); continue; }
      buf = buf.slice(match.index + match[0].length); seeking = false; i = 0;
    }
    for (; i < buf.length; i++) {
      const c = buf[i];
      if (start < 0) {
        if (c === "]") { done = true; break; }
        if (c === "{" || c === "[") { start = i; depth = 1; }
        continue;
      }
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") {
        if (--depth === 0) {
          yield JSON.parse(buf.slice(start, i + 1));
          buf = buf.slice(i + 1); i = -1; start = -1;
        }
      }
    }
  }
  reader.cancel().catch(() => {});
  if (seeking) throw new Error("No embedded TESTS_LIST question array was found in this file.");
  if (!done) throw new Error("The question array in this file is incomplete.");
}

async function fileDigest(file) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
    const bytes = new Uint8Array(await file.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer());
    for (const byte of bytes) {
      h1 = h2 ^ Math.imul(h1 ^ byte, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ byte, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ byte, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ byte, 2716044179);
    }
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1, h2, h3, h4, file.size].map(h => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

window.OrbitImporter = { describeFile, fileKey, streamTests, normalizeQuestion, subjectName, clean, hash128, fileDigest };
