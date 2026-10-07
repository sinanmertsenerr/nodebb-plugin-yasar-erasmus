# Yaşar Erasmus+ tasarım kararları

Sayfa Yaşar Forum'un içinde yaşar. Kabuk forumundur, yenilik içeriktedir.

## Forumun verdiği kararlar (değiştirilmez)

- **Renk:** forumun mavisi `#1a73e8` (koyu temada yazı `#82b8ff`), forumun gri yüzeyleri (`#202124`, `#292a2d`, çizgi `#37383c`). Ayrı bir palet eklenti yamalı durur; sahibi "forumdan sapmasın" dedi. design-mcp bunu `saas-default-palette` ve `cool-grey-neutrals` diye işaretler; bilinçli tercih.
- **Yazı tipi:** forumun tek ailesi (Inter). İkinci aile eklenmez (`single-typeface` bilinçli).
- **Köşe:** 8 / 12 / 14 px. Gölge yok, ince çizgi var.

## Sayfanın kendi kararları

- **Okul bul:** adım adım (bölüm → ülke → okul). Her adımda tek soru.
- **Bilet:** akışın kendisi. İzmir'den kalkan uçak her seçimde çizginin ucunda ilerler; seçimler bilete işlenir. Uçak ile çizginin ucu aynı noktadadır, arada maske ya da boşluk olmaz.
- **Listeler:** kutusuz, ince çizgili satırlar. Bölüm listesi 3 sütun: 22 kısa ad tek ekranda görünsün diye (`three-up-card-grid` işareti bundan; ikon + tanıtım yazılı kart değil).
- **Okul sayfası:** kendini çizen rota yayı, yanında hibe hesabı; altında okulun kendi sayfasından derlenen bilgi.
- **Metin:** kısa. Bulunamayan bilgi tahmin edilmez, "Bulamadıklarımız" diye tek satırda söylenir.
- **Hareket:** bilet ilerlemesi, adım geçişi, rota yayı, toplam tutarın sayması. `prefers-reduced-motion` açıksa hepsi kapanır.

## Önizleme

- `npm run live`: forumun gerçek sayfasının yerel kopyası. Tasarım buradan değerlendirilir.
- `npm run preview`: tek dosya HTML, forumu taklit eden kabukla (`preview/shell.*`). Kabuktaki menü, kullanıcı adı ve takvim satırı örnek içeriktir; eklentiye girmez.
