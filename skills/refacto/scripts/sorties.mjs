// Empreinte des sorties d'un script (construction de site, export, conversion, script Python...), pour prouver qu'une
// refactorisation ne change pas ce qu'il produit. Avant : on enregistre. Après : on compare.
// Relevé : code de sortie, sortie écran (normalisée : dates, durées et chemins temporaires masqués), et empreinte de
// chaque fichier produit dans les dossiers ou fichiers surveillés.
//
// Usage : node sorties.mjs <reference.json> --commande "node assembler.mjs" [--produit dossier-ou-fichier]... [--dans dossier]
//   --commande   la commande à lancer, entre guillemets (lancée dans --dans, défaut : dossier courant)
//   --produit    ce que la commande écrit ; répétable. Chaque fichier est comparé à l'octet près.
//   --ecran-libre  ne compare pas la sortie écran (quand elle affiche des durées ou des nombres aléatoires)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const valeurs = (nom) => args.flatMap((a, i) => (a === "--" + nom ? [args[i + 1]] : []));
const reference = args.find((a, i) => !a.startsWith("--") && (!args[i - 1]?.startsWith("--") || args[i - 1] === "--ecran-libre"));
const commande = valeurs("commande")[0];
const dans = path.resolve(valeurs("dans")[0] || ".");
const produits = valeurs("produit").map((p) => path.resolve(dans, p));
if (!reference || !commande) { console.log('Usage : node sorties.mjs <reference.json> --commande "..." [--produit chemin]... [--dans dossier]'); process.exit(2); }

// Date de chaque fichier déjà là avant de lancer la commande : un fichier resté d'une exécution précédente, que la
// commande n'écrit plus, garderait sinon la même empreinte et passerait pour produit
const dateAvant = new Map();
produits.forEach(function dater(p) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) { for (const n of fs.readdirSync(p)) dater(path.join(p, n)); return; }
  dateAvant.set(p, fs.statSync(p).mtimeMs);
});

const r = spawnSync(commande, { cwd: dans, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const normaliser = (t) => (t || "").replace(/\r\n/g, "\n")
  .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?/g, "<date>")
  .replace(/\b\d+([.,]\d+)?\s?(ms|s|secondes?)\b/g, "<durée>")
  .replace(/[A-Z]:\\[^\s]*\\(Temp|tmp)\\[^\s]*/gi, "<temp>");

const fichiers = {}, ecrits = {};
function relever(p) {
  if (!fs.existsSync(p)) { fichiers[path.relative(dans, p)] = "(absent)"; return; }
  if (fs.statSync(p).isDirectory()) { for (const n of fs.readdirSync(p)) relever(path.join(p, n)); return; }
  fichiers[path.relative(dans, p)] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  ecrits[path.relative(dans, p)] = dateAvant.get(p) !== fs.statSync(p).mtimeMs;
}
produits.forEach(relever);
const releve = { commande, code: r.status, ecran: normaliser(r.stdout) + (r.stderr ? "\n[erreurs]\n" + normaliser(r.stderr) : ""), fichiers, ecrits };

if (!fs.existsSync(reference)) {
  fs.writeFileSync(reference, JSON.stringify(releve, null, 1));
  console.log(`Sorties enregistrées : code ${r.status}, ${Object.keys(fichiers).length} fichier(s) produit(s), dans ${reference}`);
  if (r.status !== 0) console.log("Attention : la commande échoue déjà AVANT la refactorisation. Le signaler avant d'aller plus loin.");
} else {
  const ref = JSON.parse(fs.readFileSync(reference, "utf8"));
  const ecarts = [];
  if (ref.code !== releve.code) ecarts.push(`code de sortie : ${ref.code} -> ${releve.code}`);
  if (!args.includes("--ecran-libre") && ref.ecran !== releve.ecran) {
    const a = ref.ecran.split("\n"), b = releve.ecran.split("\n");
    const i = a.findIndex((l, k) => l !== b[k]);
    ecarts.push(`sortie écran, ligne ${i + 1} :\n      avant : ${a[i] ?? "(rien)"}\n      après : ${b[i] ?? "(rien)"}`);
  }
  for (const f of new Set([...Object.keys(ref.fichiers), ...Object.keys(fichiers)])) {
    if (ref.fichiers[f] !== fichiers[f]) ecarts.push(`fichier ${f} : ${!ref.fichiers[f] ? "nouveau" : !fichiers[f] || fichiers[f] === "(absent)" ? "disparu" : "contenu différent"}`);
    else if (ref.ecrits?.[f] && ecrits[f] === false) ecarts.push(`fichier ${f} : présent, mais pas réécrit par cette exécution alors que la commande l'écrivait à l'enregistrement (resté d'une exécution précédente ? vider le dossier produit et relancer pour trancher)`);
  }
  console.log(ecarts.length ? "ÉCARTS\n   - " + ecarts.join("\n   - ") : `Sorties identiques : code ${releve.code}, écran, ${Object.keys(fichiers).length} fichier(s).`);
  process.exitCode = ecarts.length ? 1 : 0;
}
