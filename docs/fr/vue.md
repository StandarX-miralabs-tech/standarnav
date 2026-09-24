# Vue

`@standarx/nav/vue` est le même système à une instance par arbre, avec un fournisseur autour, pour
Vue 3.3 et au-delà. Les moteurs ne sont délibérément pas importés par l'adaptateur, si bien qu'une
application qui ne mentionne jamais de manette ne paie pas un octet pour elle — vous construisez
les plugins et vous les passez.

```sh
bun add @standarx/nav vue
```

`vue` est une dépendance pair **optionnelle** en `>=3.3.0` ; rien en dehors de `src/vue/` ne
l'importe, et l'adaptateur est mesuré avec Vue en externe. L'adaptateur n'est que du
`defineComponent` et des fonctions de rendu, il n'a donc besoin d'aucun compilateur Vue à lui ; vos
composants monofichiers s'en servent comme de n'importe quel autre composant.

```vue
<!-- App.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { NavProvider } from "@standarx/nav/vue";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";
import Dialog from "./Dialog.vue";

const plugins = [gamepadPlugin(), spatialPlugin({ mode: "app" })];
const open = ref(true);
</script>

<template>
  <NavProvider :plugins="plugins">
    <Dialog v-if="open" @close="open = false" />
  </NavProvider>
</template>
```

```vue
<!-- Dialog.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useIntent } from "@standarx/nav/vue";
import Level from "./Level.vue";

const emit = defineEmits<{ close: [] }>();
const surface = ref<HTMLElement | null>(null);
useIntent(
  (event) => {
    if (event.intent !== "back") return false;
    emit("close");
    return true;
  },
  { trapped: true, within: surface },
);
</script>

<template>
  <div ref="surface" data-snav="container" data-snav-trap>
    <Level />
  </div>
</template>
```

```vue
<!-- Level.vue -->
<script setup lang="ts">
import { ref } from "vue";
import { useIntent } from "@standarx/nav/vue";

const group = ref<HTMLElement | null>(null);
const level = ref(0);
useIntent(
  (event) => {
    if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
    const step = event.intent === "moveDown" ? 1 : -1;
    level.value = Math.max(0, Math.min(2, level.value + step));
    return true;
  },
  { within: group },
);
</script>

<template>
  <div ref="group" role="radiogroup">…</div>
</template>
```

**Un piège nomme sa surface, et un composite à l'intérieur nomme son propre élément.** `Level` est
monté avec `Dialog`, et Vue exécute le hook `mounted` d'un enfant avant celui de son parent : la
portée du groupe radio est donc ouverte la première et se retrouve *sous* le piège du dialogue. Un
piège fait taire ce qui est sous lui, et sans `within` le dialogue ferait taire son propre groupe
radio ([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)). Avec `within`
des deux côtés, une portée sous le piège dont l'élément se trouve dans la surface du piège est
quand même interrogée — après le piège, parce que l'inclusion ne réordonne pas la pile ; le
dialogue ne revendique donc que ce qui lui appartient (`back` ici) et laisse passer les flèches. Un
piège ou une portée sans `within` se comporte exactement comme avant ; le raisonnement est
[ADR-0025](../adr/0025-trap-within-its-surface.md). `within` accepte une ref de template posée sur
un élément, un élément ou un accesseur, lu à chaque dispatch, donc une ref remplie au montage est
vue et rien ne rouvre la portée. Une ref posée sur un *composant* contient une instance, pas un
élément : passez plutôt `() => card.value?.$el`. C'est toujours `data-snav-trap` qui garde le
moteur spatial à l'intérieur du dialogue. Épinglé dans `src/vue/vue.browser.test.ts` par « moves a
radio group mounted with its dialog, its within given as a template ref » (et sa variante « as a
getter »), « moves the radio group when the dialog's within is an element that existed before
setup », « keeps a radio group that names no element silenced, as before » et « does not open the
scope again when its within ref fills or the component re-renders » ; `bun run test:browser` les a
passés sur chromium, firefox et webkit le 2026-09-23.

**Gardez les plugins dans une simple constante.** Le fournisseur compare la liste `plugins` élément
par élément, donc un nouveau tableau autour des mêmes instances ne coûte rien — mais un plugin
*construit* dans un template ou une fonction de rendu, `:plugins="[gamepadPlugin()]"`, est un
nouvel objet à chaque rendu : le système est détruit puis reconstruit, compteur de modalité compris.
Ne les mettez pas non plus dans `ref()` ou `reactive()`, qui remettraient au fournisseur des proxys
de ces plugins. Un littéral `keymap` n'a pas besoin de ce soin : il est comparé à un niveau de
profondeur. Épinglé dans `src/vue/vue.browser.test.ts` par « keeps the system when the plugins
arrive in a fresh array around the same instances », « keeps the system when the keymap is a fresh
literal with the same keys » et « rebuilds when the plugins themselves are built in the render
function » ; `bun run test:browser` les a passés sur chromium, firefox et webkit le 2026-09-23.

| Export | Ce que c'est |
|---|---|
| `NavProvider` | Props `plugins`, `keymap`, `allowVerticalInText`. Construit un système d'entrée pour l'arbre au montage et le détruit au démontage. Rend son slot par défaut et rien d'autre. |
| `useIntent(handler, options?)` | Ouvre une portée d'intention du montage du composant à son démontage. `trapped` et `base` acceptent une valeur, une ref ou un accesseur comme `() => props.open` ; un changement rouvre la portée là où elle a été ouverte. `within` — une ref de template, un élément ou un accesseur — est lu au dispatch et ne la rouvre jamais. La réponse du gestionnaire — `true`, `false`, rien ou `"native"` — atteint le bus sans changement. À appeler dans `setup`. |
| `useInputSystem()` | Une `ShallowRef` qui contient le système, ou `null`. |
| `useIntentScopeHost()` | Un hôte stable pour toute la vie du fournisseur, pour une machine à états qui ouvre ses portées en entrant dans un état. Une portée empilée par lui avant que le système existe est ouverte dès qu'il existe. Son `pushScope` transmet les options telles quelles, donc `within` y est un élément ou un accesseur, pas une ref. `null` sans fournisseur. |
| `useInputModality()` | Une `ShallowRef` de `keyboard` \| `pointer` \| `touch` \| `gamepad`, `pointer` jusqu'au montage. Fonctionne sans fournisseur au-dessus. |
| `NavDocumentProvider` | Prop `doc`, un `Document` ou un accesseur qui en rend un. Nécessaire seulement quand l'arbre ne vit pas dans le document de la page elle-même — une iframe, une popup, une fixture de test. L'accesseur est relu quand quelque chose de réactif qu'il lit change. |

**Rendu serveur.** `useInputSystem()` contient `null` tant que le fournisseur n'est pas monté, et
`null` est ce que rend un serveur : le système est construit dans le `onMounted` du fournisseur,
jamais dans `setup`, parce que `createInputSystem` a besoin d'un document et installe des écouteurs
en phase de capture. `useIntent` ouvre lui aussi sa portée au montage, donc rien n'est ouvert sur
un serveur, et une portée empilée par `useIntentScopeHost` pendant `setup` est enregistrée puis
empilée quand le système est construit. `useIntent` n'avertit en développement que lorsqu'il n'y a
réellement aucun fournisseur au-dessus, et seulement lors d'un montage. Épinglé par « renders every
composable's first answer with no document, and builds nothing » dans `src/vue/vue.test.ts`, qui
rend le fournisseur, chaque composable et un `NavDocumentProvider` dont l'accesseur lève une
erreur, avec `renderToString` dans Node, où il n'y a aucun `document` ; `bun run test:unit` l'a
passé le 2026-09-23.

**Les portées gardent l'ordre dans lequel elles ont été ouvertes, y compris à travers une
reconstruction.** Un nouveau `plugins`, `keymap`, `allowVerticalInText` ou document fait détruire
son système au fournisseur, qui en construit un autre. Chaque portée ouverte par `useIntent` ou par
`useIntentScopeHost().pushScope` est enregistrée auprès du fournisseur, dans l'ordre de son
ouverture, et le fournisseur les rouvre toutes sur le nouveau système dans cet ordre, au-dessus des
portées que ses plugins empilent, avant qu'aucun composant ne voie le nouveau système
(`NavProvider`, `src/vue/vue.ts:174-176`) — le même registre que celui de l'adaptateur React. Un
nouveau `trapped` ou `base` laisse lui aussi la portée à sa place. Chaque `NavProvider` garde son
propre ordre. Épinglé dans `src/vue/vue.browser.test.ts` par « keeps sibling host scopes in the
order they were opened », « keeps a host trap above a hook scope opened before it », « keeps a
nested composite under the trap of the dialog around it », « keeps a hook scope opened over a host
trap above that trap » et « re-opens a scope in its place when a ref it was given for trapped
changes », et dans la suite partagée par les trois cas « across a system rebuild » ; `bun run
test:browser` les a passés sur chromium, firefox et webkit le 2026-09-23.

Ce que cela ne change pas, c'est l'ordre du premier montage, qui est celui de Vue : un enfant est
monté avant son parent, donc la portée qu'ouvre un composant est ouverte avant celle qu'ouvre son
parent dans le même montage. C'est cet ordre qui fait passer `within` à la recette du dialogue en
haut de cette page.

**Les radios et curseurs natifs gardent leurs flèches en mode `app` quand une portée répond
`"native"`.** En mode `app`, le moteur spatial prend toutes les flèches du clavier, si bien qu'un
groupe de radios natif déplace le focus sans rien cocher. Un gestionnaire peut renvoyer `"native"`
à côté de `true` et `false` : le parcours s'arrête avant le moteur et la touche garde son
comportement natif ([ADR-0026](../adr/0026-native-handler-answer.md)).

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useIntent } from "@standarx/nav/vue";

const group = ref<HTMLElement | null>(null);
useIntent(
  (event) =>
    event.source === "keyboard" &&
    (event.intent === "moveUp" || event.intent === "moveDown") &&
    group.value?.contains(document.activeElement) === true
      ? "native"
      : false,
  { within: group },
);
</script>

<template>
  <div ref="group" role="radiogroup">…</div>
</template>
```

Ne répondez que pour le clavier, puisqu'une manette n'a pas de comportement natif pour une
direction, et seulement sur l'axe propre du contrôle — haut et bas ici, gauche et droite pour un
curseur : les flèches d'une télécommande de télévision arrivent sous les mêmes touches, et un
groupe de radios natif boucle sur chromium et firefox, donc l'autre axe doit rester au moteur pour
qu'un utilisateur de télécommande puisse en sortir. Le raisonnement est dans
[Navigation](navigation.md#radios-et-curseurs-natifs-en-mode-app). Épinglé dans
`src/vue/vue.browser.test.ts` par « lets a real ArrowDown check the next radio through useIntent »
et « hands a host scope's native answer back unchanged » ; `bun run test:browser` les a passés sur
chromium, firefox et webkit le 2026-09-23. Sur une page servie par Vite et pilotée avec de vraies
touches sur les trois moteurs le même jour, un dialogue contenant ce groupe a coché la radio
suivante sur ArrowDown et ArrowUp, l'a quittée pour le bouton voisin sur ArrowRight, et s'est fermé
sur Escape ([ADR-0027](../adr/0027-vue-adapter.md), Evidence).

**Les drapeaux de build de Vue.** Le build de Vue pour bundler attend que `__VUE_OPTIONS_API__`,
`__VUE_PROD_DEVTOOLS__` et `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` soient définis, et avertit dans
la console quand ils ne le sont pas. `@vitejs/plugin-vue` les définit dans son hook `config`
(https://raw.githubusercontent.com/vitejs/vite-plugin-vue/main/packages/plugin-vue/src/index.ts,
consulté le 2026-09-23) ; une configuration Vite sans lui les définit elle-même, aux valeurs par
défaut de Vue `true`, `false` et `false`
(https://github.com/vuejs/core/tree/main/packages/vue#bundler-build-feature-flags, consulté le
2026-09-23), comme le fait la configuration de test de ce dépôt (`vitest.config.ts`, `:35-39`).

**Le plancher est 3.3.0, et il est exécuté.** L'adaptateur utilise `toValue`, `MaybeRefOrGetter` et
la forme de `defineComponent` qui prend une fonction `setup`, tous trois apparus dans Vue 3.3. Un
job CI installe exactement `vue@3.3.0` par-dessus le 3.5 du lockfile et lance contre lui la
vérification des types et la suite navigateur (`vue-floor`, `.github/workflows/ci.yml:136-161`) ;
pourquoi cette version et pas une plus ancienne, c'est [ADR-0027](../adr/0027-vue-adapter.md).

L'adaptateur est tenu à la suite partagée `src/adapter-parity.ts`, les mêmes 16 cas que React
passe — un seul système et pas pendant le premier rendu, un ordre de portées LIFO, une portée
libérée quand seul son propre sous-arbre est démonté, un piège qui arrête le parcours, une portée de
base atteinte à travers ce piège, un composite imbriqué dans une surface qui piège atteint quand
les deux passent `within` et réduit au silence quand aucun ne le fait, une base réenregistrée à un
nouveau rendu sans quitter sa place, et l'ordre d'ouverture des portées conservé à travers une
reconstruction du système. `runAdapterParitySuite` les exécute à
`src/vue/vue.browser.test.ts:921`, et `bun run test:browser` les a passés sur chromium, firefox et
webkit le 2026-09-23 ([React](react.md) tient le même contrat). [Svelte](svelte.md) a suivi le 2026-09-24, et Angular
suit, dans l'ordre d'[ADR-0011](../adr/0011-package-layout-and-adapters.md).
