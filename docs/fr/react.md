# React

`@standarx/nav/react` est le même système à une instance par arbre, avec un fournisseur autour. Les
moteurs ne sont délibérément pas importés par l'adaptateur, si bien qu'une application qui ne
mentionne jamais de manette ne paie pas un octet pour elle — vous construisez les plugins et vous
les passez.

```tsx
import { useMemo, useRef, useState } from "react";
import { NavProvider, useIntent } from "@standarx/nav/react";
import { gamepadPlugin } from "@standarx/nav/gamepad";
import { spatialPlugin } from "@standarx/nav/spatial";

export function App() {
  const [open, setOpen] = useState(true);
  const plugins = useMemo(() => [gamepadPlugin(), spatialPlugin({ mode: "app" })], []);
  return (
    <NavProvider plugins={plugins}>
      {open ? <Dialog onClose={() => setOpen(false)} /> : null}
    </NavProvider>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  useIntent(
    (event) => {
      if (event.intent !== "back") return false;
      onClose();
      return true;
    },
    { trapped: true, within: surface },
  );

  return (
    <div ref={surface} data-snav="container" data-snav-trap>
      <Level />
    </div>
  );
}

function Level() {
  const group = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  useIntent(
    (event) => {
      if (event.intent !== "moveDown" && event.intent !== "moveUp") return false;
      const step = event.intent === "moveDown" ? 1 : -1;
      setLevel((at) => Math.max(0, Math.min(2, at + step)));
      return true;
    },
    { within: group },
  );

  return <div ref={group} role="radiogroup">…</div>;
}
```

**Un piège nomme sa surface, et un composite à l'intérieur nomme son propre élément.** `Level` est
monté dans le même commit que `Dialog`, et React exécute l'effet d'un enfant avant celui de son
parent : la portée du groupe radio est donc ouverte la première et se retrouve *sous* le piège du
dialogue. Un piège fait taire ce qui est sous lui, et sans `within` le dialogue faisait taire son
propre groupe radio ([issue #14](https://github.com/StandarX-miralabs-tech/standarnav/issues/14)).
Avec `within` des deux côtés, une portée sous le piège dont l'élément se trouve dans la surface du
piège est quand même interrogée — après le piège, parce que l'inclusion ne réordonne pas la pile ;
le dialogue ne revendique donc que ce qui lui appartient (`back` ici) et laisse passer les flèches.
Un piège ou une portée sans `within` se comporte exactement comme avant ; le raisonnement est
[ADR-0025](../adr/0025-trap-within-its-surface.md). `within` accepte une ref, un élément ou un
accesseur, lu à chaque dispatch, donc une ref remplie après le premier commit ou une nouvelle
fonction fléchée à chaque rendu ne rouvre jamais la portée. C'est toujours `data-snav-trap` qui
garde le moteur spatial à l'intérieur du dialogue. Épinglé dans `src/react/react.browser.test.tsx`
par « moves a radio group mounted with its dialog, its within given as ref » (et ses variantes
« as getter » et « as element »), « keeps a radio group that names no element silenced, as
before » et « does not open the scope again for a within that is a new arrow on every render » ;
`bun run test:browser` les a passés sur chromium, firefox et webkit le 2026-09-23.

**Le `useMemo` est le contrat, pas une décoration.** Le fournisseur compare la liste `plugins`
élément par élément avec `Object.is`, donc un nouveau littéral de tableau autour d'instances stables
ne coûte rien — mais un plugin *construit* dans le JSX, `plugins={[gamepadPlugin()]}`, est un nouvel
objet à chaque rendu : le contenu a réellement changé, et le système est détruit puis reconstruit,
compteur de modalité compris. Hissez les instances ou mémoïsez-les. Deux tests navigateur
épinglent les deux moitiés. Un littéral `keymap` n'a pas besoin de ce soin — il est comparé à un
niveau de profondeur sur ses valeurs chaîne, donc `keymap={{ keys: { … } }}` est réellement stable.

| Export | Ce que c'est |
|---|---|
| `NavProvider` | Construit un système d'entrée pour l'arbre et le détruit au démontage. |
| `useIntent(handler, options?)` | Ouvre une portée d'intention pour la durée de vie du composant. Le gestionnaire est lu à travers une ref, donc une fonction fléchée inline ne dépile pas et ne réempile pas la portée — ce qui la réordonnerait silencieusement sous tout ce qui a été empilé depuis. Un nouveau `trapped` ou `base` laisse la portée là où elle a été ouverte. `within` — une ref, un élément ou un accesseur — est lu au dispatch et ne la rouvre jamais. La réponse du gestionnaire — `true`, `false`, rien ou `"native"` — atteint le bus sans changement. |
| `useInputSystem()` | Le système, ou `null`. |
| `useIntentScopeHost()` | Un hôte stable pour toute la vie du fournisseur, pour une machine à états qui installe ses effets en entrant dans un état et n'a pas de tableau de dépendances pour se relancer. Une portée empilée par lui avant que le système existe est ouverte dès qu'il existe. Son `pushScope` transmet les options telles quelles, donc `within` y est un élément ou un accesseur comme `() => ref.current`, pas une ref. `null` sans fournisseur. |
| `useInputModality()` | `keyboard` \| `pointer` \| `touch` \| `gamepad`. Fonctionne sans fournisseur au-dessus : le magasin de modalité est compté par référence par document, donc un composant qui veut seulement savoir s'il doit dessiner un anneau paie un traqueur, pas un système d'entrée. |
| `NavDocumentProvider` | Nécessaire seulement quand l'arbre ne vit pas dans le document de la page elle-même — une iframe, une popup, une fixture de test. |

`useInputSystem()` répond `null` tant que l'effet du fournisseur n'a pas tourné, et `null` est
aussi ce qu'il répond côté serveur et sans fournisseur : `createInputSystem` a besoin d'un document
et installe des écouteurs en phase de capture, donc cela ne peut pas se produire pendant le rendu,
et les enfants sont rendus une fois avec `null`. `useIntent` et `useIntentScopeHost` s'en chargent
eux-mêmes : une portée ouverte avant que le système existe est enregistrée par le fournisseur et
empilée quand le système est construit. `useIntent` n'avertit en développement que lorsqu'il n'y a
réellement aucun fournisseur au-dessus.

**Les portées gardent l'ordre dans lequel elles ont été ouvertes, y compris à travers une
reconstruction.** Un nouveau `plugins`, `keymap`, `allowVerticalInText` ou document fait détruire
son système au fournisseur, qui en construit un autre. Chaque portée ouverte par `useIntent` ou par
`useIntentScopeHost().pushScope` est enregistrée auprès du fournisseur, dans l'ordre de son
ouverture, et le fournisseur les rouvre toutes sur le nouveau système dans cet ordre, au-dessus des
portées que ses plugins empilent, avant qu'aucun composant ne voie le nouveau système (l'effet de
`NavProvider`, `src/react/react.tsx:188-190`). Les composants ne réempilent rien eux-mêmes : leurs
effets tourneraient dans l'ordre de l'arbre, les enfants avant les parents, et un piège ouvert en
dernier pourrait revenir sous la portée qu'il recouvrait. Un nouveau `trapped` ou `base` sur
`useIntent` laisse lui aussi la portée à sa place — elle y est rouverte, et chaque portée ouverte
après elle est rouverte au-dessus d'elle. Chaque `NavProvider` garde son propre ordre, donc deux
fournisseurs sur une même page n'en partagent jamais un. Épinglé dans
`src/react/react.browser.test.tsx` par « keeps sibling host scopes in the order they were opened »,
« keeps a host trap above a hook scope opened before it », « keeps a nested composite under the
trap of the dialog around it » et « leaves one registration per scope under StrictMode, across a
rebuild too », et dans la suite partagée par les trois cas « across a system rebuild » et par
« re-registers a scope when its base changes on a rerender » ; `bun run test:browser` les a passés
sur chromium, firefox et webkit le 2026-09-23.

Ce que cela ne change pas, c'est l'ordre du premier commit, qui est celui de React : l'effet d'un
enfant tourne avant celui de son parent, donc la portée qu'ouvre un composant est ouverte avant
celle qu'ouvre son parent dans le même commit — le cas imbriqué ci-dessus affirme cet ordre pour un
composite et l'élément qu'il contient. C'est cet ordre qui fait passer `within` à la recette du
dialogue en haut de cette page.

**Les radios et curseurs natifs gardent leurs flèches en mode `app` quand une portée répond
`"native"`.** En mode `app`, le moteur spatial prend toutes les flèches du clavier, si bien qu'un
groupe de radios natif déplace le focus sans rien cocher. Un gestionnaire peut renvoyer `"native"`
à côté de `true` et `false` : le parcours s'arrête avant le moteur et la touche garde son
comportement natif ([ADR-0026](../adr/0026-native-handler-answer.md)). `useIntent` et
`useIntentScopeHost` transmettent la réponse au bus sans la changer.

```tsx
function Sizes() {
  const group = useRef<HTMLDivElement>(null);
  useIntent(
    (event) =>
      event.source === "keyboard" &&
      (event.intent === "moveUp" || event.intent === "moveDown") &&
      group.current?.contains(document.activeElement) === true
        ? "native"
        : false,
    { within: group },
  );
  return <div ref={group} role="radiogroup">…</div>;
}
```

Ne répondez que pour le clavier, puisqu'une manette n'a pas de comportement natif pour une
direction, et seulement sur l'axe propre du contrôle — haut et bas ici, gauche et droite pour un
curseur : les flèches d'une télécommande de télévision arrivent sous les mêmes touches, et un groupe
de radios natif boucle sur chromium et firefox, donc l'autre axe doit rester au moteur pour qu'un
utilisateur de télécommande puisse en sortir. Le raisonnement, et pourquoi le moteur ne le décide
pas lui-même, sont dans [Navigation](navigation.md#radios-et-curseurs-natifs-en-mode-app). Épinglé
dans `src/react/react.browser.test.tsx` par « lets a real ArrowDown check the next radio through
useIntent » et « hands a host scope's native answer back unchanged » ; `bun run test:browser` les a
passés sur chromium, firefox et webkit le 2026-09-23.

`react` et `react-dom` sont des dépendances pair **optionnelles** en `>=18.3.0` ; rien en dehors de
`src/react/` ne les importe, et l'adaptateur est mesuré avec React en externe. Le plancher de cette
plage est construit, vérifié par les types et exécuté pour de vrai : un job CI réinstalle React 18.3
par-dessus le 19 du lockfile et lance la suite navigateur contre lui, parce que tous les autres jobs
installent en `--frozen-lockfile` et n'auraient jamais exercé le 18.

L'adaptateur est tenu à une suite partagée plutôt qu'à des tests de sa propre invention :
`src/adapter-parity.ts` est le contrat que tout adaptateur de framework doit satisfaire — un seul
système et pas pendant le premier rendu, un ordre de portées LIFO, une portée libérée quand seul son
propre sous-arbre est démonté, un piège qui arrête le parcours, une portée de base atteinte à
travers ce piège, un composite imbriqué dans une surface qui piège atteint quand les deux passent
`within` et réduit au silence quand aucun ne le fait, une base réenregistrée à un nouveau rendu
sans quitter sa place, et l'ordre
d'ouverture des portées conservé à travers une reconstruction du système. Les adaptateurs qui suivent — Vue,
Svelte et Angular, dans l'ordre
d'[ADR-0011](../adr/0011-package-layout-and-adapters.md) — passent la même suite avant d'être
livrés. L'utilitaire d'auto-montage vanilla livré avant eux, non, et
[ADR-0023](../adr/0023-vanilla-auto-mount.md) est le registre du pourquoi : la suite affirme
ce que fait un fournisseur à travers un rendu, et cet utilitaire n'a ni l'un ni l'autre
([Auto-montage](auto.md)).
