'use strict';

// Türkçe metin yardımcıları. Hem tarayıcıda (NodeBB modülü: yasar-erasmus/text)
// hem testlerde (Node) çalışır. Kural: arayüzde Türkçe ek ve yazım hatası olmaz.

(function (factory) {
	if (typeof define === 'function' && define.amd) {
		define('yasar-erasmus/text', [], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	}
}(function () {
	const nf = new Intl.NumberFormat('tr-TR');

	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	// "İstanbul", "ISTANBUL" ve "istanbul" aynı sayılsın diye aksan ve büyük/küçük harf atılır.
	function fold(text) {
		return Array.from(String(text)).map(ch => ch.toLocaleLowerCase('tr').replace('ı', 'i')
			.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0) || ch).join('');
	}

	// Ülke ve ay adları veriden geldiği için sabit ek yazılamaz: ünlü uyumu ve sert ünsüz kuralı.
	function lastVowel(word) {
		const m = String(word).toLocaleLowerCase('tr').match(/[aeıioöuü](?=[^aeıioöuü]*$)/);
		return m ? m[0] : 'e';
	}

	function locative(word) {
		if (/Cumhuriyeti$/.test(word)) {
			return word + "'nde";
		}
		const hard = /[fstkçşhp]$/.test(String(word).toLocaleLowerCase('tr'));
		return word + "'" + (hard ? 't' : 'd') + ('aıou'.includes(lastVowel(word)) ? 'a' : 'e');
	}

	function dative(word) {
		const back = 'aıou'.includes(lastVowel(word));
		const vowelEnd = /[aeıioöuü]$/.test(String(word).toLocaleLowerCase('tr'));
		return word + "'" + (vowelEnd ? 'y' : '') + (back ? 'a' : 'e');
	}

	const eur = n => nf.format(n) + ' €';
	const km = n => nf.format(n) + ' km';
	const lvl = l => (l === 'Yüksek Lisans' ? 'Yüksek lisans' : l);
	const bandLabel = b => (b.max_km ? `${nf.format(b.min_km)}–${nf.format(b.max_km)} km` : `${nf.format(b.min_km)} km ve üzeri`);

	// "2026-10-07" -> "7 Ekim 2026"
	function longDate(iso) {
		const d = new Date(String(iso) + 'T12:00:00');
		return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(d);
	}

	// "2025-2026" -> "2025–26"
	const termLabel = t => String(t).replace(/^(\d{4})-\d{2}(\d{2})$/, '$1–$2');

	return { nf, esc, fold, lastVowel, locative, dative, eur, km, lvl, bandLabel, longDate, termLabel };
}));
