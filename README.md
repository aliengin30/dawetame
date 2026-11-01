# Dijital davetiye kiti (Cloudflare Pages + KV + R2 + PayTR)

Müşteri /satis.html sayfasından siparişini verir ve öder; ödeme onaylanınca davetiyesi
otomatik oluşur. Davetiye: /d/<adres>. Müşteri paneli: /admin.html?s=<adres>&t=<gizli anahtar>.

## Kurulum (bir kez)
1. Cloudflare > Workers & Pages > KV > namespace oluşturun (ad: davet). ID'yi wrangler.toml'daki BURAYA_KV_ID yerine yazın.
2. R2 > bucket oluşturun (ad: davetiye-foto). (R2 için ödeme yöntemi eklemeniz istenir; düşük kullanımda ücretsiz katman yeter.)
3. Bu klasörü Pages projesi olarak yükleyin (`npx wrangler pages deploy public`).
4. Pages projesi > Settings > Bindings: KV için DAVET, R2 için FOTO adlarıyla bağlayın.
5. Settings > Variables and Secrets (Secret olarak ekleyin):
   - MASTER_KEY : kendi uzun şifreniz (yeni.html için)
   - MERCHANT_ID, MERCHANT_KEY, MERCHANT_SALT : PayTR mağaza paneli > Bilgi sayfası
   - FIYAT_TL : fiyat (ör. 499)
   - TEST_MODE : 1 = deneme, 0 = gerçek ödeme (önce 1 ile deneyin)
6. PayTR panelinde Bildirim URL'sini şu yapın: https://SITENIZ/api/paytr-callback/x
7. Yeniden deploy edin; /satis.html'den test siparişi verin.

## Notlar
- Panel bağlantısı müşterinin şifresidir.
- yeni.html ile ödemesiz (elle) müşteri de oluşturabilirsiniz.
- PayTR hesabı için işletme/şahıs şirketi gerekir; vergi ve fatura yükümlülükleri size aittir.
