'use strict';

const crypto = require('node:crypto');

const nconf = require.main.require('nconf');
const validator = require.main.require('validator');
const meta = require.main.require('./src/meta');
const db = require.main.require('./src/database');
const topics = require.main.require('./src/topics');
const user = require.main.require('./src/user');
const categories = require.main.require('./src/categories');
const privileges = require.main.require('./src/privileges');
const routeHelpers = require.main.require('./src/routes/helpers');
const controllerHelpers = require.main.require('./src/controllers/helpers');

const { fold } = require('./static/lib/text');
const pages = require('./lib/pages');
const { version: VERSION } = require('./package.json');

const plugin = module.exports;

const NAMESPACE = 'yasar-erasmus';
const DATA_PATH = '/api/yasar-erasmus/data';
const TOPICS_PATH = '/api/yasar-erasmus/topics';
const MAX_SCAN = 500;
const MAX_TOPICS = 10;

// Veri eklentiyle gelir (data/, npm run sync-data): sunucu açılırken bir kez okunur.
const payload = JSON.stringify({
	meta: require('./data/meta.json'),
	general: require('./data/general.json'),
	schools: require('./data/schools.json'),
	map: require('./static/europe-map.json'),
});
const ETAG = `"${crypto.createHash('sha1').update(payload).update(VERSION).digest('hex').slice(0, 16)}"`;
const schoolById = new Map(require('./data/schools.json').map(s => [s.id, s]));
// Arama motoru sayfaları (lib/pages.js) için dizin; veri eklentiyle geldiği için bir kez kurulur.
const site = pages.buildSite({ general: require('./data/general.json'), schools: require('./data/schools.json') });
const BASE = '/erasmus';

async function categoryId() {
	const saved = (await meta.settings.get(NAMESPACE)) || {};
	const cid = parseInt(saved.categoryId, 10);
	return Number.isFinite(cid) && cid > 0 ? cid : 0;
}

// kind: main (/erasmus), field (/erasmus/bolum/:slug), country (/erasmus/ulke/:slug), school (/erasmus/okul/:slug),
// guide (/erasmus/hibe, /yol-haritasi, /sik-sorulanlar). Tarayıcıdaki uygulama hepsinde aynı; değişen başlık,
// açıklama, açılış seçimi ve sunucuda yazılan içerik.
function pageController(kind, guideId) {
	return async function (req, res, next) {
		let item = guideId || null;
		if (kind === 'field' || kind === 'country' || kind === 'school') {
			item = { field: site.fieldBySlug, country: site.countryBySlug, school: site.schoolBySlug }[kind].get(req.params.slug);
			if (!item) {
				return next();
			}
		}
		const rel = nconf.get('relative_path');
		const cid = await categoryId();
		const view = pages.page(site, kind, item, `${rel}${BASE}`);
		res.locals.metaTags = [
			{ name: 'description', content: view.description },
			{ property: 'og:title', content: view.title },
			{ property: 'og:description', content: view.description },
			{ property: 'og:type', content: 'website' },
			{ name: 'keywords', content: view.keywords },
		];
		res.locals.linkTags = [{ rel: 'canonical', href: `${nconf.get('url')}${view.path.slice(rel.length)}` }];
		res.render('yasar-erasmus', {
			title: view.title,
			breadcrumbs: kind === 'main' ? undefined : controllerHelpers.buildBreadcrumbs([{ text: 'Erasmus+', url: BASE.slice(1) }, { text: view.crumb }]),
			dataUrl: `${rel}${DATA_PATH}`,
			topicsUrl: `${rel}${TOPICS_PATH}`,
			categoryId: cid,
			start: view.start,
			innerHtml: view.inner,
			aboveHtml: view.above,
			indexHtml: pages.indexHtml(site, `${rel}${BASE}`, cid ? `${rel}/category/${cid}` : ''),
		});
	};
}

function serveData(req, res) {
	res.set('ETag', ETAG);
	res.set('Cache-Control', 'public, max-age=300');
	if (req.headers['if-none-match'] === ETAG) {
		return res.status(304).end();
	}
	res.type('application/json').send(payload);
}

// Okulun konuları: Erasmus+ kategorisinde başlığı "[Okul adı]" ile başlayanlar (Konu aç düğmesi böyle açar).
// Kişinin okuyamadığı konular listeye girmez.
async function listTopics(req, res) {
	const school = schoolById.get(String(req.query.school || ''));
	const cid = await categoryId();
	if (!school || !cid) {
		return res.status(404).json({ topics: [], categoryUrl: '' });
	}
	const [tids, pinned, slug] = await Promise.all([
		db.getSortedSetRevRange(`cid:${cid}:tids`, 0, MAX_SCAN - 1),
		db.getSortedSetRevRange(`cid:${cid}:tids:pinned`, 0, -1),
		categories.getCategoryField(cid, 'slug'),
	]);
	const readable = await privileges.topics.filterTids('topics:read', [...new Set([...pinned, ...tids])], req.uid);
	const fields = await topics.getTopicsFields(readable, ['tid', 'title', 'slug', 'postcount', 'lastposttime', 'uid', 'deleted']);
	const prefix = fold(`[${school.name}]`);
	const found = fields
		.filter(t => t && t.tid && !t.deleted && fold(validator.unescape(String(t.title))).startsWith(prefix))
		.sort((a, b) => b.lastposttime - a.lastposttime)
		.slice(0, MAX_TOPICS);
	const users = await user.getUsersFields([...new Set(found.map(t => t.uid))], ['uid', 'username']);
	const nameOf = new Map(users.map(u => [u.uid, u.username]));
	res.set('Cache-Control', 'private, no-store');
	res.json({
		categoryUrl: `/category/${slug}`,
		topics: found.map(t => ({
			title: validator.unescape(String(t.title)),
			slug: t.slug,
			replies: Math.max(0, (t.postcount || 1) - 1),
			lastposttime: t.lastposttime,
			user: validator.unescape(String(nameOf.get(t.uid) || '')),
		})),
	});
}

plugin.init = async function ({ router, middleware }) {
	routeHelpers.setupPageRoute(router, BASE, [], pageController('main'));
	Object.keys(pages.GUIDES).forEach(id => routeHelpers.setupPageRoute(router, `${BASE}/${id}`, [], pageController('guide', id)));
	routeHelpers.setupPageRoute(router, `${BASE}/bolum/:slug`, [], pageController('field'));
	routeHelpers.setupPageRoute(router, `${BASE}/ulke/:slug`, [], pageController('country'));
	routeHelpers.setupPageRoute(router, `${BASE}/okul/:slug`, [], pageController('school'));
	router.get(DATA_PATH, serveData);
	router.get(TOPICS_PATH, middleware.authenticateRequest, (req, res, next) => listTopics(req, res).catch(next));
};

// ACP > Navigasyon'da "Erasmus+" seçilebilir olsun.
plugin.addNavigation = async function (items) {
	items.push({
		route: '/erasmus',
		title: 'Erasmus+',
		enabled: false,
		iconClass: 'fa-earth-europe',
		textClass: '',
		text: 'Erasmus+',
	});
	return items;
};

// Bütün Erasmus+ sayfaları forumun sitemap.xml'ine girer; Google her bölümü, ülkeyi ve okulu ayrı bulur.
plugin.addSitemapPages = async function (data) {
	const rel = nconf.get('relative_path');
	data.urls.push(...pages.sitemapEntries(site, `${rel}${BASE}`));
	return data;
};
