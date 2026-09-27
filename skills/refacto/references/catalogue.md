# Grille de lecture par langage

Chaque ligne se lit ainsi : ce qu'on repère, ce qu'on en fait, et le piège. La colonne « Famille » dit si c'est du **rangement** (sans effet visible, se fait sans demander) ou une **correction** (change quelque chose pour l'utilisateur : se liste et se soumet à l'utilisateur). Charger seulement la section du langage concerné.

## HTML

| Ce qu'on repère | Ce qu'on en fait | Famille | Piège |
|---|---|---|---|
| Même bloc répété (carte, ligne de tableau, élément de liste) avec seulement le contenu qui change | Un gabarit (`<template>` ou fonction qui fabrique le bloc) alimenté par les données | Rangement | L'ordre des attributs et les espaces changent le DOM relevé par l'empreinte : reproduire le balisage d'origine à l'identique |
| Même en-tête, pied de page ou script dans plusieurs pages | Morceaux communs et petit script de construction (voir SKILL.md) | Rangement | Deux exemplaires de chaque page, qui divergent si on édite la page servie |
| Styles écrits dans l'attribut `style` d'éléments, répétés | Une classe | Rangement | Un `style` en ligne gagne sur la feuille : vérifier la cascade à l'empreinte |
| Textes écrits dans le code JavaScript | Un seul fichier de données (textes, libellés, messages) | Rangement | Les apostrophes et guillemets ne demandent plus d'échappement dans un fichier de données : un gain à lui seul |
| `div` cliquable, bouton sans libellé, image sans `alt`, titres qui sautent un niveau | À lister | Correction | L'arbre d'accessibilité change : ce n'est pas du rangement, même si l'écran reste identique |
| Identifiants en double dans une page | À lister | Correction | `getElementById` ne renvoie que le premier : le corriger change le comportement |
| Ordre des scripts, script en tout début de `<head>` | Ne pas toucher sans raison | Décision | Un script de thème en tête de page évite le flash au chargement : il n'est pas redondant |

## CSS

| Ce qu'on repère | Ce qu'on en fait | Famille | Piège |
|---|---|---|---|
| Classe, identifiant, variable ou `@keyframes` que `code-mort.mjs` signale | Confirmer par recherche du nom ET de son préfixe dans tout le projet, puis supprimer | Rangement | Noms fabriqués en JavaScript (`'etat-' + x`) ; autres pages du site qui partagent la feuille |
| Même valeur (couleur, taille, espacement, durée) répétée | Une variable, et une échelle : quelques tailles de texte, quelques espacements, trois durées d'animation | Rangement | Une couleur passée en variable doit avoir sa valeur sombre ; une couleur codée en dur qui casse le thème sombre relève de la correction |
| Mêmes déclarations sous plusieurs sélecteurs | Regrouper les sélecteurs, ou une classe commune | Rangement | Faux jumeaux : même nom, valeurs différentes. Ne regrouper que le strictement identique |
| Sélecteur déclaré deux fois dans le même fichier | Fusionner à la place de la seconde déclaration | Rangement | L'ordre compte : fusionner à l'endroit de la DERNIÈRE occurrence, sinon une règle intermédiaire peut gagner |
| `!important` en série | Remonter la cause (spécificité, ordre des feuilles) | Rangement | `[hidden]{display:none!important}` est un `!important` légitime : le garder |
| Règle `display` sur un élément qui porte parfois `hidden` | Garder ou ajouter `[hidden]{display:none!important}` | Correction si le défaut est visible aujourd'hui | Sur une appli réelle, un tampon « Embauché » restait affiché en permanence pour cette raison |
| Media queries éparpillées pour une même largeur | Les regrouper par point de rupture | Rangement | L'ordre dans la cascade change : vérifier à 375 et 1440 px |
| Feuille commune envisagée pour plusieurs pages | Chiffrer d'abord : Ko compressés, requête bloquante en plus | Décision | Sur lilian-barty.fr, le CSS écrit dans chaque page est un choix acté, sauf pour trois pages assez proches pour partager un socle |
| Préfixes navigateur obsolètes (`-webkit-box-shadow`...) | Supprimer | Rangement | Certains restent utiles (`-webkit-backdrop-filter` sur Safari, `-webkit-text-size-adjust`) : vérifier sur caniuse avant |

## JavaScript

| Ce qu'on repère | Ce qu'on en fait | Famille | Piège |
|---|---|---|---|
| Fonction jamais appelée | Confirmer (appel depuis le HTML `onclick`, un autre fichier, une chaîne) puis supprimer | Rangement | Les appels par nom dans une chaîne (`window[nom]()`) ne se voient pas à la recherche |
| `document.querySelectorAll(...).forEach` répété | Une petite aide (`tous(sel)`) | Rangement | Garder le style du projet : pas de bibliothèque ajoutée pour ça |
| Même nombre écrit à plusieurs endroits (nombre d'étapes, délai) | Une constante unique | Rangement | Un délai modifié change le ressenti : même valeur, pas de « tant qu'on y est » |
| Mises à jour de l'affichage dispersées après chaque action | Une fonction `redessiner()` qui part de l'état | Rangement | Le focus : redessiner peut faire perdre l'élément qui avait le focus. L'empreinte le relève |
| État éparpillé dans des variables globales et des attributs | Un objet d'état unique, sauvegardé à un seul endroit | Rangement | La clé de stockage (`localStorage`) ne change jamais de nom : les visiteurs perdraient leur progression |
| Écouteurs posés sur chaque élément d'une liste | Délégation sur le parent (`data-action`) | Rangement | Les éléments ajoutés après coup : la délégation les couvre, l'ancien code peut-être pas. Vérifier que c'était déjà le cas |
| `innerHTML` avec une donnée saisie par l'utilisateur | À lister | Correction | Faille d'injection : jamais « rangée » en silence |
| Erreur avalée (`catch (e) {}`) | À lister si elle cache un défaut réel | Correction | Certaines sont voulues (stockage indisponible en navigation privée) : garder celles-là |
| Syntaxe ancienne (`var`, `function` partout) | Moderniser seulement si tout le fichier suit | Rangement | Mélanger deux styles dans un fichier est pire que l'ancien style seul |

## Scripts Node et Python (construction, export, conversion)

| Ce qu'on repère | Ce qu'on en fait | Famille | Piège |
|---|---|---|---|
| Chemins écrits en dur | Constantes en tête de fichier, calculées depuis l'emplacement du script | Rangement | Le script doit continuer de marcher lancé depuis un autre dossier : `sorties.mjs --dans` le vérifie |
| Même traitement copié pour plusieurs fichiers | Une fonction et une boucle | Rangement | L'ordre de traitement peut changer l'ordre d'écriture des fichiers : les sorties comparées à l'octet le montrent |
| Script qui écrit même quand une étape a échoué | À lister | Correction | Refuser d'écrire une page dont un script est cassé change le comportement : correction validée d'abord |
| Scripts PowerPoint (python-pptx) | Garder le source en ASCII, réécrire en bloc | Rangement | La typographie Unicode fait échouer les remplacements partiels ; et ne jamais regénérer un .pptx retouché à la main, les retouches seraient perdues |
| Fichier écrit par PowerShell | Réécrire avec Write ou Edit | Rangement | PowerShell 5.1 écrit en UTF-16 : accents cassés |

## Nœuds Code n8n

| Ce qu'on repère | Ce qu'on en fait | Famille | Piège |
|---|---|---|---|
| Code long dans un seul nœud | Fonctions nommées dans le même nœud | Rangement | Un nœud Code ne partage rien avec les autres : pas de module commun possible |
| Données statiques écrites dans le code | Une table de données n8n | Décision | Les données statiques des nœuds Code ne sont pas conservées ; mais changer la source des données change le workflow : validation de l'utilisateur |
| Secret en clair (clé, jeton) | À lister immédiatement | Correction | Un nœud Code ne lit pas les credentials : la bonne correction passe par les identifiants (credentials) des nœuds natifs |
| Workflow publié | Rien ne se publie sans feu vert | Décision | En n8n v2, on publie au lieu d'activer : une modification non publiée ne tourne pas |

Preuve pour un nœud Code : un harnais local qui simule `$input.all()` avec les éléments d'une exécution réelle, lancé par `sorties.mjs` avant et après.
