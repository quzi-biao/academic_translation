const INLINE_MATH_RE = /\$([^$\n]+?)\$/g;
const DISPLAY_MATH_RE = /\$\$([\s\S]+?)\$\$/g;

function buildMathPlaceholder(index, display = false) {
  return display ? `[[DISPLAY_MATH_${index}]]` : `[[INLINE_MATH_${index}]]`;
}

export function protectMathSegments(text = '') {
  let next = String(text || '');
  const segments = [];

  next = next.replace(DISPLAY_MATH_RE, (match) => {
    const placeholder = buildMathPlaceholder(segments.length, true);
    segments.push({ placeholder, raw: match, display: true });
    return placeholder;
  });

  next = next.replace(INLINE_MATH_RE, (match) => {
    const placeholder = buildMathPlaceholder(segments.length, false);
    segments.push({ placeholder, raw: match, display: false });
    return placeholder;
  });

  return { text: next, segments };
}

export function restoreMathSegments(text = '', segments = []) {
  let next = String(text || '');
  for (const segment of segments) {
    next = next.replaceAll(segment.placeholder, segment.raw);
  }
  return next;
}

export function stripUnexpectedMathMarkup(text = '') {
  return String(text || '')
    .replace(/<span class="katex-html"[\s\S]*$/i, '')
    .replace(/<span class="katex[\s\S]*$/i, '')
    .trim();
}
