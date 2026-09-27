// Auto-test des outils du skill : un outil de preuve qui ment est pire que pas d'outil (un contrôle de prix aveugle a
// déjà annoncé « aucun écart » pendant des semaines). À lancer après toute modification d'un script, et au premier
// usage sur un nouveau poste : node auto-test.mjs
// Fabrique un petit site de test dans un dossier temporaire, puis vérifie que chaque outil voit ce qu'il doit voir,
// et ne voit rien quand il n'y a rien à voir.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const T = fs.mkdtempSync(path.join(os.tmpdir(), "refacto-auto-test-"));
let echecs = 0, controles = 0;
let r = { texte: "" };
const verifier = (vrai, message) => {
  controles++;
  if (vrai) { console.log("ok     " + message); return; }
  echecs++;
  console.log("ÉCHEC  " + message + "\n       sortie de l'outil : " + r.texte.trim().split("\n").slice(0, 12).join("\n       "));
};
const lancer = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(ICI, script), ...args], { cwd: T, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, texte: (r.stdout || "") + (r.stderr || "") };
};
const ecrire = (f, t) => { fs.mkdirSync(path.dirname(path.join(T, f)), { recursive: true }); fs.writeFileSync(path.join(T, f), t); };

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test</title>
<style>
:root{--fond:#fff;--texte:#222;--accent:#c33;--inutile:3px}
@media (prefers-color-scheme:dark){:root{--fond:#111;--texte:#eee}}
body{background:var(--fond);color:var(--texte);font-family:sans-serif;margin:0;padding:16px}
.bouton{background:#c33;color:#fff;padding:8px 12px;border-radius:6px}
.lien-fort{background:#c33;color:#fff;padding:8px 12px;border-radius:6px}
.jamais-posee{color:red}
.etat-ouvert{outline:1px solid}
.menu{display:none}
.menu.ouvert{display:block;animation:glisse .3s}
@keyframes glisse{from{opacity:0}to{opacity:1}}
@keyframes oubliee{from{opacity:0}to{opacity:1}}
h1{font-size:28px}
h1{margin-top:0}
</style></head><body>
<h1>Bonjour</h1>
<button id="menu-bouton" class="bouton">Menu</button>
<nav class="menu" id="menu"><a class="lien-fort" href="#">Un lien</a></nav>
<img src="img/logo.png" alt="">
<script>
function basculer(){ document.getElementById('menu').classList.toggle('ouvert'); }
function jamaisAppelee(){ return 1; }
const suffixe = "ouvert"; const etat = "etat-" + suffixe;
document.getElementById('menu-bouton').addEventListener('click', basculer);
</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Test"}</script>
<button id="effacer" type="button">Tout effacer</button>
</body></html>
`;
ecrire("site/index.html", PAGE);
ecrire("site/contact/index.html", PAGE.replace("Bonjour", "Contact"));
ecrire("site/img/logo.png", "x");
ecrire("site/img/orpheline.png", "x");
ecrire("etats.mjs", `export default async function (page, { capturer, clic }) { await capturer("chargement"); await clic("#menu-bouton"); await capturer("menu-ouvert"); }\n`);

// 1. Syntaxe
r = lancer("verifier-syntaxe.mjs", ["site"]);
verifier(r.code === 0 && /aucune erreur/.test(r.texte), "syntaxe : un site sain passe");
ecrire("casse/index.html", PAGE.replace("return 1;", "return 'l'apostrophe';"));
r = lancer("verifier-syntaxe.mjs", ["casse"]);
verifier(r.code === 1 && /ligne 23 de la page/.test(r.texte), "syntaxe : l'apostrophe non protégée est trouvée, à la bonne ligne");
ecrire("casse2/donnees.json", "{ \"a\": 1, }");
r = lancer("verifier-syntaxe.mjs", ["casse2"]);
verifier(r.code === 1 && /JSON invalide/.test(r.texte), "syntaxe : un JSON invalide est trouvé");

// 2. Code mort
r = lancer("code-mort.mjs", ["site"]);
const t = r.texte;
verifier(/\.jamais-posee/.test(t), "code mort : classe jamais posée");
verifier(/etat-ouvert \(le code fabrique/.test(t), "code mort : classe fabriquée par concaténation classée à part, pas déclarée morte");
verifier(/--inutile/.test(t) && /--accent/.test(t) && !/^- --fond/m.test(t), "code mort : variables CSS inutilisées, et seulement elles");
verifier(/oubliee/.test(t) && !/^- glisse/m.test(t), "code mort : @keyframes inutilisée, et seulement elle");
verifier(/\.bouton {2}\| {2}\.lien-fort/.test(t), "code mort : déclarations identiques sous deux sélecteurs");
verifier(/h1 {2}\(2 fois/.test(t), "code mort : sélecteur déclaré deux fois");
verifier(/jamaisAppelee/.test(t) && !/^- basculer/m.test(t), "code mort : fonction jamais appelée, et seulement elle");
verifier(/orpheline\.png/.test(t) && !/logo\.png/.test(t), "code mort : image orpheline, et seulement elle");
r = lancer("code-mort.mjs", ["site", "--exclure", "contact"]);
verifier(/Inventaire de 3 fichier/.test(r.texte), "code mort : --exclure écarte les fichiers générés");

// 3. Empreinte d'une page : stable, insensible à un rangement neutre, sensible à 2 px de marge
r = lancer("empreinte.mjs", ["site/index.html", "ref.json", "--etats", "etats.mjs"]);
verifier(r.code === 0 && /8 états \(375, 1440 px ; clair, sombre\)/.test(r.texte), "empreinte : 2 états x 2 largeurs x 2 thèmes enregistrés (thème sombre détecté seul)");
verifier(/page : [1-9]\d* requête\(s\), [\d,]+ Ko compressés, [\d,]+ Ko bruts/.test(r.texte), "poids : requêtes, poids compressé et poids brut relevés au chargement");
r = lancer("empreinte.mjs", ["site/index.html", "ref.json", "--etats", "etats.mjs"]);
verifier(r.code === 0 && /identiques/.test(r.texte), "empreinte : deux mesures à vide sont identiques (mesure stable)");
const range = PAGE
  .replace(".bouton{background:#c33;color:#fff;padding:8px 12px;border-radius:6px}\n.lien-fort{background:#c33;color:#fff;padding:8px 12px;border-radius:6px}", ".bouton,.lien-fort{background:var(--accent);color:#fff;padding:8px 12px;border-radius:6px}")
  .replace("h1{font-size:28px}\nh1{margin-top:0}", "h1{font-size:28px;margin-top:0}")
  .replace(".jamais-posee{color:red}\n", "").replace("@keyframes oubliee{from{opacity:0}to{opacity:1}}\n", "")
  .replace("function jamaisAppelee(){ return 1; }\n", "");
ecrire("site/index.html", range);
r = lancer("empreinte.mjs", ["site/index.html", "ref.json", "--etats", "etats.mjs"]);
verifier(r.code === 0 && /identiques \(DOM, styles, accessibilité, focus, pixels\)/.test(r.texte), "empreinte : un rangement sans effet visible est reconnu identique");
verifier(/avant : \d+ requête\(s\), [\d,]+ Ko compressés \((identique|[+-]?[\d,]+ %)\)/.test(r.texte), "poids : la comparaison donne le poids d'avant et la variation");
ecrire("site/index.html", range.replace("padding:8px 12px", "padding:8px 14px"));
r = lancer("empreinte.mjs", ["site/index.html", "ref.json", "--etats", "etats.mjs"]);
verifier(r.code === 1 && /padding : 8px 12px -> 8px 14px/.test(r.texte) && /pixel\(s\) différent\(s\)/.test(r.texte), "empreinte : 2 px de marge en plus sont vus, dans les styles et dans les pixels");
const rapport = fs.existsSync(path.join(T, "ref.rapport.html")) ? fs.readFileSync(path.join(T, "ref.rapport.html"), "utf8") : "";
const imagesEcarts = fs.existsSync(path.join(T, "ref.ecarts")) ? fs.readdirSync(path.join(T, "ref.ecarts")).length : 0;
verifier(/États avec écart/.test(rapport) && /alt="Différences"/.test(rapport) && imagesEcarts > 0, "rapport : page écrite, avec les captures avant, après et l'image des différences");
ecrire("site/index.html", range.replace('class="bouton">Menu', 'class="bouton">Menu ').replace("</nav>", "</nav><p hidden>x</p>"));
r = lancer("empreinte.mjs", ["site/index.html", "ref.json", "--etats", "etats.mjs", "--sans-captures"]);
verifier(r.code === 1 && /DOM, premier écart/.test(r.texte), "empreinte : un changement du DOM invisible à l'oeil est vu");
ecrire("site/index.html", range.replace('class="bouton">Menu', 'class="bouton" aria-label="Ouvrir le menu">Menu'));
r = lancer("empreinte.mjs", ["site/index.html", "ref.json", "--etats", "etats.mjs", "--sans-captures"]);
verifier(r.code === 1 && /accessibilité, disparu : button "Menu"/.test(r.texte) && /accessibilité, apparu : button "Ouvrir le menu"/.test(r.texte), "accessibilité : un nom de bouton changé pour les lecteurs d'écran est vu");

// 3 bis. Exploration : un défaut qui n'existe que menu ouvert échappe à une mesure sans scénario, pas à --explorer
ecrire("site/index.html", PAGE);
r = lancer("empreinte.mjs", ["site/index.html", "explo-sans.json", "--sans-captures", "--largeurs", "375"]);
r = lancer("empreinte.mjs", ["site/index.html", "explo.json", "--explorer", "--sans-captures", "--largeurs", "375"]);
verifier(r.code === 0 && /button#effacer « Tout effacer » \(action destructive\)/.test(r.texte), "exploration : un bouton destructif n'est jamais cliqué, et il est signalé");
ecrire("site/index.html", PAGE.replace("classList.toggle('ouvert')", "classList.toggle('ouverte')"));
r = lancer("empreinte.mjs", ["site/index.html", "explo-sans.json", "--sans-captures", "--largeurs", "375"]);
verifier(r.code === 0, "exploration : sans elle, le menu cassé passe inaperçu (limite connue d'un scénario incomplet)");
r = lancer("empreinte.mjs", ["site/index.html", "explo.json", "--explorer", "--sans-captures", "--largeurs", "375"]);
verifier(r.code === 1 && /ÉCART ouvert : button#menu-bouton « Menu »/.test(r.texte), "exploration : avec elle, le menu cassé est vu dans l'état « menu ouvert »");

// 4. Empreinte du site entier
ecrire("site/index.html", PAGE);
r = lancer("empreinte.mjs", ["site", "site.json", "--toutes-pages", "--sans-captures", "--largeurs", "375"]);
verifier(r.code === 0 && /2 page\(s\) trouvée\(s\)/.test(r.texte) && /4 états/.test(r.texte), "empreinte : --toutes-pages trouve seul les 2 pages");
ecrire("site/contact/index.html", PAGE.replace("Bonjour", "Contact").replace("font-size:28px", "font-size:30px"));
r = lancer("empreinte.mjs", ["site", "site.json", "--toutes-pages", "--sans-captures", "--largeurs", "375"]);
verifier(r.code === 1 && /ÉCART contact\/index\.html \| chargement/.test(r.texte) && !/ÉCART index\.html/.test(r.texte), "empreinte : l'écart est attribué à la bonne page, et à elle seule");

// 5. Sorties d'un script
ecrire("build.mjs", `import fs from "node:fs"; fs.mkdirSync("dist",{recursive:true}); for (const n of ["a","b"]) fs.writeFileSync("dist/"+n+".txt", n.toUpperCase()); console.log("Construit le " + new Date().toISOString() + " en " + (Math.random()*50|0) + " ms");\n`);
r = lancer("sorties.mjs", ["sorties.json", "--commande", "node build.mjs", "--produit", "dist"]);
verifier(r.code === 0 && /2 fichier/.test(r.texte), "sorties : enregistrement");
r = lancer("sorties.mjs", ["sorties.json", "--commande", "node build.mjs", "--produit", "dist"]);
verifier(r.code === 0 && /identiques/.test(r.texte), "sorties : dates et durées masquées, deux exécutions identiques");
ecrire("build.mjs", fs.readFileSync(path.join(T, "build.mjs"), "utf8").replace("toUpperCase()", "toUpperCase()+'!'"));
r = lancer("sorties.mjs", ["sorties.json", "--commande", "node build.mjs", "--produit", "dist"]);
verifier(r.code === 1 && /dist.a\.txt : contenu différent/.test(r.texte), "sorties : un fichier produit différent est vu");

fs.rmSync(T, { recursive: true, force: true });
console.log(`\n${controles} contrôles, ${echecs} échec(s)`);
process.exitCode = echecs ? 1 : 0;
