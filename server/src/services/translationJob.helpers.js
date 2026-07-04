export const ACTIVE_TRANSLATION_STATUSES = ['queued', 'parsing', 'summarizing', 'translating'];

export function stripExtension(fileName = '') {
  return String(fileName || '').replace(/\.[^.]+$/, '');
}

export function normalizeExtension(ext = '') {
  return String(ext || '').replace(/^\./, '').trim().toLowerCase();
}

export function inferDocumentExtension(doc) {
  const fromField = normalizeExtension(doc.fileExt);
  if (fromField) return fromField;
  const fromType = normalizeExtension(doc.fileType);
  if (fromType && !fromType.includes('/')) return fromType;
  const mimeMap = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/markdown': 'md',
    'text/plain': 'txt',
  };
  if (mimeMap[doc.fileType]) return mimeMap[doc.fileType];
  const fromUrl = normalizeExtension((doc.sourceUrl || '').split('?')[0].split('/').pop()?.split('.').pop());
  if (fromUrl) return fromUrl;
  return normalizeExtension(doc.originalName.split('.').pop()) || 'pdf';
}

export function buildParserFileName(doc) {
  const ext = inferDocumentExtension(doc);
  const base = stripExtension(doc.originalName || 'document') || 'document';
  return `${base}.${ext}`;
}

export function buildTranslationChargeRef(documentId, translationRound) {
  return `${documentId}:round:${translationRound}`;
}

export function abortError() {
  const err = new Error('任务已停止');
  err.code = 'ABORT_ERR';
  return err;
}

export function isAbortError(err) {
  return err?.code === 'ABORT_ERR' || err?.name === 'AbortError' || /任务已停止/i.test(String(err?.message || ''));
}

export function getTranslatableBlocks(flatBlocks) {
  return flatBlocks.filter((block) => !['document', 'table_row', 'table_cell', 'divider', 'frontmatter'].includes(block.type));
}
