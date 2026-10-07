// Tek dosyalık önizleme: plugin'in kendi şablonu, CSS'i ve JS'i + yerel veri,
// forumu taklit eden bir kabuk içinde. Forum kurulumu olmadan sayfayı görmek içindir.
//
// Çalıştır: npm run preview
//   DATA_DIR=../yasar-erasmus-data/public (varsayılan)
//   OUT=/yol/dosya.html (isteğe bağlı ek kopya)
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { sprite, faSvg, PAGE_ICONS } from '../scripts/build-icons.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'preview', '.cache');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, '..', 'yasar-erasmus-data', 'public');
const SHELL_ICONS = [
	'house', 'table-cells-large', 'inbox', 'tags', 'fire', 'user', 'user-group', 'gear', 'graduation-cap',
	'table-cells', 'file-lines', 'file-pdf', 'earth-europe', 'calendar-days', 'angles-left', 'sun', 'moon',
	'pen-to-square', 'magnifying-glass', 'bell', 'comments',
];

const read = p => readFile(path.join(ROOT, p), 'utf8');
const readData = async name => JSON.parse(await readFile(path.join(DATA_DIR, name), 'utf8'));

async function cached(name, url, binary) {
	const file = path.join(CACHE, name);
	try {
		return await readFile(file, binary ? undefined : 'utf8');
	} catch {
		const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
		if (!res.ok) {
			throw new Error(`${url} -> ${res.status}`);
		}
		const buf = Buffer.from(await res.arrayBuffer());
		await mkdir(CACHE, { recursive: true });
		await writeFile(file, buf);
		return binary ? buf : buf.toString('utf8');
	}
}

// Forum Inter kullanıyor; önizleme dosyası tek başına açılsın diye değişken font
// (400-800 ağırlık) gömülür. Kaynak: @fontsource-variable/inter.
async function fontFaces() {
	const base = 'https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/files';
	const sets = [
		['latin-ext', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
		['latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
	];
	let out = '';
	for (const [subset, range] of sets) {
		const buf = await cached(`inter-var-${subset}.woff2`, `${base}/inter-${subset}-wght-normal.woff2`, true);
		out += `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');unicode-range:${range};}\n`;
	}
	return out;
}

async function main() {
	await Promise.all([...SHELL_ICONS, ...PAGE_ICONS].map(faSvg));
	const [general, schools, meta] = await Promise.all([readData('general.json'), readData('schools.json'), readData('meta.json')]);
	const map = JSON.parse(await read('static/europe-map.json'));
	const data = { meta, general, schools, map };

	const [shell, shellCss, pageCss, tpl, icons, textJs, projJs, pageJs, fonts, shellSprite] = await Promise.all([
		read('preview/shell.html'), read('preview/shell.css'), read('static/css/erasmus.css'),
		read('templates/yasar-erasmus.tpl'), read('templates/partials/yasar-erasmus/icons.tpl'),
		read('static/lib/text.js'), read('static/lib/projection.js'), read('static/lib/erasmus.js'),
		fontFaces(), sprite(SHELL_ICONS, 'i-'),
	]);

	const page = tpl
		.replace('<!-- IMPORT partials/yasar-erasmus/icons.tpl -->', () => icons)
		.replace('{dataUrl}', '');

	// NodeBB'nin AMD yükleyicisini taklit eden küçük bir define() ve açılış.
	const boot = `
(function () {
	var modules = {};
	window.define = function (name, deps, factory) {
		modules[name] = factory.apply(null, deps.map(function (d) { return modules[d]; }));
	};
	window.define.amd = true;
${textJs}
${projJs}
${pageJs}
	var root = document.querySelector('[data-yer-root]');
	var data = JSON.parse(document.getElementById('yer-data').textContent);
	modules['forum/yasar-erasmus'].mount(root, data, { preview: true });
	document.querySelector('[data-theme-toggle]').addEventListener('click', function () {
		var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		document.documentElement.setAttribute('data-bs-theme', next);
		try { localStorage.setItem('yer-theme', next); } catch (e) {}
	});
})();`;

	const html = shell
		.replace('/*__FONTS__*/', () => fonts)
		.replace('/*__CSS__*/', () => `${shellCss}\n${pageCss}`)
		.replace('<!--__SPRITE__-->', () => shellSprite)
		.replace('<!--PAGE-->', () => page)
		.replace('__DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c'))
		.replace('/*__JS__*/', () => boot);

	const out = path.join(ROOT, 'preview', 'dist', 'yasar-erasmus-tasarim.html');
	await mkdir(path.dirname(out), { recursive: true });
	await writeFile(out, html);
	if (process.env.OUT) {
		await copyFile(out, process.env.OUT);
	}
	console.log(`önizleme: ${(html.length / 1024).toFixed(0)} KB, ${schools.length} okul -> ${out}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
