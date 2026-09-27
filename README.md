# Skill /refacto pour Claude Code

Tu demandes à Claude de ranger le code d'une page. Il le fait. Mais comment savoir qu'il n'a rien cassé ?

Pendant longtemps, ma méthode était très scientifique : je regardais la page et je disais « ça a l'air bon ». Regarder ne prouve rien. Ce skill mesure.

Avant de toucher au code, il prend une photo de la page : la place et la couleur de chaque élément, plus une capture complète. Sur téléphone et sur ordinateur, en clair et en sombre, menu ouvert et fermé. Après chaque changement, il reprend la photo et compare. Si un pixel a bougé, il te le dit.

## Ce qu'il fait

| Étape | Ce qui se passe |
|---|---|
| 1. La photo | Il photographie la page dans tous ses états, avant de toucher à quoi que ce soit |
| 2. L'inventaire | Il liste ce qui traîne : code qui ne sert plus, blocs en double, couleurs répétées partout |
| 3. Le rangement | Il range par petits lots. Après chaque lot, il compare. Un écart ? Il annule |
| 4. Les bugs | Il te montre ceux qu'il trouve en route. Il n'y touche pas sans ton accord |
| 5. Le ménage | Il enlève ses fichiers de travail et relance une dernière comparaison |

Ça marche pour une page HTML, un site entier, une petite appli, un script Node ou Python, et même le code d'un nœud n8n.

Sur ma dernière appli, il a comparé 86 écrans avant et après. Tous identiques.

## Installer

Dans Claude Code :

```
/plugin marketplace add Lilcifer75018/skill-refacto
/plugin install refacto@lilian-barty-refacto
```

Sans plugin, ça marche aussi : copie le dossier `skills/refacto` dans `~/.claude/skills/`.

Il te faut Node 18 ou plus, et Puppeteer pour les photos de page :

```
npm install -g puppeteer
```

Pour vérifier que tout marche chez toi :

```
node skills/refacto/scripts/auto-test.mjs
```

Tu dois lire « 22 contrôles, 0 échec ».

## Utiliser

- `/refacto ma-page.html`
- `/refacto mon-site/`
- ou simplement « refactorise ce script »

Claude te montre d'abord un court mode d'emploi, puis il se met au travail.

## Ce qu'il ne fait pas

- Il ne rend pas ton code meilleur par magie. Il garantit qu'en le rangeant, rien ne casse. Un bug présent avant sera encore là après (mais tu le sauras).
- Il ne corrige pas les bugs en douce. Il les liste, et c'est toi qui décides.
- Il ne change pas le design. Le but, c'est que rien ne bouge à l'écran.
- Il ne met rien en ligne et n'enregistre rien dans git sans toi.
- Il ne tourne pas dans l'app Claude sur le web : il a besoin de Node et d'un navigateur sur ta machine.

## Qui l'a fait

Lilian Barty-Christophe, consultant freelance en IA à Paris. J'installe des outils IA chez des indépendants et dans des entreprises, puis je forme les équipes qui s'en servent.

Je fais écrire beaucoup de code à Claude, pour mon site et pour mes outils. Ce skill est né d'une mauvaise surprise : un petit changement avait fait disparaître le bouton clair/sombre de 21 pages de mon site. Sur la page d'accueil, tout avait l'air bon. Normal, c'était la seule page que ce changement ne touchait pas.

Le site : [lilian-barty.fr](https://www.lilian-barty.fr/)

## In English

`/refacto` is a Claude Code skill for cleaning up the code of web pages, small apps and scripts without breaking them.

Before touching anything, it takes a snapshot of the page: the DOM, the computed style of each element, the focused element and a full screenshot. It does this at 375 and 1440 px, in light and dark mode, and in every state you list (menu open, form filled). After each small batch of changes, it takes the snapshot again and compares, pixel by pixel. If it finds a bug on the way, it tells you and leaves it alone.

It comes with a dead-code finder and a self-test. The skill is in French. MIT license.

## Licence

MIT
