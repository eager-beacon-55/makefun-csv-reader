// A fast single-pass reader for broken CSV, written from the csv-reader-speed-01 spec.
// run(input) returns, for input {text, header}, the value {columns, rows, errors} with the
// spec's exact semantics: BOM dropped, records end at LF or CRLF, blank lines are no record,
// stray CRs outside quotes are dropped and reported, quoted fields honour "" escapes and
// read CR/CRLF inside them as LF, junk after a closing quote is appended and reported, a
// quote that never closes is literal and its text is re-read unquoted, and rows are padded
// or cut to the first record's width with short_row / long_row errors.
//
// Speed comes from never walking the text a character at a time in the common cases:
// whole lines without quotes or stray CRs are split natively, plain fields are taken as
// one slice between native indexOf jumps, and only the rare broken spans fall back to
// segment-by-segment repair.

const END_COMMA = 0;
const END_BREAK = 1;
const END_TEXT = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // next character to read
  let line = 1; // line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and its index in rows (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field most recently scanned, handed back through these three.
  let fValue = '';
  let fEnded = END_TEXT;
  let fAdded = 0;

  // Scans unquoted text starting at pos on top of `base` (a prefix already read, not counted
  // in fAdded): stops at the next comma, LF, CRLF or the end of the text. A CR not followed
  // by LF is dropped and reported stray_cr. Sets fValue, fEnded, fAdded and advances pos/line.
  function scanUnquoted(base) {
    const iComma = text.indexOf(',', pos);
    const iLf = text.indexOf('\n', pos);
    let m;
    let ended;
    if (iComma !== -1 && (iLf === -1 || iComma < iLf)) {
      m = iComma;
      ended = END_COMMA;
    } else if (iLf !== -1) {
      m = iLf;
      ended = END_BREAK;
    } else {
      m = n;
      ended = END_TEXT;
    }
    const span = text.slice(pos, m);
    const firstCr = span.indexOf('\r');
    if (firstCr === -1) {
      fValue = base + span;
      fAdded = span.length;
    } else {
      // Repair the span: every CR is stray but a final one when the span ends at an LF
      // (that CR is the CRLF's). Stray CRs are dropped, one error each.
      let value = base;
      let start = 0;
      let k = firstCr;
      for (;;) {
        if (k === span.length - 1 && ended === END_BREAK) {
          value += span.slice(start, k);
          start = span.length;
          break;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += span.slice(start, k);
        start = k + 1;
        k = span.indexOf('\r', start);
        if (k === -1) break;
      }
      value += span.slice(start);
      fValue = value;
      fAdded = value.length - base.length;
    }
    if (ended === END_BREAK) line += 1;
    pos = ended === END_TEXT ? n : m + 1;
    fEnded = ended;
  }

  // Scans a quoted field whose opening quote is at pos. Sets fValue/fEnded (via scanUnquoted
  // for the junk and unterminated tails) and advances pos/line.
  function scanQuoted() {
    const open = pos;
    const openLine = line;
    let seg = open + 1; // start of the content not yet copied out
    let i = seg; // search cursor; [seg, i) is counted for lines but not yet copied
    let parts = null; // content pieces, once an escape or a CR forces a rebuild
    for (;;) {
      const iQ = text.indexOf('"', i);
      if (iQ === -1) {
        // The quote never closes: it is a literal character, and the text after it is
        // read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        scanUnquoted('"');
        return;
      }
      // The specials inside [i, iQ): an LF counts a line and stays; a CR becomes one LF.
      let crAt = -1;
      let lfAt = -1;
      if (iQ > i) {
        const span = text.slice(i, iQ);
        crAt = span.indexOf('\r');
        lfAt = span.indexOf('\n');
      }
      if (crAt !== -1 || lfAt !== -1) {
        if (lfAt !== -1 && (crAt === -1 || lfAt < crAt)) {
          line += 1;
          i += lfAt + 1;
          continue;
        }
        const at = i + crAt;
        if (parts === null) parts = [text.slice(seg, at)];
        else parts.push(text.slice(seg, at));
        parts.push('\n');
        line += 1;
        i = text.charCodeAt(at + 1) === 10 ? at + 2 : at + 1;
        seg = i;
        continue;
      }
      if (text.charCodeAt(iQ + 1) === 34) {
        // A doubled quote inside the field is one quote.
        if (parts === null) parts = [text.slice(seg, iQ)];
        else parts.push(text.slice(seg, iQ));
        parts.push('"');
        i = iQ + 2;
        seg = i;
        continue;
      }
      // The closing quote.
      let value;
      if (parts !== null) {
        parts.push(text.slice(seg, iQ));
        value = parts.join('');
      } else {
        value = text.slice(seg, iQ);
      }
      pos = iQ + 1;
      if (pos >= n) {
        fValue = value;
        fEnded = END_TEXT;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = END_COMMA;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = END_BREAK;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = END_BREAK;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next comma or
      // line break; that is quote_junk when anything was appended.
      scanUnquoted(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  for (;;) {
    // Lines left with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields = null;

    // Fast path: a whole line holding no quote at all. It then holds no quoted field, and
    // its only possible CR is the CRLF's own; anything else goes to the general scan.
    const iLf = text.indexOf('\n', pos);
    const lineEnd = iLf === -1 ? n : iLf;
    const lineText = text.slice(pos, lineEnd);
    if (lineText.indexOf('"') === -1) {
      const crAt = lineText.indexOf('\r');
      if (crAt === -1) {
        fields = lineText.split(',');
      } else if (crAt === lineText.length - 1 && iLf !== -1) {
        fields = lineText.slice(0, crAt).split(',');
      }
      if (fields !== null) {
        pos = iLf === -1 ? n : iLf + 1;
        if (iLf !== -1) line += 1;
      }
    }

    if (fields === null) {
      fields = [];
      let lastQuoted = false;
      do {
        lastQuoted = text.charCodeAt(pos) === 34;
        if (lastQuoted) scanQuoted();
        else scanUnquoted('');
        fields.push(fValue);
      } while (fEnded === END_COMMA);
      // A line that held only stray CRs is left with no characters: no record
      // (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
