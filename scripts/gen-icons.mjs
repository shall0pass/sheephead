// Rasterise static/icon.svg into the PNG sizes the PWA manifest and iOS need.
// The output PNGs are committed, so this only needs re-running when the icon
// artwork changes. Run: `npm run icons` (needs `sharp` — present transitively
// via wrangler, or `npm i -D sharp`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'static/icon.svg'));

const out = [
	['static/pwa-192.png', 192],
	['static/pwa-512.png', 512],
	['static/pwa-maskable-192.png', 192],
	['static/pwa-maskable-512.png', 512],
	['static/apple-touch-icon.png', 180],
	['static/favicon.png', 64]
];

for (const [file, size] of out) {
	await sharp(svg, { density: 384 })
		.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(resolve(root, file));
	console.log('wrote', file, `${size}x${size}`);
}
