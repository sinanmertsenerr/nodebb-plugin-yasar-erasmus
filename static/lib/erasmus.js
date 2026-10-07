'use strict';

// Yaşar Erasmus+ sayfasının tarayıcı tarafı. Sunucudan gelen veriyi (okullar,
// genel bilgiler, harita) alır ve dört görünüm çizer: okul bulma akışı (bölüm →
// ülke → okul), yol haritası, hibe, sık sorulanlar. Adres çubuğundaki # parçası
// görünümü seçer, böylece bir okulun bağlantısı foruma yapıştırılabilir.

(function (factory) {
	if (typeof define === 'function' && define.amd) {
		define('forum/yasar-erasmus', ['yasar-erasmus/text', 'yasar-erasmus/projection'], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory(require('./text'), require('./projection'));
	}
}(function (T, P) {
	const { esc, nf, eur, km, lvl } = T;

	const LEVEL_ORDER = ['Önlisans', 'Lisans', 'Yüksek Lisans', 'Doktora'];
	const TABS = [['okullar', 'Okul bul'], ['yol-haritasi', 'Yol haritası'], ['hibe', 'Hibe'], ['sss', 'Sık sorulanlar']];
	const BIG_LIST = 12;
	const FALLBACK_LABEL = {
		'erasmus-sayfası': 'Okulun Erasmus sayfası',
		'konaklama-sayfası': 'Okulun konaklama sayfası',
		'katalog-sayfası': 'Okulun ders kataloğu',
		'okul-ana-sayfa': 'Okulun sitesi',
		'yasar-koordinator': 'Yaşar bölüm koordinatörleri',
	};

	const icon = (name, cls) => `<svg class="yer-i${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#yer-i-${name}"/></svg>`;
	const dash = text => String(text).replace(/\s-\s/g, ' – ');
	const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const safeUrl = url => (/^(https?:|mailto:)/.test(url) ? url : '#');
	// "500 ila 1999 KM arasında" -> "500–1.999 km"
	const bandText = (band) => {
		const m = String(band).match(/^(\d+) ila (\d+) KM/);
		return m ? `${nf.format(+m[1])}\u2013${nf.format(+m[2])} km` : String(band).replace(/ KM/g, ' km');
	};
	const slug = text => T.fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

	function ext(url, label) {
		return `<a class="yer-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}${icon('arrow-up-right-from-square', 'yer-i--ext')}</a>`;
	}

	function errorPanel() {
		return `<div class="yer"><div class="yer-state" role="alert">
			${icon('triangle-exclamation')}
			<h2 class="yer-state__title">Erasmus verisi yüklenemedi</h2>
			<p>Okul listesi sunucudan alınamadı. Bağlantını kontrol edip yeniden dene.</p>
			<button type="button" class="yer-btn yer-btn--primary" data-reload>Yeniden dene</button>
		</div></div>`;
	}

	function mount(root, data) {
		if (!data || !Array.isArray(data.schools) || !data.general) {
			root.innerHTML = errorPanel();
			root.addEventListener('click', (e) => {
				if (e.target.closest('[data-reload]')) {
					window.location.reload();
				}
			});
			return;
		}

		const { general: g, map } = data;
		const project = P.createProjection(map.projection);
		const schools = data.schools.map(s => Object.assign({}, s, { programs: s.programs.filter(p => !p.staff_only) }))
			.filter(s => s.programs.length);
		const byId = new Map(schools.map(s => [s.id, s]));
		const landPaths = map.countries.map(c => `<path d="${c.d}"/>`).join('');
		const countryNames = [...new Set(schools.map(s => s.country_tr))];
		const countryBySlug = new Map(countryNames.map(c => [slug(c), c]));
		const fields = g.fields.map((f) => {
			const list = schools.filter(s => s.programs.some(p => p.field_id === f.id));
			return { id: f.id, tr: f.tr, schools: list.length, countries: new Set(list.map(s => s.country_tr)).size };
		}).filter(f => f.schools);
		const fieldById = new Map(fields.map(f => [f.id, f]));

		const state = {
			view: 'okullar',
			field: null,
			country: null,
			schoolId: null,
			months: 5,
			green: false,
			q: '',
			faqQ: '',
		};
		let motion = 0;
		let lastDepth = 0;

		// ------------------------------------------------------------ veri

		const inField = s => s.programs.some(p => p.field_id === state.field);
		const fieldSchools = () => schools.filter(inField);
		const countrySchools = () => fieldSchools().filter(s => s.country_tr === state.country);
		const depth = () => (state.schoolId ? 3 : state.country ? 2 : state.field ? 1 : 0);

		function levelsOf(s) {
			const set = new Set();
			s.programs.filter(p => p.field_id === state.field).forEach(p => p.levels.forEach(l => set.add(l)));
			return LEVEL_ORDER.filter(l => set.has(l));
		}

		function parseHash() {
			const parts = decodeURIComponent(window.location.hash.replace(/^#/, '')).split('/');
			const head = parts[0];
			if (head === 'okul' && byId.has(parts[1])) {
				const s = byId.get(parts[1]);
				const keep = state.field && s.programs.some(p => p.field_id === state.field);
				return { view: 'okullar', field: keep ? state.field : s.programs[0].field_id, country: s.country_tr, schoolId: s.id };
			}
			if (head === 'okullar') {
				const field = fieldById.has(parts[1]) ? parts[1] : null;
				const country = field && countryBySlug.has(parts[2]) ? countryBySlug.get(parts[2]) : null;
				return { view: 'okullar', field, country, schoolId: null };
			}
			return { view: TABS.some(t => t[0] === head) ? head : 'okullar', field: null, country: null, schoolId: null };
		}

		// ------------------------------------------------------------ çerçeve

		function head() {
			const date = T.longDate(g.generated_at);
			return `<header class="yer-head">
				<div>
					<h1 class="yer-title">Erasmus+ ile bir dönem yurt dışı</h1>
					<p class="yer-lede">Yaşar öğrencileri için anlaşmalı okullar ve hibe.</p>
					<p class="yer-meta">${esc(T.termLabel(g.term.academic_year))} · ${nf.format(schools.length)} okul · ${nf.format(countryNames.length)} ülke${date ? ` · ${esc(date)}` : ''}</p>
				</div>
				<aside class="yer-status" aria-label="Sıradaki ilan">
					<strong>Sıradaki ilan: Ocak</strong>
					<span>${esc(g.calendar.next_call)}</span>
				</aside>
			</header>`;
		}

		function tabs() {
			return `<nav class="yer-tabs" aria-label="Erasmus bölümleri">${TABS.map(([id, label]) =>
				`<a class="yer-tab" href="#${id}"${state.view === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
		}

		function foot() {
			return `<footer class="yer-foot">
				<p>${esc(g.rules.disclaimer)}</p>
				<p>Kaynak: ${ext(g.sources.partners, 'erasmus.yasar.edu.tr')}</p>
			</footer>`;
		}

		// ------------------------------------------------------------ bilet

		function ticketShell() {
			return `<section class="yer-ticket" aria-label="Seçimlerin" style="--p:0">
				<div class="yer-ticket__main">
					<div class="yer-ticket__route" aria-hidden="true">
						<span class="yer-ticket__end">İzmir</span>
						<span class="yer-ticket__line"><span class="yer-ticket__plane"><svg class="yer-plane" viewBox="0 0 24 24" focusable="false"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg></span></span>
						<span class="yer-ticket__end yer-ticket__end--to" data-to></span>
					</div>
					<ol class="yer-slots" data-slots></ol>
				</div>
				<div class="yer-ticket__stub" data-stub></div>
			</section>`;
		}

		function ticketModel() {
			const s = state.schoolId ? byId.get(state.schoolId) : null;
			const f = state.field ? fieldById.get(state.field) : null;
			const monthly = state.country ? (countrySchools()[0] || {}).grant : null;
			return {
				s,
				slots: [
					{ label: 'Bölüm', value: f ? f.tr : '', href: '#okullar', done: Boolean(f) },
					{ label: 'Ülke', value: state.country || '', href: f ? `#okullar/${f.id}` : '', done: Boolean(state.country) },
					{ label: 'Okul', value: s ? s.name : '', href: state.country ? `#okullar/${state.field}/${slug(state.country)}` : '', done: Boolean(s) },
				],
				to: s ? s.city : (state.country || ''),
				progress: depth() / 3,
				monthly: monthly ? monthly.monthly_eur : null,
				km: s ? s.distance_km_from_izmir : null,
			};
		}

		let prevSlots = ['', '', ''];

		// Uçak her adımda, o adımın sütununu ayıran çizginin tam üstünde durur:
		// kalkış, Bölüm|Ülke çizgisi, Ülke|Okul çizgisi, varış. Sütunlar alt alta
		// dizildiyse (dar ekran) yol üçe bölünür.
		function placePlane(t) {
			const d = depth();
			const line = t.querySelector('.yer-ticket__line').getBoundingClientRect();
			const slots = [...t.querySelectorAll('.yer-slot')].map(el => el.getBoundingClientRect());
			const span = line.width - 8;
			let p = d / 3;
			if (span > 0 && slots.length === 3 && Math.abs(slots[0].top - slots[1].top) < 2 && d > 0 && d < 3) {
				p = (slots[d].left - (line.left + 4)) / span;
			}
			t.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(4));
			t.classList.toggle('is-arrived', d === 3);
		}

		function fillTicket(first) {
			const t = root.querySelector('.yer-ticket');
			if (!t) {
				return;
			}
			const m = ticketModel();
			const current = m.slots.findIndex(x => !x.done);
			t.querySelector('[data-to]').textContent = m.to || 'Varış';
			t.querySelector('[data-slots]').innerHTML = m.slots.map((x, i) => {
				const fresh = !first && x.done && prevSlots[i] !== x.value;
				const here = i === current;
				const state_ = x.done ? 'is-done' : here ? 'is-current' : 'is-todo';
				const link = x.done && x.href && !(i === 2);
				const inner = `<span class="yer-slot__label">${x.label}${link ? '<span class="yer-slot__edit">Değiştir</span>' : ''}</span><strong class="yer-slot__value${fresh ? ' is-new' : ''}">${x.done ? esc(x.value) : (here ? 'Seçiyorsun' : 'Seçilmedi')}</strong>`;
				return `<li class="yer-slot ${state_}">${link ? `<a href="${esc(x.href)}" aria-label="${x.label}: ${esc(x.value)}. Değiştir">${inner}</a>` : `<span${here ? ' aria-current="step"' : ''}>${inner}</span>`}</li>`;
			}).join('');
			prevSlots = m.slots.map(x => x.value);
			t.querySelector('[data-stub]').innerHTML = `<div><span class="yer-slot__label">Aylık hibe</span><strong class="yer-num${m.monthly ? '' : ' is-empty'}">${m.monthly ? eur(m.monthly) : '–'}</strong></div>
				<div><span class="yer-slot__label">Mesafe</span><strong class="yer-num${m.km ? '' : ' is-empty'}" data-km-stub>${m.km ? km(m.km) : '–'}</strong></div>`;
			// İlk çizimde uçak kalkıştan başlar; sonraki adımlarda bulunduğu yerden devam eder.
			if (first && m.progress > 0 && !reducedMotion()) {
				t.style.setProperty('--p', '0');
				requestAnimationFrame(() => requestAnimationFrame(() => placePlane(t)));
			} else {
				placePlane(t);
			}
		}

		// ------------------------------------------------------------ adımlar

		function backLink() {
			const d = depth();
			const href = d === 1 ? '#okullar' : d === 2 ? `#okullar/${state.field}` : `#okullar/${state.field}/${slug(state.country)}`;
			const label = d === 1 ? 'Bölümler' : d === 2 ? 'Ülkeler' : 'Okullar';
			return `<a class="yer-backlink" href="${esc(href)}">${icon('arrow-left')}${label}</a>`;
		}

		function stepFields() {
			return `<section class="yer-step" aria-labelledby="yer-step-t">
				<h2 class="yer-h2" id="yer-step-t" tabindex="-1" data-focus>Bölümünü seç</h2>
				<div class="yer-cards yer-cards--3">${fields.map((f, i) => `<a class="yer-card" href="#okullar/${esc(f.id)}" style="--i:${i}">
					<strong class="yer-card__name">${esc(f.tr)}</strong><span class="yer-count" aria-label="${nf.format(f.schools)} anlaşmalı okul">${nf.format(f.schools)}</span>${icon('chevron-right')}</a>`).join('')}</div>
			</section>`;
		}

		function stepCountries() {
			const counts = new Map();
			fieldSchools().forEach(s => counts.set(s.country_tr, (counts.get(s.country_tr) || []).concat(s)));
			const list = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'tr'));
			return `<section class="yer-step" aria-labelledby="yer-step-t">
				${backLink()}
				<h2 class="yer-h2" id="yer-step-t" tabindex="-1" data-focus>Hangi ülke?</h2>
				<div class="yer-cards yer-cards--4">${list.map(([c, items], i) => `<a class="yer-card" href="#okullar/${esc(state.field)}/${esc(slug(c))}" style="--i:${i}">
					<span><strong class="yer-card__name">${esc(c)}</strong><span class="yer-card__meta">${nf.format(items.length)} okul · ${eur(items[0].grant.monthly_eur)}/ay</span></span>${icon('chevron-right')}</a>`).join('')}</div>
			</section>`;
		}

		function schoolRows() {
			const q = T.fold(state.q.trim());
			const list = countrySchools().filter(s => !q || T.fold(`${s.name} ${s.city}`).includes(q))
				.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
			if (!list.length) {
				return `<div class="yer-state yer-state--empty"><h3 class="yer-state__title">“${esc(state.q)}” için okul yok</h3>
					<button type="button" class="yer-btn yer-btn--outline" data-clear-q>${icon('rotate-left')}Aramayı temizle</button></div>`;
			}
			return `<div class="yer-list">${list.map((s, i) => `<a class="yer-pick" href="#okul/${esc(s.id)}" style="--i:${Math.min(i, 14)}">
				<span><strong class="yer-pick__name">${esc(s.name)}</strong><span class="yer-pick__city">${esc(s.city)}</span></span>
				<span class="yer-pick__km yer-num">${s.distance_km_from_izmir ? km(s.distance_km_from_izmir) : ''}</span>${icon('chevron-right')}</a>`).join('')}</div>`;
		}

		function stepSchools() {
			const many = countrySchools().length > BIG_LIST;
			return `<section class="yer-step" aria-labelledby="yer-step-t">
				${backLink()}
				<div class="yer-step__head">
					<h2 class="yer-h2" id="yer-step-t" tabindex="-1" data-focus>Okulunu seç</h2>
					${many ? `<label class="yer-input">${icon('magnifying-glass')}<span class="yer-sr">Okul veya şehir ara</span><input type="search" data-q value="${esc(state.q)}" placeholder="Okul veya şehir ara" autocomplete="off" spellcheck="false"></label>` : ''}
				</div>
				<div data-rows>${schoolRows()}</div>
			</section>`;
		}

		// ------------------------------------------------------------ okul sayfası

		function routeMap(s) {
			if (!s.coords) {
				return '<div class="yer-route yer-route--none"><p>Bu okulun konumu listede yok, rota çizilemedi.</p></div>';
			}
			const home = map.izmir;
			const dest = project([s.coords[1], s.coords[0]]);
			const aspect = 2.1;
			const pad = 1.55;
			let w = Math.max(Math.abs(dest[0] - home[0]) * pad + 120, (Math.abs(dest[1] - home[1]) * pad + 90) * aspect, 260);
			w = Math.min(w, map.w);
			const h = w / aspect;
			const mx = (home[0] + dest[0]) / 2;
			const my = (home[1] + dest[1]) / 2;
			const x = Math.max(0, Math.min(map.w - w, mx - w / 2));
			const y = Math.max(0, Math.min(map.h - h, my - h / 2));
			const dx = dest[0] - home[0];
			const dy = dest[1] - home[1];
			const len = Math.hypot(dx, dy) || 1;
			let nx = -dy / len;
			let ny = dx / len;
			if (ny > 0) {
				nx = -nx;
				ny = -ny;
			}
			const cx = mx + nx * len * 0.3;
			const cy = my + ny * len * 0.3;
			const r = w * 0.0085;
			const fs = w * 0.026;
			const side = dest[0] >= home[0] ? 1 : -1;
			const label = (px, py, text, sd) => `<text class="yer-route__label" x="${(px + sd * r * 2).toFixed(1)}" y="${(py + fs * 0.35).toFixed(1)}" text-anchor="${sd > 0 ? 'start' : 'end'}" font-size="${fs.toFixed(1)}">${esc(text)}</text>`;
			const arc = `M${home[0]},${home[1]} Q${cx.toFixed(1)},${cy.toFixed(1)} ${dest[0].toFixed(1)},${dest[1].toFixed(1)}`;
			return `<figure class="yer-route">
				<svg viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Rota haritası: İzmir ile ${esc(s.city)} arası ${nf.format(s.distance_km_from_izmir)} km">
					<rect class="yer-route__sea" x="0" y="0" width="${map.w}" height="${map.h}"/>
					<g class="yer-route__land">${landPaths}</g>
					<path class="yer-route__trail" d="${arc}" stroke-width="${(r * 0.7).toFixed(2)}"/>
					<path class="yer-route__arc" d="${arc}" pathLength="1" stroke-width="${(r * 0.9).toFixed(2)}" data-arc/>
					<circle class="yer-route__pin yer-route__pin--home" cx="${home[0]}" cy="${home[1]}" r="${r.toFixed(2)}"/>
					<circle class="yer-route__pin" cx="${dest[0].toFixed(1)}" cy="${dest[1].toFixed(1)}" r="${r.toFixed(2)}"/>
					<circle class="yer-route__dot" r="${(r * 0.9).toFixed(2)}" cx="${home[0]}" cy="${home[1]}" data-dot/>
					${label(home[0], home[1], 'İzmir', -1)}
					${label(dest[0], dest[1], s.city, side)}
				</svg>
			</figure>`;
		}

		function animateRoute(s) {
			const svg = root.querySelector('.yer-route svg');
			const arc = svg && svg.querySelector('[data-arc]');
			if (!arc) {
				return;
			}
			const dot = svg.querySelector('[data-dot]');
			const out = root.querySelector('[data-km-stub]');
			const total = s.distance_km_from_izmir;
			const length = arc.getTotalLength();
			const place = (t) => {
				const p = arc.getPointAtLength(length * t);
				dot.setAttribute('cx', p.x);
				dot.setAttribute('cy', p.y);
			};
			if (reducedMotion()) {
				arc.style.strokeDashoffset = '0';
				place(1);
				return;
			}
			const token = ++motion;
			const t0 = performance.now();
			arc.style.strokeDashoffset = '1';
			const frame = (now) => {
				if (token !== motion || !arc.isConnected) {
					return;
				}
				const k = Math.min(1, (now - t0) / 1100);
				const e = 1 - Math.pow(1 - k, 3);
				arc.style.strokeDashoffset = String(1 - e);
				place(e);
				if (out) {
					out.textContent = km(Math.round(total * e));
				}
				if (k < 1) {
					requestAnimationFrame(frame);
				}
			};
			requestAnimationFrame(frame);
		}

		function calcFor(s) {
			const tg = s.travel_grant;
			const green = Boolean(tg && state.green && tg.green_eur);
			const monthly = s.grant.monthly_eur;
			const travel = tg ? (green ? tg.green_eur : tg.standard_eur) : 0;
			return { monthly, travel, months: state.months, total: monthly * state.months + travel, tg, green };
		}

		function calcHtml(s) {
			const c = calcFor(s);
			const canGreen = c.tg && c.tg.green_eur !== c.tg.standard_eur;
			return `<div class="yer-calc__row">
					<span class="yer-calc__label" id="yer-months-l">Kalacağın süre</span>
					<div class="yer-stepper" role="group" aria-labelledby="yer-months-l">
						<button type="button" data-months="-1" aria-label="Bir ay azalt"${c.months <= 3 ? ' disabled' : ''}>${icon('minus')}</button>
						<output class="yer-num" aria-live="polite">${c.months} ay</output>
						<button type="button" data-months="1" aria-label="Bir ay artır"${c.months >= 6 ? ' disabled' : ''}>${icon('plus')}</button>
					</div>
				</div>
				${canGreen ? `<label class="yer-switch"><input type="checkbox" data-green${c.green ? ' checked' : ''}><span class="yer-switch__box" aria-hidden="true"></span><span>Yeşil seyahat <span class="yer-muted">(tren, otobüs)</span></span></label>` : ''}
				<dl class="yer-calc__lines">
					<div><dt>Aylık hibe</dt><dd class="yer-num">${eur(c.monthly)} × ${c.months}</dd></div>
					<div><dt>Yol hibesi${c.tg ? ` <span class="yer-muted">${esc(bandText(c.tg.band))}</span>` : ''}</dt><dd class="yer-num">${c.tg ? eur(c.travel) : '–'}</dd></div>
				</dl>
				<p class="yer-calc__total"><span>Toplam</span><strong class="yer-num" data-total="${c.total}">${eur(c.total)}</strong></p>`;
		}

		function updateCalc(s) {
			const box = root.querySelector('[data-calc]');
			if (!box) {
				return;
			}
			const current = box.querySelector('[data-total]');
			const before = current ? Number(current.dataset.total) : 0;
			const focused = document.activeElement && document.activeElement.getAttribute('data-months');
			box.innerHTML = calcHtml(s);
			if (focused) {
				const next = box.querySelector(`[data-months="${focused}"]:not([disabled])`) || box.querySelector('[data-months]:not([disabled])');
				if (next) {
					next.focus();
				}
			}
			const out = box.querySelector('[data-total]');
			const to = Number(out.dataset.total);
			if (reducedMotion() || before === to) {
				return;
			}
			const token = ++motion;
			const t0 = performance.now();
			const frame = (now) => {
				if (token !== motion || !out.isConnected) {
					return;
				}
				const k = Math.min(1, (now - t0) / 320);
				out.textContent = eur(Math.round(before + (to - before) * (1 - Math.pow(1 - k, 3))));
				if (k < 1) {
					requestAnimationFrame(frame);
				}
			};
			requestAnimationFrame(frame);
		}

		function infoRows(s) {
			const i = s.info;
			const acc = i.accommodation || {};
			const dl = i.deadlines || {};
			const lv = levelsOf(s);
			const prog = s.programs.find(p => p.field_id === state.field);
			const found = [
				['Anlaşma', `${lv.length ? lv.map(l => esc(lvl(l))).join(' · ') : 'Düzey yazmıyor'}${prog ? `<span class="yer-muted"> · okulda: ${esc(prog.host_field)}</span>` : ''}`],
				['Eğitim dili', i.instruction ? esc(i.instruction) : ''],
				['Dil şartı', i.language_requirement ? esc(i.language_requirement) : ''],
				['Ücret', i.fees ? esc(i.fees) : ''],
				['Ders kataloğu', i.courses_url ? ext(i.courses_url, 'Kataloğu aç') : ''],
				['Konaklama', (acc.info ? `<p>${esc(acc.info)}</p>` : '') + (acc.url ? `<p>${ext(acc.url, 'Konaklama sayfası')}</p>` : '')],
				['Başvuru tarihleri', (dl.info ? `<p>${esc(dl.info)}</p>` : '') + (dl.note ? `<p class="yer-muted">${esc(dl.note)}</p>` : '') + (dl.url ? `<p>${ext(dl.url, 'Başvuru sayfası')}</p>` : '')],
			];
			const missing = found.filter(([, html]) => !html).map(([label]) => label.toLocaleLowerCase('tr'));
			const rows = found.filter(([, html]) => html).map(([label, html]) => `<div class="yer-info__row"><dt>${label}</dt><dd>${html}</dd></div>`).join('');
			const fb = i.fallback_url ? ext(i.fallback_url, FALLBACK_LABEL[i.fallback_kind] || 'Okulun sayfası') : '';
			const checked = T.longDate(i.checked);
			return `<dl class="yer-info">${rows}</dl>
				<div class="yer-info__foot">
					${missing.length ? `<p class="yer-info__more">Bizde yok: ${esc(missing.join(', '))}. ${fb}</p>` : ''}
					<p class="yer-info__src">${checked ? `Okulun sayfasından, ${esc(checked)}.` : ''}</p>
				</div>`;
		}

		function stepSchool(s) {
			const quota = g.guidance.find(x => x.id === 'quota');
			return `<section class="yer-step yer-step--school" aria-labelledby="yer-step-t">
				${backLink()}
				<h2 class="yer-h1" id="yer-step-t" tabindex="-1" data-focus>${esc(s.name)}</h2>
				<div class="yer-split">
					${routeMap(s)}
					<aside class="yer-calc" aria-labelledby="yer-calc-t">
						<h3 class="yer-h3" id="yer-calc-t">Tahmini hibe</h3>
						<div data-calc>${calcHtml(s)}</div>
						<p class="yer-calc__note">Tek dönem, ${esc(T.termLabel(g.term.academic_year))} tutarları.</p>
					</aside>
				</div>
				<section class="yer-block" aria-labelledby="yer-info-t">
					<h3 class="yer-h2" id="yer-info-t">Okul hakkında</h3>
					${infoRows(s)}
				</section>
				<section class="yer-block yer-topics" aria-labelledby="yer-topics-t" data-topics="${esc(s.id)}">
					<div class="yer-topics__head">
						<h3 class="yer-h2" id="yer-topics-t">Bu okul hakkında daha fazla paylaşım</h3>
						<div class="yer-topics__actions">
							<button type="button" class="yer-btn yer-btn--primary" data-new-topic>Konu aç</button>
							<a class="yer-btn yer-btn--outline" href="${esc(`${env.rel}/category/${env.cid}`)}" data-topics-all>Konular</a>
						</div>
					</div>
					<div data-topics-list></div>
				</section>
				${quota ? `<div class="yer-quota"><span>Okul bazında kontenjan yayımlanmıyor.</span><span class="yer-quota__links">${quota.links.map(l => ext(l.url, l.label)).join('')}</span></div>` : ''}
			</section>`;
		}

		function okullarView() {
			const d = depth();
			const body = d === 3 ? stepSchool(byId.get(state.schoolId)) : [stepFields, stepCountries, stepSchools][d]();
			return `${ticketShell()}<div class="yer-stage" data-stage>${body}</div>`;
		}

		// ------------------------------------------------------------ yol haritası

		function roadView() {
			const c = g.calendar;
			const past = [
				['Dil sınavı başvurusu', c.language_exam_apply],
				['Dil sınavı', c.language_exam],
				['Başvuru', c.applications],
				['Yeni anlaşmalar için son gün', c.partnerships_cutoff],
			].filter(([, v]) => v);
			const apply = g.rules.cards.apply;
			const dl = g.guidance.find(x => x.id === 'deadlines');
			return `<section class="yer-next" aria-labelledby="yer-next-t">
					<h2 class="yer-h2" id="yer-next-t" tabindex="-1" data-focus>Sıradaki adım: Ocak'taki ilan</h2>
					<p>İlan çıkınca önce dil sınavına, sonra TurnaPortal'dan Erasmus'a başvurursun.</p>
					${ext(g.links.apply, 'Başvuru sayfası')}
				</section>
				<section class="yer-block" aria-labelledby="yer-cal-t">
					<h2 class="yer-h2" id="yer-cal-t">Geçen yılın takvimi</h2>
					<p class="yer-note">${esc(c.note)}</p>
					<ol class="yer-steps">${past.map(([label, when]) => `<li><span class="yer-steps__label">${esc(label)}</span><span class="yer-steps__when yer-num">${esc(dash(when))}</span></li>`).join('')}</ol>
				</section>
				<section class="yer-block" aria-labelledby="yer-req-t">
					<h2 class="yer-h2" id="yer-req-t">Başvuru şartları</h2>
					<dl class="yer-defs">${apply.map(a => `<div><dt>${esc(a.title)}</dt><dd>${esc(a.text)}</dd></div>`).join('')}</dl>
				</section>
				${dl ? `<section class="yer-block" aria-labelledby="yer-dl-t">
					<h2 class="yer-h2" id="yer-dl-t">Seçilirsen</h2>
					<p>${esc(dl.text)}</p>
				</section>` : ''}`;
		}

		// ------------------------------------------------------------ hibe

		function grantView() {
			const gr = g.grants;
			const pay = g.rules.cards.payment;
			return `<section class="yer-block yer-block--first" aria-labelledby="yer-g1">
					<h2 class="yer-h2" id="yer-g1" tabindex="-1" data-focus>Aylık hibe</h2>
					<div class="yer-rates">${gr.monthly_grant.map(m => `<div class="yer-rate">
						<p class="yer-rate__sum"><strong class="yer-num">${eur(m.eur)}</strong><span>/ Ay</span></p>
						<p class="yer-rate__group">${esc(m.group.replace(/Grup Ülkeler$/, 'grup ülkeler'))}</p>
						<p class="yer-rate__list">${m.countries.map(esc).join(', ')}</p>
					</div>`).join('')}</div>
				</section>
				<section class="yer-block" aria-labelledby="yer-g2">
					<h2 class="yer-h2" id="yer-g2">Yol hibesi</h2>
					<p class="yer-note">Bir kez ödenir. Tutar İzmir–okul mesafesine göre.</p>
					<table class="yer-table"><thead><tr><th scope="col">Mesafe</th><th scope="col" class="yer-num">Standart</th><th scope="col" class="yer-num">Yeşil seyahat</th></tr></thead>
					<tbody>${gr.travel_grant.map(b => `<tr><th scope="row">${esc(T.bandLabel(b))}</th><td class="yer-num">${eur(b.standard_eur)}</td><td class="yer-num">${eur(b.green_eur)}</td></tr>`).join('')}</tbody></table>
					<p class="yer-note">${esc(gr.green_travel_note)}</p>
				</section>
				<section class="yer-block" aria-labelledby="yer-g3">
					<h2 class="yer-h2" id="yer-g3">Ek destek</h2>
					<dl class="yer-defs">
						<div><dt>İmkânı kısıtlı öğrenci</dt><dd>Belgeyle ayda +${eur(gr.fewer_opportunities.monthly_eur)}.</dd></div>
						<div><dt>Engel ya da sağlık sorunu</dt><dd>Ek destek var, ofise sor.</dd></div>
					</dl>
				</section>
				<section class="yer-block" aria-labelledby="yer-g4">
					<h2 class="yer-h2" id="yer-g4">Bilmen gerekenler</h2>
					<dl class="yer-defs">${pay.map(p => `<div><dt>${esc(p.title)}</dt><dd>${esc(p.text)}</dd></div>`).join('')}</dl>
					<p class="yer-note">${esc(T.termLabel(g.term.academic_year))} tutarları. Kaynak: Yaşar bilgilendirme sunumu, ${esc(T.longDate(gr.verified))}.</p>
				</section>`;
		}

		// ------------------------------------------------------------ sık sorulanlar

		function faqBody() {
			const q = T.fold(state.faqQ.trim());
			const list = g.faq.filter(f => !q || T.fold(`${f.q} ${f.a}`).includes(q));
			if (!list.length) {
				return `<div class="yer-state yer-state--empty"><h3 class="yer-state__title">“${esc(state.faqQ)}” için cevap yok</h3>
					<p>Başka bir sözcükle dene ya da ofise yaz: ${ext('mailto:erasmus@yasar.edu.tr', 'erasmus@yasar.edu.tr')}</p></div>`;
			}
			const groups = [...new Set(list.map(f => f.group))];
			let first = !q;
			return groups.map((name, gi) => `<section class="yer-block${gi ? '' : ' yer-block--first'}" aria-labelledby="yer-faq-${gi}">
				<h2 class="yer-h2" id="yer-faq-${gi}">${esc(name)}</h2>
				<div class="yer-faq">${list.filter(f => f.group === name).map((f) => {
					const open = first || Boolean(q);
					first = false;
					return `<details class="yer-qa"${open ? ' open' : ''}><summary>${esc(f.q)}${icon('chevron-down')}</summary>
						<div class="yer-qa__a"><p>${esc(dash(f.a))}</p>${f.sources && f.sources.length ? `<p class="yer-qa__src">Kaynak: ${f.sources.map(esc).join(' · ')}</p>` : ''}</div></details>`;
				}).join('')}</div>
			</section>`).join('');
		}

		function faqView() {
			return `<div class="yer-step__head">
					<h2 class="yer-h2" tabindex="-1" data-focus>Sık sorulanlar</h2>
					<label class="yer-input">${icon('magnifying-glass')}<span class="yer-sr">Sorularda ara</span><input type="search" data-faq-q value="${esc(state.faqQ)}" placeholder="Sorularda ara, ör. hibe" autocomplete="off" spellcheck="false"></label>
				</div>
				<div data-faq>${faqBody()}</div>
				<p class="yer-note yer-note--end">Cevap yoksa yaz: ${ext('mailto:erasmus@yasar.edu.tr', 'erasmus@yasar.edu.tr')}</p>`;
		}

		// ------------------------------------------------------------ yönlendirme

		function render() {
			const next = parseHash();
			const wasOkullar = state.view === 'okullar' && root.querySelector('.yer-ticket');
			const prevDepth = lastDepth;
			state.view = next.view;
			state.field = next.field;
			state.country = next.country;
			state.schoolId = next.schoolId;
			state.q = '';
			motion += 1;

			if (state.view === 'okullar' && wasOkullar) {
				// Bilet yerinde kalır: uçak yeni adıma doğru ilerler, altındaki adım değişir.
				const stage = root.querySelector('[data-stage]');
				const d = depth();
				stage.innerHTML = d === 3 ? stepSchool(byId.get(state.schoolId)) : [stepFields, stepCountries, stepSchools][d]();
				stage.dataset.dir = d >= prevDepth ? 'fwd' : 'back';
				stage.classList.remove('is-in');
				void stage.offsetWidth;
				stage.classList.add('is-in');
				fillTicket(false);
			} else {
				const body = ({ okullar: okullarView, 'yol-haritasi': roadView, hibe: grantView, sss: faqView }[state.view])();
				root.innerHTML = `<div class="yer">${head()}${tabs()}<div class="yer-view" data-view="${state.view}">${body}</div>${foot()}</div>`;
				prevSlots = ['', '', ''];
				fillTicket(true);
			}
			lastDepth = state.view === 'okullar' ? depth() : 0;
			// Seçim başlayınca sayfa başlığı küçülür; bilet ve okul bilgisi yukarı çıkar.
			root.querySelector('.yer').classList.toggle('is-compact', lastDepth > 0);

			if (state.schoolId) {
				animateRoute(byId.get(state.schoolId));
				loadTopics(byId.get(state.schoolId));
			}
			const top = root.getBoundingClientRect().top + window.scrollY - 8;
			if (window.scrollY > top) {
				window.scrollTo(0, Math.max(0, top));
			}
			const target = root.querySelector('[data-focus]');
			if (target && root.dataset.focus !== 'off') {
				target.focus({ preventScroll: true });
			}
		}

		// ------------------------------------------------------------ forum konuları

		const env = {
			rel: (window.config && window.config.relative_path) || '',
			cid: root.dataset.cid || '',
			topicsUrl: root.dataset.topicsUrl || '',
			loggedIn: Boolean(window.app && app.user && app.user.uid > 0),
		};
		const topicTitle = s => `[${s.name}] `;
		const ago = (ms) => {
			const days = Math.floor((Date.now() - ms) / 86400000);
			if (days < 1) return 'bugün';
			if (days < 30) return `${days} gün önce`;
			return T.longDate(new Date(ms).toISOString().slice(0, 10)) || '';
		};

		async function loadTopics(s) {
			const box = root.querySelector(`[data-topics="${CSS.escape(s.id)}"] [data-topics-list]`);
			if (!box) {
				return;
			}
			if (!env.topicsUrl || !env.cid) {
				return;
			}
			try {
				const res = await fetch(`${env.topicsUrl}?school=${encodeURIComponent(s.id)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
				if (!res.ok) {
					throw new Error(res.status);
				}
				const { topics, categoryUrl } = await res.json();
				const allLink = root.querySelector(`[data-topics="${CSS.escape(s.id)}"] [data-topics-all]`);
				if (allLink && categoryUrl) {
					allLink.href = env.rel + categoryUrl;
				}
				box.innerHTML = topics.length ?
					`<ul class="yer-topics__list">${topics.map(t => `<li><a class="yer-pick" href="${esc(`${env.rel}/topic/${t.slug}`)}">
						<span><strong class="yer-pick__name">${esc(t.title)}</strong><span class="yer-pick__city">${esc(t.user)} · ${esc(ago(t.lastposttime))}</span></span>
						<span class="yer-count" aria-label="${nf.format(t.replies)} cevap">${nf.format(t.replies)}</span></a></li>`).join('')}</ul>` : '';
			} catch (err) {
				box.innerHTML = '';
			}
		}

		function openNewTopic(s) {
			if (!env.cid) {
				return;
			}
			if (!env.loggedIn) {
				window.location.href = `${env.rel}/login`;
				return;
			}
			if (window.app && typeof app.newTopic === 'function') {
				app.newTopic({ cid: env.cid, title: topicTitle(s), body: '' });
			}
		}

		// ------------------------------------------------------------ olaylar

		root.addEventListener('click', (e) => {
			const t = e.target;
			if (t.closest('[data-new-topic]')) {
				openNewTopic(byId.get(state.schoolId));
				return;
			}
			const step = t.closest('[data-months]');
			if (step) {
				state.months = Math.max(3, Math.min(6, state.months + Number(step.dataset.months)));
				updateCalc(byId.get(state.schoolId));
				return;
			}
			if (t.closest('[data-clear-q]')) {
				state.q = '';
				const input = root.querySelector('[data-q]');
				input.value = '';
				root.querySelector('[data-rows]').innerHTML = schoolRows();
				input.focus();
			}
		});

		root.addEventListener('input', (e) => {
			if (e.target.matches('[data-q]')) {
				state.q = e.target.value;
				root.querySelector('[data-rows]').innerHTML = schoolRows();
			} else if (e.target.matches('[data-faq-q]')) {
				state.faqQ = e.target.value;
				root.querySelector('[data-faq]').innerHTML = faqBody();
			}
		});

		root.addEventListener('change', (e) => {
			if (e.target.matches('[data-green]')) {
				state.green = e.target.checked;
				updateCalc(byId.get(state.schoolId));
			}
		});

		const onResize = () => {
			const t = root.querySelector('.yer-ticket');
			if (t) {
				placePlane(t);
			}
		};
		const onHash = () => {
			if (!root.isConnected) {
				window.removeEventListener('resize', onResize);
				window.removeEventListener('hashchange', onHash);
				return;
			}
			render();
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('hashchange', onHash);
		render();
	}

	// NodeBB sayfa modülü: forum /erasmus sayfasını açınca çağırır.
	async function init() {
		const root = document.querySelector('[data-yer-root]');
		if (!root) {
			return;
		}
		let data = null;
		try {
			const res = await fetch(root.dataset.dataUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
			data = res.ok ? await res.json() : null;
		} catch (err) {
			data = null;
		}
		if (root.isConnected) {
			mount(root, data);
		}
	}

	return { init, mount };
}));
