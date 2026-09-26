# Anneau de focus

`@standarx/nav/focus-ring` est un unique élément de superposition qui suit `focusin`, si bien qu'il
entoure de la même façon un Tab au clavier, un déplacement à la manette et un `focus()`
programmatique. Il est inactif tant que vous ne le montez pas, et **aucune feuille de style n'est
livrée** : le plugin écrit sa propre peinture en ligne, ce qui explique qu'il n'y ait rien à
importer et rien à oublier d'importer. Il mesure et anime sa propre superposition et ne touche
jamais aux éléments d'une application.

```ts
import { createInputSystem } from "@standarx/nav";
import { focusRingPlugin } from "@standarx/nav/focus-ring";
import { spatialPlugin } from "@standarx/nav/spatial";

const input = createInputSystem({
  plugins: [spatialPlugin({ mode: "app" }), focusRingPlugin()],
});
```

`focusRingPlugin({ offset?, duration? })` prend les deux valeurs qui sont aussi des propriétés
personnalisées ci-dessous, et expose `refresh()` pour un changement de mise en page que la
superposition ne peut pas voir.

Six propriétés CSS personnalisées sont tout le contrat. Posez-les n'importe où la superposition en
hérite :

| Propriété | Repli | Ce qu'elle règle |
|---|---|---|
| `--snav-focus-ring-z-index` | `1700` | L'échelon d'empilement. `position: fixed` n'ouvre aucun contexte d'empilement, donc sans z-index l'anneau se peint dans l'ordre du DOM et passe derrière le premier dialogue qu'il rencontre. `1700` est un échelon au-dessus d'une modale, d'un popover, d'un toast et d'une infobulle — un ordre hérité de l'implémentation antérieure ([ADR-0002](../adr/0002-license-and-copyright.md)) et conservé pour la raison qu'[ADR-0020](../adr/0020-focus-ring-defaults.md) donne. |
| `--snav-focus-ring-width` | `3px` | L'épaisseur de l'anneau, dessinée comme un étalement de `box-shadow`. |
| `--snav-focus-ring-color` | `#1a73e8` | 4,51:1 sur blanc et 4,36:1 sur `#0b0b0f`, tous deux au-dessus du 3:1 que WCAG SC 1.4.11 demande d'un indicateur non textuel. |
| `--snav-focus-ring-offset` | `2` | Pixels entre la boîte de la cible et l'anneau. Remplacé par l'option `offset`. |
| `--snav-focus-ring-duration` | `260`, ou `150` en mouvement réduit | Le temps que l'anneau met à glisser ; à zéro, il n'y a pas de fondu non plus. Remplacé par l'option `duration`. |
| `--snav-focus-ring-easing` | `cubic-bezier(0.22, 1, 0.36, 1)` | L'accélération du glissement. |

L'apparition et la disparition se fondent sur 150 ms via WAAPI, et le fondu est purement et
simplement sauté sous `prefers-reduced-motion` et chaque fois que la durée se résout à zéro :
`focusRingPlugin({ duration: 0 })`, ou `--snav-focus-ring-duration: 0ms` (ou `0s`), coupe le fondu
en plus du glissement. C'est l'interrupteur du réglage « pas d'animation » propre à une
application ; toute autre durée garde le fondu de 150 ms
(`src/focus-ring/focus-ring.browser.test.ts:197-235`, sur chromium, firefox et webkit ;
[ADR-0020](../adr/0020-focus-ring-defaults.md), amendement du 2026-09-23). Deux choses que le
style en ligne ne peut pas faire sont écrites dans `src/focus-ring/focus-ring.ts` : une propriété
personnalisée du mauvais type rend toute la déclaration invalide sans déclaration antérieure sur
laquelle se replier, et `forced-colors: active` supprime `box-shadow`, donc l'anneau disparaît
dans un thème à couleurs forcées — un point v1 de [ROADMAP.md](../../ROADMAP.md), pas un correctif v0.

L'anneau entoure le rectangle par lequel le moteur spatial évalue sa cible. Pour un `<area>` de
carte d'image, qui n'a pas de boîte propre sur chromium et webkit et celle de toute l'image sur
firefox, c'est la forme de la zone, `shape` et `coords`, posée sur son image, si bien qu'un cercle
est entouré par son carré englobant. Test : « wears the shape of an area over its image »
(`src/focus-ring/focus-ring.browser.test.ts`), sur chromium, firefox et webkit ;
[ADR-0020](../adr/0020-focus-ring-defaults.md), amendement du 2026-09-26.
