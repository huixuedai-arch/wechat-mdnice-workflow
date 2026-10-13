/* Pure preflight policy; shared with local regression tests. */
globalThis.EditorialPreflight = {
 normalize(s) { return String(s ?? '').replace(/[\s\u200B-\u200D\uFEFF]/g, ''); },
 empty(s) {
  const title=this.normalize(s.title), body=this.normalize(s.body);
  if(title || s.mediaCount || s.hasStructuredContent) return false;
  if(!body) return true;
  // Only the exact UI prompt plus an independent empty-editor signal is ignored.
  return body==='从这里开始写正文' && (s.placeholderEvidence || s.zeroWordCount);
 },
 retryable(s) {
  return !!s && s.stage==='blocked' && s.blockedAt==='import' &&
   s.error==='编辑页不是空白，已停止以免覆盖已有文章' &&
   !s.mutationStarted && !s.draftId && !s.imageUrls &&
   s.events?.length>0 && s.events.every(e=>(e.stage==='blocked' && e.note===s.error)||(e.stage==='import' && e.note==='空白检测诊断'));
 }
};
