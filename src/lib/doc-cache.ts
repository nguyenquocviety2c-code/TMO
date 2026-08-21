/** Shared document list cache invalidation signal.
 *  Both the upload route and process route use this to coordinate cache invalidation.
 *
 *  The upload route maintains an in-memory reconciliation cache (reconciliationCache)
 *  that avoids expensive Qdrant/SQLite queries on every page load.
 *  When the process route finishes processing a document, it signals that the cache
 *  is stale so the next GET request to the upload route rebuilds it.
 *
 *  Usage:
 *    - Upload route: call invalidateDocumentCache() alongside invalidateCache()
 *      In the GET handler, check getCacheInvalidationTimestamp() vs cache timestamp
 *    - Process route: call invalidateDocumentCache() after each document is processed
 */

let _cacheInvalidatedAt = 0

/** Signal that the document list cache is stale.
 *  Called when documents are added, deleted, or their status changes. */
export function invalidateDocumentCache() {
  _cacheInvalidatedAt = Date.now()
}

/** Get the timestamp of the last cache invalidation.
 *  Compare this with your cache's timestamp to detect staleness. */
export function getCacheInvalidationTimestamp() {
  return _cacheInvalidatedAt
}
