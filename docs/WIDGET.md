# Live counter widget for partner sites

One script tag renders the live national counter with a link to the studio. Under 4 KB, no cookies, no dependencies, works on HTTP and HTTPS pages. It reads the public counter from the Realtime Database REST endpoint every 30 seconds.

```html
<script src="https://guineen68.com/widget.js" data-lang="fr" async></script>
```

The old `https://theblackdude.github.io/Mur_National/widget.js` URL redirects to the domain above.

Attributes:

| Attribute | Values | Default |
|---|---|---|
| `data-lang` | `fr`, `en` | page language, else `fr` |
| `data-theme` | `light`, `dark` | `light` |
| `data-site` | site origin used for the link | `https://guineen68.com` |

The widget inserts an `<a>` right after the script tag; wrap the tag in your own container to position it. The link opens `/selfie?src=widget` in a new tab, so widget traffic is visible in analytics.
