# React

`@standarx/nav/react` est le même système à une instance par arbre, avec un fournisseur autour. Les
moteurs ne sont délibérément pas importés par l'adaptateur, si bien qu'une application qui ne
mentionne jamais de manette ne paie pas un octet pour elle — vous construisez les plugins et vous
les passez.

```tsx
import { useMemo, useState } from "react";
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
  useIntent(
    (event) => {
      if (event.intent !== "back") return false;
      onClose();
      return true;
    },
    { trapped: true },
  );

  return <div data-snav="container" data-snav-trap>…</div>;
}
```

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
| `useIntent(handler, options?)` | Empile une portée d'intention pour la durée de vie du composant. Le gestionnaire est lu à travers une ref, donc une fonction fléchée inline ne dépile pas et ne réempile pas la portée — ce qui la réordonnerait silencieusement sous tout ce qui a été empilé depuis. |
| `useInputSystem()` | Le système, ou `null`. |
| `useIntentScopeHost()` | Un hôte stable pour toute la vie du composant, pour une machine à états qui installe ses effets en entrant dans un état et n'a pas de tableau de dépendances pour se relancer. |
| `useInputModality()` | `keyboard` \| `pointer` \| `touch` \| `gamepad`. Fonctionne sans fournisseur au-dessus : le magasin de modalité est compté par référence par document, donc un composant qui veut seulement savoir s'il doit dessiner un anneau paie un traqueur, pas un système d'entrée. |
| `NavDocumentProvider` | Nécessaire seulement quand l'arbre ne vit pas dans le document de la page elle-même — une iframe, une popup, une fixture de test. |

`useInputSystem()` répond `null` tant que l'effet du fournisseur n'a pas tourné, et `null` est
aussi ce qu'il répond côté serveur et sans fournisseur : `createInputSystem` a besoin d'un document
et installe des écouteurs en phase de capture, donc cela ne peut pas se produire pendant le rendu,
et les enfants sont rendus une fois avec `null`. `useIntent` s'en charge lui-même — il se relance
quand le système arrive — et n'avertit en développement que lorsqu'il n'y a réellement aucun
fournisseur au-dessus.

`react` et `react-dom` sont des dépendances pair **optionnelles** en `>=18.3.0` ; rien en dehors de
`src/react/` ne les importe, et l'adaptateur est mesuré avec React en externe. Le plancher de cette
plage est construit, vérifié par les types et exécuté pour de vrai : un job CI réinstalle React 18.3
par-dessus le 19 du lockfile et lance la suite navigateur contre lui, parce que tous les autres jobs
installent en `--frozen-lockfile` et n'auraient jamais exercé le 18.

L'adaptateur est tenu à une suite partagée plutôt qu'à des tests de sa propre invention :
`src/adapter-parity.ts` est le contrat que tout adaptateur de framework doit satisfaire — un seul
système et pas pendant le premier rendu, un ordre de portées LIFO, une portée libérée quand seul son
propre sous-arbre est démonté, un piège qui arrête le parcours, une portée de base atteinte à
travers ce piège, et une base réenregistrée à un nouveau rendu. Les adaptateurs qui suivent — Vue,
Svelte et Angular, dans l'ordre
d'[ADR-0011](../adr/0011-package-layout-and-adapters.md) — passent la même suite avant d'être
livrés. L'utilitaire d'auto-montage vanilla livré avant eux, non, et
[ADR-0023](../adr/0023-vanilla-auto-mount.md) est le registre du pourquoi : la suite affirme
ce que fait un fournisseur à travers un rendu, et cet utilitaire n'a ni l'un ni l'autre
([Auto-montage](auto.md)).
