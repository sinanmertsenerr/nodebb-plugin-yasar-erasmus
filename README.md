# Yaşar Erasmus+ (nodebb-plugin-yasar-erasmus)

Yaşar Forum'un `/erasmus` sayfası: bölüm → ülke → okul akışı, hibe hesabı, yol haritası, sık sorulanlar ve her okulun forum konuları.

- Veri eklentiyle gelir (`data/`). Güncellemek için `yasar-erasmus-data` deposunda `python3 build_dataset.py`, sonra burada `npm run sync-data`.
- Okul sayfasındaki **Konu aç** düğmesi Erasmus+ kategorisinde `[Okul adı] ` ile başlayan bir konu açar; sayfa bu başlıkla başlayan konuları listeler.
- Kategori: `meta.settings` içinde `yasar-erasmus` → `categoryId`.

## Kurulum

    npm install https://codeload.github.com/sinanmertsenerr/nodebb-plugin-yasar-erasmus/tar.gz/v1.1.0

ACP'de eklentiyi aç, rebuild ve restart. ACP → Ayarlar → Navigasyon'dan "Erasmus+" (`/erasmus`) ekle.

## Geliştirme

    npm run live          # forum sayfasının yerel kopyası: http://127.0.0.1:4478/
    npm run build:icons   # templates/partials/yasar-erasmus/icons.tpl

## Lisans

MIT. İkonlar Font Awesome Free (CC BY 4.0).
