/**
 * A very small PDF writer, so demo documents are real files.
 *
 * The alternative was storing a path to a file that does not exist, which
 * looks fine in the database and breaks the moment anybody clicks Preview.
 * These are genuine single-page PDFs that open in any reader — a cover page
 * naming the document, the proposal or project it belongs to, and its contents
 * in plain text. They are not typeset reports and do not pretend to be; the
 * point is that every document row has a file behind it.
 *
 * Written by hand rather than with a library because the alternative is a
 * dependency in the server's production package.json that exists only to
 * generate demo fixtures.
 */

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const BODY_SIZE = 10.5;
const LEADING = 15;
/** Helvetica at 10.5pt fits roughly this many characters across the text column. */
const WRAP_AT = 92;

/** PDF strings are parenthesised, so the delimiters have to be escaped. */
const escape = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/**
 * WinAnsi has no character for most of what our content might contain, and a
 * raw multi-byte sequence renders as mojibake. Typographic punctuation is
 * folded to ASCII; anything else outside the encoding becomes a question mark
 * rather than silently corrupting the line.
 */
function toWinAnsi(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/₹/g, "Rs. ")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

function wrap(text, width) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && line.length + word.length + 1 > width) { lines.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * One page of text. Content beyond what fits is truncated with a marker rather
 * than paginated — these are fixtures, and a second page of Helvetica would not
 * make them more real.
 */
function contentStream({ title, subtitle, body }) {
  const maxLines = Math.floor((PAGE_HEIGHT - MARGIN * 2 - 60) / LEADING);
  const lines = wrap(toWinAnsi(body), WRAP_AT);
  const shown = lines.length > maxLines ? [...lines.slice(0, maxLines - 1), "[continued]"] : lines;

  const out = [
    "BT",
    `/F2 15 Tf 1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN} Tm`,
    `(${escape(toWinAnsi(title))}) Tj`,
    `/F1 9 Tf 1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN - 18} Tm`,
    `(${escape(toWinAnsi(subtitle))}) Tj`,
    `/F1 ${BODY_SIZE} Tf ${LEADING} TL 1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN - 52} Tm`,
  ];
  for (const line of shown) out.push(`(${escape(line)}) Tj T*`);
  out.push("ET");
  return out.join("\n");
}

/**
 * Returns a Buffer holding a complete single-page PDF.
 *
 * The cross-reference table needs the byte offset of every object, so the file
 * is assembled in order while the offsets are recorded. Getting these wrong
 * produces a file readers refuse to open, which is the whole reason to build
 * it in one place and use it everywhere.
 */
export function makePdf({ title, subtitle, body }) {
  const stream = contentStream({ title, subtitle, body });
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
      "/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${Buffer.byteLength(stream, "latin1")}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body_, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body_}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
