/* Fier d'être Guinéen · live counter widget. One tag, no cookies, no dependencies:
   <script src="https://guineen68.com/widget.js" data-lang="fr" data-theme="light" async></script>
   Reads the public counter over the Realtime Database REST endpoint every 30 s. */
(function () {
  var script = document.currentScript
  if (!script) return
  var lang = (script.getAttribute('data-lang') || document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr'
  var dark = script.getAttribute('data-theme') === 'dark'
  var site = script.getAttribute('data-site') || 'https://guineen68.com'
  var db = 'https://guinea68-default-rtdb.europe-west1.firebasedatabase.app/counters/national.json'
  var txt = lang === 'fr'
    ? { label: 'Guinéens fiers', cta: 'Prendre mon selfie', title: 'Fier d’être Guinéen · An 68' }
    : { label: 'Proud Guineans', cta: 'Take my selfie', title: 'Proud to be Guinean · Year 68' }

  var a = document.createElement('a')
  a.href = site + '/selfie?src=widget'
  a.target = '_blank'
  a.rel = 'noopener'
  a.setAttribute('aria-label', txt.title)
  a.style.cssText = 'display:inline-flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;text-decoration:none;font:500 14px/1.2 "DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;max-width:100%;box-sizing:border-box;'
    + (dark ? 'background:#121826;color:#fff;border:1px solid rgba(255,255,255,.12);' : 'background:#fff;color:#121826;border:1px solid #E3E8EF;box-shadow:0 8px 24px rgba(18,24,38,.06);')

  var strip = document.createElement('span')
  strip.style.cssText = 'display:inline-block;width:6px;height:44px;border-radius:3px;background:linear-gradient(#CE1126 0 33.3%,#FCD116 33.3% 66.6%,#009460 66.6%);flex:none'
  var box = document.createElement('span')
  box.style.cssText = 'display:flex;flex-direction:column;min-width:0'
  var num = document.createElement('span')
  num.style.cssText = 'font-size:28px;font-weight:700;color:#3273AC;font-variant-numeric:tabular-nums;line-height:1'
  num.textContent = '—'
  var label = document.createElement('span')
  label.style.cssText = 'margin-top:4px;color:' + (dark ? 'rgba(255,255,255,.7)' : '#5F6B7A')
  label.textContent = txt.label
  var cta = document.createElement('span')
  cta.style.cssText = 'margin-left:auto;padding:8px 12px;border-radius:10px;background:#EBAB58;color:#121826;font-weight:500;white-space:nowrap;flex:none'
  cta.textContent = txt.cta

  box.appendChild(num); box.appendChild(label)
  a.appendChild(strip); a.appendChild(box); a.appendChild(cta)
  script.parentNode.insertBefore(a, script.nextSibling)

  function fmt(n) { try { return Number(n).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB') } catch (e) { return String(n) } }
  function tick() {
    try {
      fetch(db, { cache: 'no-store', credentials: 'omit' })
        .then(function (r) { return r.json() })
        .then(function (n) { if (typeof n === 'number') num.textContent = fmt(n) })
        .catch(function () {})
    } catch (e) { /* very old browsers: leave the dash */ }
  }
  tick()
  setInterval(tick, 30000)
})()
