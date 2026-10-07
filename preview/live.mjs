// Forumun gerçek sayfasının yerel kopyası: sayfayı forumun içinde, forumun kendi
// CSS'iyle görmek için (canlı foruma hiçbir şey yazılmaz, yalnızca okunur).
// Forum sayfası misafir olarak okunur, betikleri çıkarılır (stiller forumdan gelir),
// menüye "Erasmus+" eklenir ve içerik alanına bu eklentinin sayfası bağlanır.
// Canlı sayfa yerel dosyaları (https -> http) engellediği için bu yol var.
//
// Çalıştır: npm run live  ->  http://127.0.0.1:4478/?tema=dark  (açık tema: ?tema=light)
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { sprite, PAGE_ICONS } from '../scripts/build-icons.mjs';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PORT || 4478);
const ORIGIN = process.env.FORUM || 'https://yu.uniforum.app';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, '..', 'yasar-erasmus-data', 'public');
const read = p => readFile(path.join(ROOT, p), 'utf8');

let forumHtml = { at: 0, html: '' };

async function shell() {
	if (Date.now() - forumHtml.at > 5 * 60 * 1000) {
		forumHtml = { at: Date.now(), html: await (await fetch(`${ORIGIN}/cv`, { headers: { 'Accept-Language': 'tr' } })).text() };
	}
	let html = forumHtml.html;
	html = html.replace(/(href|src)="\/(?!\/)/g, '$1="/__forum/').split(`${ORIGIN}/`).join('/__forum/');
	html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
	html = html.replace(/<link[^>]+rel="(?:preload|modulepreload)"[^>]+as="script"[^>]*>/gi, '');

	// Menü birden çok yerde çizilir (kenar çubuğu, mobil menü): CV öğesinin kopyası altına eklenir.
	const items = html.match(/<li class="nav-item[^"]*"[^>]*title="CV Oluşturucu">[\s\S]*?<\/li>/g) || [];
	items.forEach((li) => {
		const copy = li.replace(/CV Oluşturucu/g, 'Erasmus+').replace('href="/__forum/cv"', 'href="/#okullar"')
			.replace(/fa-file-lines|fa-file-alt/g, 'fa-earth-europe').replace(/ active/g, '');
		html = html.replace(li, `${li}\n${copy}`);
	});

	const mount = `
<link rel="stylesheet" href="/static/css/erasmus.css">
<script>
(async function () {
	var q = new URLSearchParams(location.search).get('tema');
	if (q === 'dark' || q === 'light') {
		document.documentElement.setAttribute('data-theme', q);
		document.documentElement.setAttribute('data-bs-theme', q);
	}
	var content = document.querySelector('#content');
	content.querySelectorAll('[data-widget-area]').forEach(function (el) { el.remove(); });
	content.innerHTML = '<div class="row flex-fill"><div class="w-100" id="yer-root-host"></div></div>';
	var host = document.getElementById('yer-root-host');
	document.title = 'Erasmus+ | Yaşar Forum (önizleme)';
	var get = function (u) { return fetch(u, { cache: 'no-store' }); };
	var res = await Promise.all([get('/icons.html').then(function (r) { return r.text(); }), get('/data.json').then(function (r) { return r.json(); }),
		get('/static/lib/text.js').then(function (r) { return r.text(); }), get('/static/lib/projection.js').then(function (r) { return r.text(); }), get('/static/lib/erasmus.js').then(function (r) { return r.text(); })]);
	host.innerHTML = res[0] + '<div data-yer-root></div>';
	var modules = {};
	var define = function (name, deps, factory) { modules[name] = factory.apply(null, deps.map(function (d) { return modules[d]; })); };
	define.amd = true;
	new Function('define', res[2] + '\\n' + res[3] + '\\n' + res[4])(define);
	modules['forum/yasar-erasmus'].mount(host.querySelector('[data-yer-root]'), res[1]);
}());
</script>`;
	return html.replace(/<\/body>/i, `${mount}\n</body>`);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

// Canlı forum sekmesine enjekte etmek için (https tünel üzerinden): forum sayfasında çalışır,
// eklentinin dosyalarını bu sunucudan alıp sayfanın içerik alanına bağlar. Sunucuya yazmaz.
const loader = base => `(async () => {
	const B = ${JSON.stringify('')} || '${'${base}'}';
	const get = u => fetch(B + u, { cache: 'no-store' });
	const [icons, css, data, a, b, c] = await Promise.all([get('/icons.html').then(r => r.text()), get('/static/css/erasmus.css').then(r => r.text()),
		get('/data.json').then(r => r.json()), get('/static/lib/text.js').then(r => r.text()), get('/static/lib/projection.js').then(r => r.text()), get('/static/lib/erasmus.js').then(r => r.text())]);
	let style = document.getElementById('yer-live-css');
	if (!style) { style = document.createElement('style'); style.id = 'yer-live-css'; document.head.appendChild(style); }
	style.textContent = css;
	const content = document.querySelector('#content');
	content.innerHTML = '<div class="row flex-fill"><div class="w-100">' + icons + '<div data-yer-root></div></div></div>';
	document.title = 'Erasmus+ | Yaşar Forum (önizleme)';
	const modules = {};
	const define = (name, deps, factory) => { modules[name] = factory.apply(null, deps.map(d => modules[d])); };
	define.amd = true;
	new Function('define', a + '\\n' + b + '\\n' + c)(define);
	modules['forum/yasar-erasmus'].mount(content.querySelector('[data-yer-root]'), data);
	return 'ok';
})()`.replace('${base}', base);

http.createServer(async (req, res) => {
	try {
		const url = new URL(req.url, 'http://127.0.0.1');
		const local = /^127\.0\.0\.1(:\d+)?$/.test(req.headers.host || '');
		res.setHeader('Access-Control-Allow-Origin', ORIGIN);
		// Tünelden gelen istekler yalnızca eklenti dosyalarını alır; forum kopyası ve vekil yerelde kalır.
		if (!local && (url.pathname === '/' || url.pathname.startsWith('/__forum/'))) {
			res.writeHead(404).end('yok');
			return;
		}
		if (url.pathname === '/loader.js') {
			res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }).end(loader(`https://${req.headers.host}`));
			return;
		}
		if (url.pathname === '/') {
			res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }).end(await shell());
			return;
		}
		if (url.pathname === '/icons.html') {
			res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }).end(await sprite(PAGE_ICONS, 'yer-i-'));
			return;
		}
		if (url.pathname === '/data.json') {
			const [general, schools, meta] = await Promise.all(['general', 'schools', 'meta'].map(async n => JSON.parse(await readFile(path.join(DATA_DIR, `${n}.json`), 'utf8'))));
			const map = JSON.parse(await read('static/europe-map.json'));
			res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }).end(JSON.stringify({ meta, general, schools, map }));
			return;
		}
		// Forumun stil, yazı tipi ve resimleri buradan geçer (forum başka kökene dosya vermiyor). Yalnızca okur.
		if (url.pathname.startsWith('/__forum/')) {
			const upstream = await fetch(`${ORIGIN}/${url.pathname.slice('/__forum/'.length)}${url.search}`);
			const type = upstream.headers.get('content-type') || 'application/octet-stream';
			let body = Buffer.from(await upstream.arrayBuffer());
			if (/text\/css/.test(type)) {
				body = Buffer.from(body.toString('utf8').replace(/url\((['"]?)\//g, 'url($1/__forum/').split(`${ORIGIN}/`).join('/__forum/'));
			}
			res.writeHead(upstream.status, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' }).end(body);
			return;
		}
		if (/^\/static\/(css|lib)\/[\w.-]+$/.test(url.pathname)) {
			res.writeHead(200, { 'Content-Type': TYPES[path.extname(url.pathname)] || 'text/plain', 'Cache-Control': 'no-store' }).end(await read(url.pathname.slice(1)));
			return;
		}
		res.writeHead(404).end('yok');
	} catch (err) {
		res.writeHead(500).end(String(err));
	}
}).listen(PORT, '127.0.0.1', () => console.log(`forum kopyası: http://127.0.0.1:${PORT}/?tema=dark`));
