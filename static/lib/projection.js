'use strict';

// d3-geo'nun geoConicConformal projeksiyonunun bağımlılıksız karşılığı.
// Harita (static/europe-map.json) d3 ile çizildi; okul noktaları çalışırken
// aynı parametrelerle burada hesaplanır.

(function (factory) {
	if (typeof define === 'function' && define.amd) {
		define('yasar-erasmus/projection', [], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	}
}(function () {
	const RAD = Math.PI / 180;
	const HALF_PI = Math.PI / 2;
	const EPSILON = 1e-6;
	const tany = y => Math.tan((HALF_PI + y) / 2);

	function createProjection({ parallels, rotate, scale, translate }) {
		const y0 = parallels[0] * RAD;
		const y1 = parallels[1] * RAD;
		const cy0 = Math.cos(y0);
		const n = y0 === y1 ? Math.sin(y0) : Math.log(cy0 / Math.cos(y1)) / Math.log(tany(y1) / tany(y0));
		const f = cy0 * Math.pow(tany(y0), n) / n;

		function raw(x, y) {
			const lat = Math.max(y, -HALF_PI + EPSILON);
			const r = f / Math.pow(tany(lat), n);
			return [r * Math.sin(n * x), f - r * Math.cos(n * x)];
		}

		const deltaLambda = rotate[0] * RAD;
		const [cx, cy] = raw(0, 0);

		return function project([lon, lat]) {
			let lambda = lon * RAD + deltaLambda;
			if (Math.abs(lambda) > Math.PI) {
				lambda -= Math.round(lambda / (2 * Math.PI)) * 2 * Math.PI;
			}
			const [x, y] = raw(lambda, lat * RAD);
			return [translate[0] + scale * (x - cx), translate[1] - scale * (y - cy)];
		};
	}

	return { createProjection };
}));
