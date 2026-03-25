#!/usr/bin/env node

const https = require('https');
const zlib = require('zlib');

const UA = 'wordroot/1.0';

function usage() {
  console.log(`wordroot - historical word meaning lookup

Usage:
  wordroot <word>
  wordroot define <word>
  wordroot compare <word>
  wordroot etym <word>
  wordroot 1828 <word>
`);
}

function normalizeWord(raw) {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function decodeHtml(str) {
  if (!str) return '';
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—',
    hellip: '…', copy: '©'
  };
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => named[n] ?? m)
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n');
}

function cleanText(s) {
  return decodeHtml(s)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li|blockquote|ol|ul)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();

        const finish = (buf) => {
          const body = buf.toString('utf8');
          resolve({ status: res.statusCode || 0, body, headers: res.headers });
        };

        try {
          if (enc.includes('br')) return finish(zlib.brotliDecompressSync(raw));
          if (enc.includes('gzip')) return finish(zlib.gunzipSync(raw));
          if (enc.includes('deflate')) return finish(zlib.inflateSync(raw));
          return finish(raw);
        } catch {
          // Fallback: if decompression fails, try raw bytes as UTF-8
          return finish(raw);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timed out')));
  });
}

async function fetchWebster1828(word) {
  const url = `https://webstersdictionary1828.com/Dictionary/${encodeURIComponent(word)}`;
  const { status, body } = await fetch(url);
  if (status === 404 || /Page Not Found|\b404 Not Found\b/i.test(body)) return null;
  const m = body.match(/<h3[^>]*class=["']dictionaryhead["'][^>]*>[\s\S]*?<\/h3>[\s\S]*?<div>([\s\S]*?)<\/div>/i);
  if (!m) return null;
  const txt = cleanText(m[1]);
  return txt || null;
}

function extractTokenText(html, tokenId) {
  const re = new RegExp(`${tokenId}:T[0-9a-f]+,([\\s\\S]*?)(?=[0-9a-z]+:T[0-9a-f]+,)`, 'i');
  const m = html.match(re);
  return m ? cleanText(m[1]) : null;
}

async function fetchEtym(word) {
  const url = `https://www.etymonline.com/word/${encodeURIComponent(word)}`;
  const { status, body } = await fetch(url);
  if (status === 404) return null;

  const plainRef = body.match(/etymology_plain\\\\?":\\\\?"\$([0-9a-z]+)/i);
  if (plainRef) {
    const txt = extractTokenText(body, plainRef[1]);
    if (txt) return txt;
  }

  const htmlRef = body.match(/etymology\\\\?":\\\\?"\$([0-9a-z]+)/i);
  if (htmlRef) {
    const txt = extractTokenText(body, htmlRef[1]);
    if (txt) return txt;
  }

  return null;
}

async function fetchModernDefinition(word) {
  const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  const { status, body } = await fetch(url);
  if (status === 404 || /There is currently no text in this page/i.test(body)) return null;

  const englishStart = body.search(/<h2[^>]*id="English"|<h2[^>]*>\s*English\s*<\/h2>/i);
  if (englishStart < 0) return null;
  const englishSlice = body.slice(englishStart);

  const nounStart = englishSlice.search(/<h3[^>]*id="Noun"|<h3[^>]*>\s*Noun\s*<\/h3>/i);
  if (nounStart < 0) return null;
  const nounSlice = englishSlice.slice(nounStart);

  const ol = nounSlice.match(/<ol>([\s\S]*?)<\/ol>/i);
  if (!ol) return null;

  const lis = [...ol[1].matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((x) => cleanText(x[1]))
    .filter(Boolean)
    .slice(0, 8);

  if (!lis.length) return null;
  return lis.map((d, i) => `${i + 1}. ${d}`).join('\n');
}

function printSections(word, sections) {
  console.log(`WORD: ${word}`);
  for (const s of sections) {
    console.log(`\n=== ${s.title} ===`);
    console.log(s.text || s.fallback);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    usage();
    process.exit(1);
  }

  let cmd = 'define';
  let rawWord = '';

  if (args.length === 1) {
    if (['help', '--help', '-h'].includes(args[0])) {
      usage();
      return;
    }
    rawWord = args[0];
  } else {
    cmd = args[0].toLowerCase();
    rawWord = args.slice(1).join(' ');
  }

  const word = normalizeWord(rawWord);
  if (!word) {
    usage();
    process.exit(1);
  }

  try {
    if (cmd === 'define') {
      const [w1828, etym] = await Promise.all([fetchWebster1828(word), fetchEtym(word)]);
      printSections(word, [
        { title: "WEBSTER'S 1828", text: w1828, fallback: "Word not found in Webster's 1828" },
        { title: 'ETYMOLOGY', text: etym, fallback: 'No etymology found' }
      ]);
      return;
    }

    if (cmd === 'compare') {
      const [w1828, etym, modern] = await Promise.all([
        fetchWebster1828(word),
        fetchEtym(word),
        fetchModernDefinition(word)
      ]);
      printSections(word, [
        { title: "WEBSTER'S 1828", text: w1828, fallback: "Word not found in Webster's 1828" },
        { title: 'ETYMOLOGY', text: etym, fallback: 'No etymology found' },
        { title: 'MODERN DEFINITION', text: modern, fallback: 'No modern definition found' }
      ]);
      return;
    }

    if (cmd === 'etym') {
      const etym = await fetchEtym(word);
      printSections(word, [{ title: 'ETYMOLOGY', text: etym, fallback: 'No etymology found' }]);
      return;
    }

    if (cmd === '1828') {
      const w1828 = await fetchWebster1828(word);
      printSections(word, [{ title: "WEBSTER'S 1828", text: w1828, fallback: "Word not found in Webster's 1828" }]);
      return;
    }

    // default: treat first arg as word
    if (args.length === 1) {
      const [w1828, etym] = await Promise.all([fetchWebster1828(word), fetchEtym(word)]);
      printSections(word, [
        { title: "WEBSTER'S 1828", text: w1828, fallback: "Word not found in Webster's 1828" },
        { title: 'ETYMOLOGY', text: etym, fallback: 'No etymology found' }
      ]);
      return;
    }

    usage();
    process.exit(1);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
