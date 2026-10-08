'use strict';

// Arama motorları için ayrı sayfalar: her bölüm (/erasmus/bolum/<ad>), ülke (/erasmus/ulke/<ad>),
// okul (/erasmus/okul/<ad>) ve rehber sekmesi (/erasmus/hibe, /yol-haritasi, /sik-sorulanlar).
// Her sayfanın kendi adresi, başlığı, açıklaması ve sunucuda yazılmış içeriği var: Google sayfayı
// JavaScript çalıştırmadan da okur. Tarayıcıdaki uygulama aynı seçimle açılır (data-start).
// Saf fonksiyonlar; veri eklentinin data/ dosyalarıyla aynı biçimde.

const T = require('../static/lib/text');

const { esc, nf, eur, km, lvl } = T;

const LEVEL_ORDER = ['Önlisans', 'Lisans', 'Yüksek Lisans', 'Doktora'];
const trSort = (a, b) => a.localeCompare(b, 'tr');
// '"Ovidius" University' gibi tırnakla başlayan adlar listenin başına kaçmasın.
const byName = (a, b) => trSort(a.name.replace(/^[^\p{L}\p{N}]+/u, ''), b.name.replace(/^[^\p{L}\p{N}]+/u, ''));
const icon = name => `<svg class="yer-i" aria-hidden="true" focusable="false"><use href="#yer-i-${name}"/></svg>`;
const dash = text => String(text).replace(/\s-\s/g, ' – ');
const plain = value => String(value).replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim();
const safeUrl = url => (/^(https?:|mailto:)/.test(url) ? url : '');
const ext = (url, label) => (safeUrl(url) ?
	`<a class="yer-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : '');

// Adreste yalnızca a-z, 0-9 ve tire: "Çek Cumhuriyeti" -> "cek-cumhuriyeti", "Łódź" -> "lodz".
function slugify(value) {
	return T.fold(value)
		.replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o')
		.replace(/ł/g, 'l').replace(/đ/g, 'd')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// ['A', 'B', 'C', 'D'], 2, 'ülke' -> "A, B ve 2 ülke daha"
function listSentence(items, max, noun) {
	const shown = items.slice(0, max);
	const rest = items.length - shown.length;
	if (rest > 0) {
		return `${shown.join(', ')} ve ${rest} ${noun} daha`;
	}
	return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} ve ${shown[shown.length - 1]}` : shown.join('');
}

// "Yaşar Erasmus Almanya" aramasının bütün yazılışları: Türkçe karakterli ve karaktersiz.
const PREFIXES = ['Yaşar Erasmus', 'Yaşar Erasmus+', 'Yaşar Üniversitesi Erasmus', 'Yaşar Üni Erasmus', 'YU Erasmus'];
const ascii = s => s
	.replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ş/g, 's').replace(/Ş/g, 'S')
	.replace(/ğ/g, 'g').replace(/Ğ/g, 'G').replace(/ü/g, 'u').replace(/Ü/g, 'U')
	.replace(/ö/g, 'o').replace(/Ö/g, 'O').replace(/ç/g, 'c').replace(/Ç/g, 'C');

function keywords(terms, extra = []) {
	const out = [];
	terms.forEach(term => PREFIXES.forEach(prefix => out.push(term ? `${prefix} ${term}` : prefix)));
	out.push(...extra);
	const all = out.flatMap(k => [k.toLocaleLowerCase('tr'), ascii(k).toLowerCase()]);
	return [...new Set(all)].join(', ');
}

// Aynı adı taşıyan iki okul olursa ikisi de kimliğiyle ayrılır; sıraya bağlı değil, adresler kaymaz.
function uniqueSlugs(items, base, fallback) {
	const counts = new Map();
	items.forEach(it => counts.set(base(it), (counts.get(base(it)) || 0) + 1));
	return items.map(it => (counts.get(base(it)) > 1 ? `${base(it)}-${slugify(fallback(it))}` : base(it)));
}

function buildSite({ general: g, schools: rawSchools }) {
	const schools = rawSchools
		.map(s => Object.assign({}, s, { programs: s.programs.filter(p => !p.staff_only) }))
		.filter(s => s.programs.length)
		.sort(byName);
	const schoolSlug = new Map();
	uniqueSlugs(schools, s => slugify(s.name), s => s.id).forEach((slug, i) => schoolSlug.set(schools[i].id, slug));

	const fields = g.fields.map((f) => {
		const list = schools.filter(s => s.programs.some(p => p.field_id === f.id));
		return { id: f.id, tr: f.tr, en: f.en, slug: f.id, schools: list, countries: groupByCountry(list) };
	}).filter(f => f.schools.length).sort((a, b) => b.schools.length - a.schools.length || trSort(a.tr, b.tr));

	const countries = groupByCountry(schools);
	countries.forEach((c) => {
		c.fields = fields.filter(f => c.schools.some(s => s.programs.some(p => p.field_id === f.id)));
	});

	return {
		g,
		schools,
		fields,
		countries,
		fieldBySlug: new Map(fields.map(f => [f.slug, f])),
		fieldById: new Map(fields.map(f => [f.id, f])),
		countryBySlug: new Map(countries.map(c => [c.slug, c])),
		countryByName: new Map(countries.map(c => [c.name, c])),
		schoolBySlug: new Map(schools.map(s => [schoolSlug.get(s.id), s])),
		schoolSlug: id => schoolSlug.get(id),
	};
}

// Ülkeler okul sayısına göre, eşitse ada göre.
function groupByCountry(list) {
	const byName = new Map();
	list.forEach((s) => {
		if (!byName.has(s.country_tr)) {
			byName.set(s.country_tr, { name: s.country_tr, slug: slugify(s.country_tr), grant: s.grant.monthly_eur, schools: [] });
		}
		byName.get(s.country_tr).schools.push(s);
	});
	return [...byName.values()].sort((a, b) => b.schools.length - a.schools.length || trSort(a.name, b.name));
}

function paths(base, site) {
	return {
		main: base,
		field: f => `${base}/bolum/${f.slug}`,
		country: c => `${base}/ulke/${c.slug}`,
		school: s => `${base}/okul/${site.schoolSlug(s.id)}`,
		guide: id => `${base}/${id}`,
	};
}

const GUIDES = {
	hibe: { label: 'Hibe', start: 'hibe' },
	'yol-haritasi': { label: 'Başvuru takvimi ve şartlar', start: 'yol-haritasi' },
	'sik-sorulanlar': { label: 'Sık sorulanlar', start: 'sss' },
};

// ------------------------------------------------------------ parçalar

// Uygulamanın başlığıyla aynı görünüm: JavaScript gelince yerini uygulama alır.
function head(site, heading, lede) {
	const g = site.g;
	const date = T.longDate(g.generated_at);
	return `<header class="yer-head">
		<div>
			<h1 class="yer-title">${esc(heading)}</h1>
			<p class="yer-lede">${esc(lede)}</p>
			<p class="yer-meta">${esc(T.termLabel(g.term.academic_year))} · ${nf.format(site.schools.length)} okul · ${nf.format(site.countries.length)} ülke${date ? ` · ${esc(date)}` : ''}</p>
		</div>
	</header>`;
}

function levelsText(s, fieldId) {
	const set = new Set();
	s.programs.filter(p => !fieldId || p.field_id === fieldId).forEach(p => p.levels.forEach(l => set.add(l)));
	const list = LEVEL_ORDER.filter(l => set.has(l));
	return list.length ? list.map(lvl).join(', ') : 'Düzey yazmıyor';
}

// Sitenin her sayfasının altındaki dizin: bütün bölüm, ülke ve okul sayfalarına bağlantı.
function indexHtml(site, base, categoryUrl) {
	const to = paths(base, site);
	const block = (title, inner) => `<details class="yer-qa"><summary>${esc(title)}${icon('chevron-down')}</summary><div class="yer-qa__a">${inner}</div></details>`;
	const links = items => `<ul class="yer-index__links">${items.join('')}</ul>`;
	const guide = [
		`<li><a href="${esc(to.main)}">Erasmus+ okul bulucu</a></li>`,
		...Object.entries(GUIDES).map(([id, x]) => `<li><a href="${esc(to.guide(id))}">${esc(x.label)}</a></li>`),
		categoryUrl ? `<li><a href="${esc(categoryUrl)}">Erasmus+ forum konuları</a></li>` : '',
	];
	return `<nav class="yer yer-index" aria-labelledby="yer-index-t">
		<h2 class="yer-h2" id="yer-index-t">Yaşar Erasmus+ sayfaları</h2>
		<div class="yer-faq">
			${block('Rehber', links(guide))}
			${block(`Bölümlere göre (${site.fields.length})`, links(site.fields.map(f => `<li><a href="${esc(to.field(f))}">${esc(f.tr)}</a> <span class="yer-muted">${nf.format(f.schools.length)} okul</span></li>`)))}
			${block(`Ülkelere göre (${site.countries.length})`, links(site.countries.map(c => `<li><a href="${esc(to.country(c))}">${esc(c.name)}</a> <span class="yer-muted">${nf.format(c.schools.length)} okul</span></li>`)))}
			${block(`Bütün okullar (${site.schools.length})`, site.countries.map(c => `<h3 class="yer-index__h">${esc(c.name)}</h3>${links(c.schools.map(s => `<li><a href="${esc(to.school(s))}">${esc(s.name)}</a></li>`))}`).join(''))}
		</div>
	</nav>`;
}

function mainInner(site, base) {
	const to = paths(base, site);
	return `${head(site, 'Erasmus+ ile bir dönem yurt dışı', 'Yaşar Üniversitesi öğrencileri için anlaşmalı okullar, hibe ve başvuru rehberi.')}
	<section class="yer-block yer-block--first" aria-labelledby="yer-ssr-f">
		<h2 class="yer-h2" id="yer-ssr-f">Bölümünü seç</h2>
		<p>Yaşar Üniversitesi'nin ${nf.format(site.countries.length)} ülkede ${nf.format(site.schools.length)} okulla Erasmus+ anlaşması var. Bölümünü seç, anlaşmalı ülkeleri, okulları, eğitim dilini ve hibeyi gör.</p>
		<ul class="yer-index__links">${site.fields.map(f => `<li><a href="${esc(to.field(f))}">${esc(f.tr)}</a> <span class="yer-muted">${nf.format(f.schools.length)} okul</span></li>`).join('')}</ul>
	</section>`;
}

function fieldInner(site, f, base) {
	const to = paths(base, site);
	return `${head(site, `${f.tr} Erasmus+ anlaşmaları`, `Yaşar Üniversitesi ${f.tr} öğrencileri için anlaşmalı okullar, ülkeler ve hibe.`)}
	<section class="yer-block yer-block--first" aria-labelledby="yer-ssr-f">
		<h2 class="yer-h2" id="yer-ssr-f">${esc(f.tr)}: ${nf.format(f.countries.length)} ülkede ${nf.format(f.schools.length)} anlaşmalı okul</h2>
		<p>Yaşar Üniversitesi ${esc(f.tr)} bölümünün Erasmus+ öğrenim hareketliliği anlaşmaları. Okulun adına tıklayınca eğitim dili, dil şartı, ücret, konaklama ve başvuru tarihleri açılır.</p>
		${f.countries.map(c => `<h3 class="yer-index__h"><a href="${esc(to.country(c))}">${esc(c.name)}</a> <span class="yer-muted">${nf.format(c.schools.length)} okul · aylık ${esc(eur(c.grant))} hibe</span></h3>
		<ul class="yer-index__links">${c.schools.map(s => `<li><a href="${esc(to.school(s))}">${esc(s.name)}</a> <span class="yer-muted">${esc(s.city)} · ${esc(levelsText(s, f.id))}</span></li>`).join('')}</ul>`).join('')}
	</section>`;
}

// Ülke sayfası uygulamanın üstünde durur: uygulamada "yalnızca ülke" görünümü yok.
function countryLanding(site, c, base) {
	const to = paths(base, site);
	return `<section class="yer yer-landing" aria-labelledby="yer-ssr-c">
		<h1 class="yer-title" id="yer-ssr-c">${esc(c.name)} Erasmus+ okulları</h1>
		<p class="yer-lede">Yaşar Üniversitesi'nin ${esc(T.locative(c.name))} ${nf.format(c.schools.length)} anlaşmalı okulu var. Aylık hibe ${esc(eur(c.grant))}.</p>
		<p>Anlaşmalı bölümler: ${c.fields.map(f => `<a href="${esc(to.field(f))}">${esc(f.tr)}</a>`).join(', ')}.</p>
		<ul class="yer-index__links yer-index__links--wide">${c.schools.map(s => `<li><a href="${esc(to.school(s))}">${esc(s.name)}</a> <span class="yer-muted">${esc(s.city)} · ${esc(s.programs.map(p => (site.fieldById.get(p.field_id) || {}).tr).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', '))}</span></li>`).join('')}</ul>
	</section>`;
}

function schoolInner(site, s, base) {
	const to = paths(base, site);
	const i = s.info || {};
	const acc = i.accommodation || {};
	const dl = i.deadlines || {};
	const country = site.countryByName.get(s.country_tr);
	const travel = s.travel_grant && s.travel_grant.standard_eur != null ?
		`${eur(s.travel_grant.standard_eur)}${s.travel_grant.green_eur != null ? `, yeşil seyahatle ${eur(s.travel_grant.green_eur)}` : ''}` : '';
	const facts = [
		['Şehir', `${esc(s.city)}, ${country ? `<a href="${esc(to.country(country))}">${esc(s.country_tr)}</a>` : esc(s.country_tr)}`],
		['İzmir\'e uzaklık', s.distance_km_from_izmir ? esc(km(s.distance_km_from_izmir)) : ''],
		['Aylık hibe', esc(eur(s.grant.monthly_eur))],
		['Yol hibesi', esc(travel)],
		['Erasmus kodu', esc(s.erasmus_code || '')],
	];
	const about = [
		['Eğitim dili', esc(i.instruction || '')],
		['Dil şartı', esc(i.language_requirement || '')],
		['Ücret', esc(i.fees || '')],
		['Konaklama', esc(acc.info || '')],
		['Başvuru tarihleri', dl.info ? `${esc(dash(dl.info))}${dl.note ? ` <span class="yer-muted">${esc(dl.note)}</span>` : ''}` : ''],
		['Not', esc(i.programs_note || '')],
	];
	const rows = list => list.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('');
	const pageLinks = [
		ext(i.exchange_url, 'Okulun Erasmus sayfası'),
		ext(i.courses_url, 'Ders kataloğu'),
		ext(acc.url, 'Konaklama sayfası'),
		ext(dl.url, 'Başvuru sayfası'),
		ext((s.websites || [])[0], 'Okulun sitesi'),
	].filter(Boolean);
	const programs = s.programs.slice().sort((a, b) => trSort(a.field_tr, b.field_tr));
	const checked = T.longDate(i.checked);
	return `${head(site, `${s.name} Erasmus+`, `${s.city}, ${s.country_tr}. Yaşar Üniversitesi öğrencileri için bölümler, eğitim dili, hibe ve başvuru bilgisi.`)}
	<section class="yer-block yer-block--first" aria-labelledby="yer-ssr-s">
		<h2 class="yer-h1" id="yer-ssr-s">${esc(s.name)}: Yaşar Üniversitesi ile Erasmus+ anlaşması</h2>
		<dl class="yer-defs">${rows(facts)}</dl>
	</section>
	<section class="yer-block" aria-labelledby="yer-ssr-p">
		<h3 class="yer-h2" id="yer-ssr-p">Anlaşmalı bölümler</h3>
		<div class="yer-table__wrap"><table class="yer-table">
			<thead><tr><th scope="col">Yaşar bölümü</th><th scope="col">Okuldaki bölüm</th><th scope="col">Düzey</th></tr></thead>
			<tbody>${programs.map((p) => {
				const f = site.fieldById.get(p.field_id);
				return `<tr><th scope="row">${f ? `<a href="${esc(to.field(f))}">${esc(p.field_tr)}</a>` : esc(p.field_tr)}</th><td>${esc(p.host_field || '—')}</td><td>${esc(p.levels.length ? LEVEL_ORDER.filter(l => p.levels.includes(l)).map(lvl).join(', ') : 'Düzey yazmıyor')}</td></tr>`;
			}).join('')}</tbody>
		</table></div>
	</section>
	${rows(about) ? `<section class="yer-block" aria-labelledby="yer-ssr-a">
		<h3 class="yer-h2" id="yer-ssr-a">Okul hakkında</h3>
		<dl class="yer-defs">${rows(about)}</dl>
		${pageLinks.length ? `<p>${pageLinks.join(' · ')}</p>` : ''}
		${checked ? `<p class="yer-note">Okulun sayfasından, ${esc(checked)}.</p>` : ''}
	</section>` : ''}`;
}

function grantInner(site) {
	const g = site.g;
	const gr = g.grants;
	return `${head(site, 'Erasmus+ hibesi', 'Yaşar Üniversitesi Erasmus+ öğrencileri için aylık hibe, yol hibesi ve ek destek tutarları.')}
	<section class="yer-block yer-block--first" aria-labelledby="yer-ssr-g1">
		<h2 class="yer-h2" id="yer-ssr-g1">Aylık hibe</h2>
		<dl class="yer-defs">${gr.monthly_grant.map(m => `<div><dt>${esc(m.group)}: ${esc(eur(m.eur))} / ay</dt><dd>${m.countries.map(esc).join(', ')}</dd></div>`).join('')}</dl>
	</section>
	<section class="yer-block" aria-labelledby="yer-ssr-g2">
		<h2 class="yer-h2" id="yer-ssr-g2">Yol hibesi</h2>
		<p class="yer-note">Bir kez ödenir. Tutar İzmir–okul mesafesine göre.</p>
		<div class="yer-table__wrap"><table class="yer-table"><thead><tr><th scope="col">Mesafe</th><th scope="col" class="yer-num">Standart</th><th scope="col" class="yer-num">Yeşil seyahat</th></tr></thead>
		<tbody>${gr.travel_grant.map(b => `<tr><th scope="row">${esc(T.bandLabel(b))}</th><td class="yer-num">${esc(eur(b.standard_eur))}</td><td class="yer-num">${esc(eur(b.green_eur))}</td></tr>`).join('')}</tbody></table></div>
		<p class="yer-note">${esc(gr.green_travel_note)}</p>
	</section>
	<section class="yer-block" aria-labelledby="yer-ssr-g3">
		<h2 class="yer-h2" id="yer-ssr-g3">Bilmen gerekenler</h2>
		<dl class="yer-defs">
			<div><dt>İmkânı kısıtlı öğrenci</dt><dd>Belgeyle ayda +${esc(eur(gr.fewer_opportunities.monthly_eur))}.</dd></div>
			${g.rules.cards.payment.map(p => `<div><dt>${esc(p.title)}</dt><dd>${esc(p.text)}</dd></div>`).join('')}
		</dl>
		<p class="yer-note">${esc(T.termLabel(g.term.academic_year))} tutarları. Kaynak: Yaşar bilgilendirme sunumu, ${esc(T.longDate(gr.verified))}.</p>
	</section>`;
}

function roadInner(site) {
	const g = site.g;
	const c = g.calendar;
	const past = [
		['Dil sınavı başvurusu', c.language_exam_apply],
		['Dil sınavı', c.language_exam],
		['Başvuru', c.applications],
		['Yeni anlaşmalar için son gün', c.partnerships_cutoff],
	].filter(([, v]) => v);
	return `${head(site, 'Erasmus+ başvuru takvimi ve şartlar', 'Yaşar Üniversitesi Erasmus+ başvurusu: ilan, dil sınavı, TurnaPortal başvurusu ve şartlar.')}
	<section class="yer-block yer-block--first" aria-labelledby="yer-ssr-r1">
		<h2 class="yer-h2" id="yer-ssr-r1">Sıradaki adım: Ocak'taki ilan</h2>
		<p>${esc(c.next_call)} İlan çıkınca önce dil sınavına, sonra TurnaPortal'dan Erasmus'a başvurursun.</p>
	</section>
	<section class="yer-block" aria-labelledby="yer-ssr-r2">
		<h2 class="yer-h2" id="yer-ssr-r2">Geçen yılın takvimi</h2>
		<p class="yer-note">${esc(c.note)}</p>
		<ol class="yer-steps">${past.map(([label, when]) => `<li><span class="yer-steps__label">${esc(label)}</span> <span class="yer-steps__when yer-num">${esc(dash(when))}</span></li>`).join('')}</ol>
	</section>
	<section class="yer-block" aria-labelledby="yer-ssr-r3">
		<h2 class="yer-h2" id="yer-ssr-r3">Başvuru şartları</h2>
		<dl class="yer-defs">${g.rules.cards.apply.map(a => `<div><dt>${esc(a.title)}</dt><dd>${esc(a.text)}</dd></div>`).join('')}</dl>
	</section>`;
}

function faqInner(site) {
	const g = site.g;
	const groups = [...new Set(g.faq.map(f => f.group))];
	return `${head(site, 'Erasmus+ sık sorulanlar', 'Yaşar Üniversitesi Erasmus+ başvurusu, hibe, dersler ve denklik üzerine sık sorulan sorular.')}
	${groups.map((name, gi) => `<section class="yer-block${gi ? '' : ' yer-block--first'}" aria-labelledby="yer-ssr-q${gi}">
		<h2 class="yer-h2" id="yer-ssr-q${gi}">${esc(name)}</h2>
		<div class="yer-faq">${g.faq.filter(f => f.group === name).map(f => `<details class="yer-qa"><summary>${esc(f.q)}${icon('chevron-down')}</summary>
			<div class="yer-qa__a"><p>${esc(dash(f.a))}</p></div></details>`).join('')}</div>
	</section>`).join('')}`;
}

// ------------------------------------------------------------ sayfalar

// Bir sayfanın bütün parçaları. kind: main | field | country | school | guide.
// title: <title>'ın başı (sonuna forum adı eklenir). inner: uygulamanın yerinde, JavaScript gelince değişir.
// above: uygulamanın üstünde kalır. start: uygulamanın açılış seçimi (#'deki biçimle aynı).
function page(site, kind, item, base) {
	const to = paths(base, site);
	const g = site.g;
	const term = T.termLabel(g.term.academic_year);
	if (kind === 'field') {
		const f = item;
		const top = f.countries.map(c => c.name);
		return {
			path: to.field(f),
			title: plain(`Yaşar Erasmus+ ${f.tr} Okulları (${f.schools.length} okul)`),
			description: plain(`Yaşar Üniversitesi ${f.tr} öğrencileri için Erasmus+ anlaşmaları: ${f.countries.length} ülkede ${f.schools.length} okul (${listSentence(top, 4, 'ülke')}). Eğitim dili, dil şartı, hibe ve başvuru tarihleri.`),
			keywords: keywords([f.tr, `${f.tr} okulları`, `${f.tr} anlaşmalı okullar`], [`${f.en} Erasmus Yaşar University`]),
			crumb: f.tr,
			start: `okullar/${f.id}`,
			inner: fieldInner(site, f, base),
			above: '',
		};
	}
	if (kind === 'country') {
		const c = item;
		return {
			path: to.country(c),
			title: plain(`Yaşar Erasmus+ ${c.name} Okulları (${c.schools.length} okul)`),
			description: plain(`Yaşar Üniversitesi'nin ${c.name} Erasmus+ anlaşmalı okulları: ${listSentence(c.schools.map(s => s.name), 3, 'okul')}. Aylık ${eur(c.grant)} hibe, bölümler, eğitim dili ve başvuru tarihleri.`),
			keywords: keywords([c.name, `${c.name} okulları`, `${c.name} hibe`]),
			crumb: c.name,
			start: '',
			inner: '',
			above: countryLanding(site, c, base),
		};
	}
	if (kind === 'school') {
		const s = item;
		const fieldNames = [...new Set(s.programs.map(p => p.field_tr))].sort(trSort);
		const lang = s.info && s.info.instruction ? ` Eğitim dili: ${s.info.instruction}` : '';
		return {
			path: to.school(s),
			title: plain(`${s.name} – Yaşar Erasmus+`),
			description: plain(`${s.name} (${s.city}, ${s.country_tr}) ile Yaşar Üniversitesi Erasmus+ anlaşması: ${listSentence(fieldNames, 3, 'bölüm')}.${lang} Aylık ${eur(s.grant.monthly_eur)} hibe.`).slice(0, 300),
			keywords: keywords([s.name, s.country_tr, s.city], [`${s.name} Erasmus`, `${s.name} exchange`]),
			crumb: s.name,
			start: `okul/${s.id}`,
			inner: schoolInner(site, s, base),
			above: '',
		};
	}
	if (kind === 'guide') {
		const id = item;
		const guide = {
			hibe: {
				title: `Yaşar Erasmus+ Hibesi ${term}: Aylık Hibe ve Yol Hibesi`,
				description: `Yaşar Üniversitesi Erasmus+ hibesi: ülke grubuna göre aylık ${listSentence(g.grants.monthly_grant.map(m => eur(m.eur)), 3, 'tutar')}, mesafeye göre yol hibesi, yeşil seyahat ve imkânı kısıtlı öğrenci desteği.`,
				keywords: keywords(['hibe', 'hibesi', 'hibe miktarı', 'aylık hibe', 'yol hibesi']),
				inner: grantInner(site),
			},
			'yol-haritasi': {
				title: 'Yaşar Erasmus+ Başvuru Takvimi ve Şartları',
				description: `Yaşar Üniversitesi Erasmus+ başvurusu: ilan genelde Ocak'ta, dil sınavı, TurnaPortal başvurusu, not ortalaması ve dil şartı. Geçen yılın takvimi: ${g.calendar.applications}.`,
				keywords: keywords(['başvuru', 'başvuru tarihleri', 'başvuru şartları', 'dil sınavı', 'takvim', 'ilan']),
				inner: roadInner(site),
			},
			'sik-sorulanlar': {
				title: 'Yaşar Erasmus+ Sık Sorulan Sorular: Başvuru, Hibe, Denklik',
				description: `Yaşar Üniversitesi Erasmus+ hakkında ${g.faq.length} soru ve cevap: kimler başvurabilir, ortalama kaç olmalı, hibe ne zaman yatar, dersler nasıl sayılır.`,
				keywords: keywords(['sık sorulan sorular', 'sss', 'ortalama', 'denklik', 'learning agreement']),
				inner: faqInner(site),
			},
		}[id];
		return {
			path: to.guide(id),
			title: plain(guide.title),
			description: plain(guide.description),
			keywords: guide.keywords,
			crumb: GUIDES[id].label,
			start: GUIDES[id].start,
			inner: guide.inner,
			above: '',
		};
	}
	return {
		path: base,
		title: 'Yaşar Erasmus+ Rehberi: Anlaşmalı Okullar, Hibe ve Başvuru',
		description: plain(`Yaşar Üniversitesi Erasmus+ rehberi: ${site.countries.length} ülkede ${site.schools.length} anlaşmalı okul. Bölümüne göre okul bul, aylık ve yol hibesini hesapla, başvuru takvimi ve sık sorulanlar.`),
		keywords: keywords(['', 'okulları', 'anlaşmalı okullar', 'başvuru', 'hibe', 'ülkeler'], ['Yaşar University Erasmus', 'Yasar University Erasmus exchange']),
		crumb: '',
		start: '',
		inner: mainInner(site, base),
		above: '',
	};
}

// Forumun sitemap.xml'i için bütün adresler; bölüm ve rehber sayfaları biraz önde.
function sitemapEntries(site, base) {
	const to = paths(base, site);
	return [
		{ url: to.main, priority: 0.8 },
		...Object.keys(GUIDES).map(id => ({ url: to.guide(id), priority: 0.6 })),
		...site.fields.map(f => ({ url: to.field(f), priority: 0.6 })),
		...site.countries.map(c => ({ url: to.country(c), priority: 0.5 })),
		...site.schools.map(s => ({ url: to.school(s), priority: 0.4 })),
	].map(x => Object.assign({ changefreq: 'weekly' }, x));
}

module.exports = { GUIDES, slugify, buildSite, page, indexHtml, sitemapEntries };
