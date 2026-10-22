# Design System — متجر البشرى (Master)

Source of truth for UI decisions. Built with the **ui-ux-pro-max** skill (`.claude/skills/ui-ux-pro-max`),
adapted to the brand. Page-specific overrides go in `pages/<page>.md`.

## Product
- Fashion e-commerce (T-shirts, jackets, hoodies, jeans, abayas, Sudanese jalabiyas), Arabic RTL, mobile-first.
- Customers in Sudan (Bankak) and abroad (card). Runs as website, installable PWA and Android app.

## Pattern & style
- Skill pattern: **Feature-Rich Showcase** — hero with one clear message, repeated CTA.
- Hero is the **3D clothes rack** (WebGL cloth): the product is the visual.
- App chrome uses the skill's **Liquid Glass** style sparingly: translucent bottom tab bar and header
  (blur + 4.5:1 text contrast on top of content). Content surfaces stay solid white cards.

## Brand overrides (deliberate deviations from the skill's suggestion)
The skill suggested near-black + gold with Cormorant/Montserrat. The store already has a brand
(logo: black hanger + green leaf), and those fonts have no Arabic glyphs, so:

| Token | Value | Use |
|---|---|---|
| `--ink` (primary) | `#151515` | text, primary dark buttons, icons |
| `--green` | `#3CC420` | brand accent fills, glows, marquee; text on it must be `--ink` (7.9:1). **Never white text** (2.3:1) |
| `--cta` | `#1D7D1A` | primary buttons with white text (5.25:1); pressed `#16631A` |
| `--green-dark` | `#1D7D1A` | accent text/links, prices (4.5:1 on white) |
| `--bg` | `#F3F3F0` | app background |
| `--surface` | `#FFFFFF` | cards, sheets |
| `--muted` | `#6D6D68` | secondary text (4.5:1 on `--bg`) |
| `--line` | `#E1E1DB` | borders, dividers |
| `--danger` | `#C62828` | errors |
| splash bg | `#0F1A0E → #151515` | splash / native launch screen |

Typography: **Cairo** (UI, 400–900) + **Lalezar** (logo wordmark, display). Base 16px, line-height 1.6.

## Motion (skill: motion 6/10 "Standard")
- Durations: tap feedback 120ms · UI transitions 200–300ms · entrances 300–450ms · page transition 250ms.
- Exit faster than enter. Easing `cubic-bezier(.22,.8,.24,1)`; entrance stagger 60ms per item.
- 3D: garment spin 1.25s, swing, cloth breeze. Everything respects `prefers-reduced-motion`.

## App rules (from `references/pro-rules.md`)
- Touch targets ≥ 48px (Android); bottom tab bar ≤ 5 items with labels + icons; badge for cart.
- Safe areas: `env(safe-area-inset-*)` on header, tab bar and sticky buy bar; content padded so nothing hides behind fixed bars.
- SVG icons only (single stroke family, 1.9px stroke), decorative icons `aria-hidden`.
- Pressed states change opacity/scale only (no layout shift).
- Skeletons with `aria-busy` instead of spinners for content areas.
- Three.js: DPR cap 2 (1.5 on phones), dispose geometry/materials/textures on removal.

## Known gaps
- Dark mode not designed yet (light-only brand). Needs its own token set and contrast pass.
