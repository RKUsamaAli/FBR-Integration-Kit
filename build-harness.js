#!/usr/bin/env node
/**
 * build-harness.js — assembles the standalone fbr-test-harness.html.
 *
 * Inputs (all in this folder):
 *   harness.template.html                        the page shell, testers, and script
 *   README.md                                    -> the Overview view
 *   fbr-digital-invoice-developer-guide.md       -> the DI Guide view
 *   fbr-pos-digital-invoice-developer-guide.md   -> the POS Guide view
 *   fbr-di-sandbox-scenarios.md                  -> the Scenarios view
 *   fbr-di-sandbox-scenarios.json                -> the 28 payloads the DI tester runs
 *   fbr-proxy.js                                 -> embedded verbatim so the single HTML
 *                                                   file can recreate the relay it needs
 *
 * Output: fbr-test-harness.html — one self-contained file. No network, no build step for
 *         the reader. Edit the markdown, re-run `node build-harness.js`.
 *
 * The markdown converter below is deliberately small: it handles exactly the subset the
 * guides use (headings, tables, fenced code, lists, task lists, blockquotes, rules, links,
 * bold/italic/inline code). It is not a general-purpose Markdown engine.
 */
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

/* ---------------------------------------------------------------- *
 * Markdown -> HTML
 * ---------------------------------------------------------------- */
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Sentinel that cannot occur in the source docs, used to park code-span contents.
const MARK = '\u0001'; // escaped in source, so this file stays plain text

/** Inline markup. Code spans are pulled out first so their contents are never re-parsed. */
function inline(src) {
  const spans = [];
  let s = escHtml(src).replace(/`([^`]+)`/g, (_, c) => MARK + (spans.push(c) - 1) + MARK);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,;:)]|$)/g, '$1<em>$2</em>');
  return s.replace(new RegExp(MARK + '(\\d+)' + MARK, 'g'), (_, i) => '<code>' + spans[i] + '</code>');
}

const cell = c => c.trim().replace(/\\\|/g, '|');

/** Splits a table row on unescaped pipes, dropping the leading/trailing empties. */
function splitRow(line) {
  const out = [];
  let buf = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') { buf += '\\|'; i++; continue; }
    if (ch === '|') { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  if (out.length && out[0].trim() === '') out.shift();
  if (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isTableSep = l => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
  const isFence = l => /^\s*```/.test(l);

  /**
   * Consumes a fenced block starting at `i` and returns its <pre>. The fence's own indentation is
   * stripped from every line, so a block nested under a list item (indented 3 spaces in the source)
   * renders flush rather than with phantom leading whitespace.
   */
  function takeFence() {
    const open = lines[i];
    const indent = (open.match(/^\s*/) || [''])[0].length;
    const lang = open.trim().slice(3).trim();
    const buf = [];
    i++;
    while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++].slice(indent));
    i++; // closing fence
    return '<pre class="code"' + (lang ? ' data-lang="' + escHtml(lang) + '"' : '') +
           '><code>' + escHtml(buf.join('\n')) + '</code></pre>';
  }

  while (i < lines.length) {
    const line = lines[i];

    // fenced code (may be indented, e.g. nested under a list item)
    if (isFence(line)) { out.push(takeFence()); continue; }

    // table
    if (line.trim().startsWith('|') && isTableSep(lines[i + 1] || '')) {
      const head = splitRow(line).map(c => '<th>' + inline(cell(c)) + '</th>').join('');
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push('<tr>' + splitRow(lines[i++]).map(c => '<td>' + inline(cell(c)) + '</td>').join('') + '</tr>');
      }
      out.push('<div class="tablewrap"><table><thead><tr>' + head + '</tr></thead><tbody>' +
               body.join('') + '</tbody></table></div>');
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }

    // horizontal rule
    if (/^---+\s*$/.test(line)) { out.push('<hr />'); i++; continue; }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>');
      continue;
    }

    // lists (unordered, task, ordered) — one level, which is all the guides use
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        // An item is a sequence of chunks — prose, then possibly a code block, then more prose —
        // kept in source order so a fence renders where the author put it, not at the end.
        const parts = [];
        let text = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        let lead = '';

        const task = text.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) {
          lead = '<input type="checkbox"' + (/x/i.test(task[1]) ? ' checked' : '') + ' /> ';
          text = task[2];
        }

        // continuation lines are indented and are not themselves a new bullet
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          if (isFence(lines[i])) {
            if (text.trim()) parts.push(inline(text));
            text = '';
            parts.push(takeFence());
            continue;
          }
          text += (text ? ' ' : '') + lines[i++].trim();
        }
        if (text.trim()) parts.push(inline(text));

        items.push('<li' + (task ? ' class="task"' : '') + '>' + lead + parts.join('') + '</li>');
      }
      out.push('<' + (ordered ? 'ol' : 'ul') + '>' + items.join('') + '</' + (ordered ? 'ol' : 'ul') + '>');
      continue;
    }

    // blank
    if (!line.trim()) { i++; continue; }

    // paragraph
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^(#{1,4}\s|```|>\s?|---+\s*$)/.test(lines[i]) &&
           !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
           !(lines[i].trim().startsWith('|') && isTableSep(lines[i + 1] || ''))) {
      buf.push(lines[i++]);
    }
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }
  return out.join('\n');
}

/* ---------------------------------------------------------------- *
 * Cross-file references become in-page navigation
 * ---------------------------------------------------------------- */
const VIEW_OF = {
  'README.md': 'overview',
  'fbr-digital-invoice-developer-guide.md': 'di-guide',
  'fbr-pos-digital-invoice-developer-guide.md': 'pos-guide',
  'fbr-di-sandbox-scenarios.md': 'scenarios',
  'fbr-test-harness.html': 'di-test',
};
function linkifyRefs(html) {
  for (const [file, view] of Object.entries(VIEW_OF)) {
    html = html.split('<code>' + file + '</code>').join(
      '<a class="xref" data-view="' + view + '" href="#' + view + '"><code>' + file + '</code></a>');
  }
  return html;
}

/* ---------------------------------------------------------------- *
 * Assemble
 * ---------------------------------------------------------------- */
const doc = f => linkifyRefs(mdToHtml(read(f)));

const html = read('harness.template.html')
  .replace('__SCENARIOS__', () => read('fbr-di-sandbox-scenarios.json').trim())
  .replace('__PROXY_SOURCE__', () => escHtml(read('fbr-proxy.js')))
  .replace('__DOC_OVERVIEW__', () => doc('README.md'))
  .replace('__DOC_DI__', () => doc('fbr-digital-invoice-developer-guide.md'))
  .replace('__DOC_POS__', () => doc('fbr-pos-digital-invoice-developer-guide.md'))
  .replace('__DOC_SCENARIOS__', () => doc('fbr-di-sandbox-scenarios.md'))
  .replace('__BUILT_ON__', () => new Date().toISOString().slice(0, 10));

const left = html.match(/__[A-Z_]+__/g);
if (left) { console.error('Unreplaced placeholders: ' + left.join(', ')); process.exit(1); }

fs.writeFileSync(path.join(dir, 'fbr-test-harness.html'), html);
console.log('fbr-test-harness.html written — ' + (html.length / 1024).toFixed(0) + ' KB, self-contained.');
