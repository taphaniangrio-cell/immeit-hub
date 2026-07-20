module.exports = function sanitizeInput(str, maxLen = 500) {
  return String(str)
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxLen);
};
