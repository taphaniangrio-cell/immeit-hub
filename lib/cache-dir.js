const fs = require('fs');
const path = require('path');

function getCacheDir() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'IMMEIT');
  }
  if (process.env.VERCEL || process.platform === 'linux') {
    return path.join('/tmp', 'immeit-cache');
  }
  return path.join(__dirname, '..', '.immeit-logs');
}

function getServerDir() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'IMMEIT');
  }
  return path.join(__dirname, '..', '.immeit-logs');
}

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch { return false; }
}

function safeWriteFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  } catch { return false; }
}

function safeReadFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
  } catch {}
  return null;
}

function safeDeleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch { return false; }
}

module.exports = { getCacheDir, getServerDir, ensureDir, safeWriteFile, safeReadFile, safeDeleteFile };
