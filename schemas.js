const str = { type: 'string', required: true }
const int = { type: 'integer', required: true }
const bool = { type: 'boolean', required: true }
const array = ({ required: _required, ...items }) => ({ type: 'array', items, required: true })
const object = properties => ({ type: 'object', additionalProperties: false, properties })
const coverage = { ...object({ totalPages: int, indexedPages: int, visualNotedPages: int,
  partial: bool, unreadLowTextPages: array(int), warning: str }), required: true }

export const outputs = {
  inspect: object({ documentId: str, name: str, coverage,
    outline: array({ type: 'array', items: { type: 'json' } }),
    pageStats: array(object({ page: int, label: str, chars: int, images: int })), statsTruncated: bool }),
  search: object({ documentId: str, hits: array(object({ page: int, score: { type: 'number', required: true }, excerpt: str, source: str })),
    matchedPages: int, truncated: bool, coverage }),
  read: object({ documentId: str, page: int, label: str, evidenceId: str, text: str,
    textTruncated: bool, source: str,
    image: object({ attachmentId: str, mediaType: str, bytes: int, width: int, height: int,
      name: { type: 'string' }, originalDimensions: object({ width: int, height: int }) }) }),
  note: object({ page: int, evidenceId: str, summary: str, keywords: array(str), source: str }),
  verify: object({ evidenceId: str, page: int, quote: str, status: str, semanticVerified: bool, note: str }),
  locate: object({ documentId: str, name: str, page: int, quote: str,
    matches: array(object({ regions: array({ type: 'array', items: { type: 'number' } }) })),
    status: str, precision: str, coordinateSystem: str, truncated: bool }),
  export: object({ path: str, documentId: str, pages: array(int), semanticVerified: bool }),
}

export const pdf = { type: 'string', required: true, description: 'Local PDF path inside configured allowedRoots.' }
export const page = { type: 'integer', required: true, description: 'Physical page number, starting at 1 (not the printed page label).' }
export const claims = array(object({ text: str, pages: array(int) }))
