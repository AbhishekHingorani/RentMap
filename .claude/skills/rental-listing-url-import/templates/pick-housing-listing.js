// Paste into javascript_exec on one housing.com /rent/<id> page, after it loads.
// The receiver must run on 127.0.0.1:8799.
(async () => {
  const clean = (v) => String(v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const textOf = (el) => (el ? clean(el.textContent) : "");
  const want = location.href.match(/\/rent\/(\d+)/)[1];
  let listing = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const it = JSON.parse(s.textContent); if (it && it.offers && /\/rent\/\d+/.test(it.url)) listing = it; } catch (e) {}
  }
  if (!listing) return "ERROR no listing: " + document.title;
  if (String(listing.url).match(/\/rent\/(\d+)/)[1] !== want) return "ERROR other listing " + listing.url;
  const pick = { Property_Id: want };
  const title = textOf(document.querySelector("h1")); if (title) pick.title = title;
  const address = textOf(document.querySelector(".T_addressStyle")); if (address) pick.address = address;
  const seller = textOf(document.querySelector(".T_sellerStyle")); if (seller) pick.seller = seller;
  const places = []; for (let p = listing.containedInPlace; p && p.name; p = p.containedInPlace) places.push(p.name);
  if (places.length) pick.places = places.join(", ");
  if (listing.offers.price !== undefined) pick.rent = listing.offers.price;
  const details = {};
  for (const row of document.querySelectorAll("tr.data-point")) { const l = textOf(row.querySelector("th")), v = textOf(row.querySelector("td")); if (l && v) details[l] = v; }
  if (Object.keys(details).length) pick.details = details;
  const features = [];
  for (const el of document.querySelectorAll(".T_amenityLabelStyle")) { const l = textOf(el); if (l && !/^More\b/.test(l) && !features.includes(l)) features.push(l); }
  if (features.length) pick.features = features;
  if (listing.geo) { pick.Latitude = listing.geo.latitude; pick.Longitude = listing.geo.longitude; }
  if (listing.description) pick.Description = clean(listing.description).slice(0, 1000);
  const images = Array.isArray(listing.image) ? listing.image : listing.image ? [listing.image] : [];
  const photos = images.map((l) => String(l).replace("/v0/version/", "/v0/fs/")); if (photos.length) pick.photos = photos;
  const link = String(listing.url).split(/[?#]/)[0];
  const res = await fetch("http://127.0.0.1:8799/", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ link, data: JSON.stringify(pick) }) });
  return "saved " + want + " " + (await res.text());
})();
