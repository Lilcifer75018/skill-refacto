# Versions

## 1.2.0, le 28 septembre 2026

- Animations neutralisées aussi sur les pages qui rangent leurs règles dans des couches CSS : la feuille de neutralisation passe dans une couche déclarée la première. Jusqu'ici, le « mouvement réduit » d'une appli Tailwind v4 l'emportait.
- Règle de sécurité stricte (Content-Security-Policy) : quand elle bloque la neutralisation, la mesure s'arrête et le dit, au lieu de produire des captures instables. Nouvelle option `--contourner-csp` pour lever la règle dans le navigateur de test.
- Souris ramenée dans un coin avant chaque relevé : un clic du scénario ne laisse plus de survol sur l'écran suivant. `capturer(nom, { garderSouris: true })` conserve un survol voulu.
- Auto-test : 36 contrôles.
- Une référence enregistrée avec une version antérieure peut montrer des écarts de survol ou d'animation : l'enregistrer à nouveau avant de commencer.

## 1.1.0, le 27 septembre 2026

- Exploration automatique (`--explorer`) : chaque bouton, onglet, menu déroulant et lien interne est ouvert et capturé, sans jamais cliquer une action destructive ni un envoi de formulaire.
- Accessibilité : l'arbre lu par les lecteurs d'écran est comparé dans chaque état.
- Poids et vitesse : requêtes, poids brut et compressé, temps d'affichage, avec la variation en comparaison.
- Rapport visuel : captures avant et après, image des différences, poids, bruit de rendu et états identiques, dans une page autonome.
- Seuil de bruit de rendu (`--seuil-pixel`), capture à l'écran pour les applis à défilement interne, adresse du serveur de test retirée des styles relevés.
- Auto-test : 29 contrôles.

## 1.0.1, le 27 septembre 2026

- Documentation réécrite : principe, éléments comparés, familles de constats, déroulé complet, outils, installation et limites, avec schémas.
- Mode d'emploi du skill au vouvoiement.

## 1.0.0, le 27 septembre 2026

Première version publique.

- Cinq outils : empreinte d'une page ou d'un site entier, sorties d'un script, vérification de la syntaxe, inventaire du code mort, auto-test.
- Une grille de lecture pour HTML, CSS, JavaScript, les scripts Node et Python, et les nœuds Code n8n.
- Installation par plugin dans Claude Code.
