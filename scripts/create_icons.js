import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Minimal 1x1 purple PNG icon fallback (base64)
const FALLBACK_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const targets = [
  path.join(rootDir, 'icons'),
  path.join(rootDir, 'public', 'icons')
];

const sizes = [16, 48, 128];

function ensureIconsExist() {
  for (const targetDir of targets) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }

  for (const size of sizes) {
    const filename = `icon${size}.png`;
    const iconsPath = path.join(rootDir, 'icons', filename);
    const publicIconsPath = path.join(rootDir, 'public', 'icons', filename);

    let sourceBuffer = null;

    if (fs.existsSync(iconsPath)) {
      sourceBuffer = fs.readFileSync(iconsPath);
    } else if (fs.existsSync(publicIconsPath)) {
      sourceBuffer = fs.readFileSync(publicIconsPath);
    } else {
      sourceBuffer = Buffer.from(FALLBACK_PNG_BASE64, 'base64');
    }

    if (!fs.existsSync(iconsPath)) {
      fs.writeFileSync(iconsPath, sourceBuffer);
    }
    if (!fs.existsSync(publicIconsPath)) {
      fs.writeFileSync(publicIconsPath, sourceBuffer);
    }

    console.log(`Generated/Verified ${filename} across all target folders`);
  }
}

ensureIconsExist();
