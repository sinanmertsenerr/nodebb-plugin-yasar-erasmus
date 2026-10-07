// Sayfanın kullandığı ikonları tek bir SVG sprite'a toplar:
// templates/partials/yasar-erasmus/icons.tpl
// Çalıştır: npm run build:icons (geliştirme sırasında; çıktı depoda durur).
//
// Font Awesome Free 6 (ikonlar CC BY 4.0): forum da Font Awesome kullanıyor,
// böylece sayfa tek ikon ailesiyle kalır.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const FA = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/svgs/solid';
export const PAGE_ICONS = [
	'arrow-left', 'arrow-up-right-from-square', 'chevron-down', 'chevron-right', 'magnifying-glass', 'minus', 'plus',
	'rotate-left', 'triangle-exclamation',
];

export async function faSvg(name) {
	const cache = path.join(ROOT, 'preview', '.cache', `fa-${name}.svg`);
	try {
		return await readFile(cache, 'utf8');
	} catch {
		const res = await fetch(`${FA}/${name}.svg`);
		if (!res.ok) {
			throw new Error(`${name}.svg -> ${res.status}`);
		}
		const svg = await res.text();
		await mkdir(path.dirname(cache), { recursive: true });
		await writeFile(cache, svg);
		return svg;
	}
}

export async function sprite(names, prefix) {
	let symbols = '';
	for (const name of names) {
		const svg = await faSvg(name);
		const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
		const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '');
		symbols += `<symbol id="${prefix}${name}" viewBox="${viewBox}">${inner}</symbol>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const out = path.join(ROOT, 'templates', 'partials', 'yasar-erasmus', 'icons.tpl');
	await writeFile(out, `<!-- Font Awesome Free 6.7.2 ikonları, CC BY 4.0: https://fontawesome.com/license/free -->\n${await sprite(PAGE_ICONS, 'yer-i-')}\n`);
	console.log(`icons.tpl: ${PAGE_ICONS.length} ikon`);
}
