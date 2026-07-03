export const KATEX_MACROS = {
  '\\uplambda': '\\lambda',
  '\\upmu': '\\mu',
  '\\upalpha': '\\alpha',
  '\\upbeta': '\\beta',
  '\\upgamma': '\\gamma',
  '\\updelta': '\\delta',
  '\\upepsilon': '\\epsilon',
  '\\upvarepsilon': '\\varepsilon',
  '\\upeta': '\\eta',
  '\\uptheta': '\\theta',
  '\\upvartheta': '\\vartheta',
  '\\upiota': '\\iota',
  '\\upkappa': '\\kappa',
  '\\upnu': '\\nu',
  '\\upxi': '\\xi',
  '\\uppi': '\\pi',
  '\\upvarpi': '\\varpi',
  '\\uprho': '\\rho',
  '\\upvarrho': '\\varrho',
  '\\upsigma': '\\sigma',
  '\\upvarsigma': '\\varsigma',
  '\\uptau': '\\tau',
  '\\upphi': '\\phi',
  '\\upvarphi': '\\varphi',
  '\\upchi': '\\chi',
  '\\uppsi': '\\psi',
  '\\upomega': '\\omega',
};

export function normalizeMathExpression(expression = '') {
  let value = String(expression || '').trim();
  if (!value) return '';

  value = value.replace(/\\h(?=\s*\()/g, 'h');
  value = value.replace(/(?<!\\)\bl\s*n(?=\s*[A-Za-z(\\])/g, '\\ln');
  value = value.replace(/(?<!\\)\bln(?=\s*[A-Za-z(\\])/g, '\\ln');

  for (const [from, to] of Object.entries(KATEX_MACROS)) {
    value = value.replaceAll(from, to);
  }

  return value.trim();
}
