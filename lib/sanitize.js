module.exports = function sanitizeInput(str, maxLen = 500) {
  return String(str)
    .trim()
    .replace(/[&]/g, '&amp;')
    .replace(/[<]/g, '&lt;')
    .replace(/[>]/g, '&gt;')
    .replace(/["]/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxLen);
};
