// Veri deposundaki derlenmiş dosyaları (yasar-erasmus-data/public) eklentiye kopyalar.
// Çalıştır: npm run sync-data (önce yasar-erasmus-data'da python3 build_dataset.py)
import { copyFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = process.env.DATA_DIR || path.join(ROOT, '..', 'yasar-erasmus-data', 'public');

for (const name of ['meta', 'general', 'schools']) {
	await copyFile(path.join(SRC, `${name}.json`), path.join(ROOT, 'data', `${name}.json`));
}
console.log(`veri kopyalandı: ${SRC} -> data/`);
