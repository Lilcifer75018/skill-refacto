// Inventaire du code probablement mort et des doublons d'un projet web (HTML, CSS, JavaScript).
// C'est un repérage, pas un verdict : chaque ligne est un suspect à confirmer avant suppression (un nom peut être
// construit dynamiquement, appelé depuis une autre page ou par un outil tiers).
//
// Ce qui est cherché :
//   - classes et identifiants stylés dans le CSS mais présents nulle part dans le HTML ni le JavaScript ;
//   - variables CSS déclarées jamais lues, et lues jamais déclarées (sans valeur de repli) ;
//   - @keyframes jamais utilisées, et animations qui appellent des @keyframes inexistantes ;
//   - blocs de déclarations identiques sous plusieurs sélecteurs, et sélecteurs déclarés deux fois au même niveau ;
//   - fonctions, classes et constantes JavaScript nommées une seule fois dans tout le projet (déclarées, jamais appelées) ;
//   - fichiers (images, polices, styles, scripts) que rien ne référence.
//
// Usage : node code-mort.mjs <dossier ou fichiers...> [--exclure morceau-de-chemin]... [--pas-de-fichiers]
//   --exclure : écarte les fichiers GÉNÉRÉS (page assemblée, dossier de sortie), sinon tout y apparaît en double
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const exclus = args.flatMap((a, i) => (a === "--exclure" ? [args[i + 1]] : []));
const cibles = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--exclure");
if (!cibles.length) { console.log("Usage : node code-mort.mjs <dossier ou fichiers...> [--exclure morceau-de-chemin]... [--pas-de-fichiers]"); process.exit(2); }

const IGNORES = new Set(["node_modules", ".git", ".vercel", ".next", "__pycache__"]);
// Les fichiers TypeScript, JSX et de composants comptent comme « code qui utilise » : sans eux, toutes les classes d'une
// appli React ou Vue sortiraient mortes
const SCRIPTS = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx"];
const TEXTE = new Set([...SCRIPTS, ".vue", ".svelte", ".astro", ".html", ".htm", ".css", ".json", ".webmanifest", ".svg", ".md", ".xml", ".txt", ".py", ".php"]);
const RESSOURCES = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".css", ".js", ".mjs", ".mp4", ".webm", ".pdf"]);
const tous = [];
function parcourir(p) {
  const s = fs.statSync(p);
  if (s.isDirectory()) { for (const n of fs.readdirSync(p)) if (!IGNORES.has(n) && !n.startsWith(".")) parcourir(path.join(p, n)); }
  else if (!exclus.some((x) => p.includes(x))) tous.push(p);
}
for (const c of cibles) parcourir(path.resolve(c));
const lire = (f) => fs.readFileSync(f, "utf8");
const ext = (f) => path.extname(f).toLowerCase();

// Corpus : le CSS d'un côté (fichiers .css + blocs <style>), le « code qui utilise » de l'autre (HTML sans ses <style>, JS)
let css = [];
let usages = "";
let js = [];
for (const f of tous.filter((f) => TEXTE.has(ext(f)))) {
  const t = lire(f);
  if (ext(f) === ".css") css.push({ f, t });
  else if (ext(f) === ".html" || ext(f) === ".htm") {
    let i = 0;
    const sansStyle = t.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m, bloc) => { css.push({ f: `${f} <style> n°${++i}`, t: bloc }); return ""; });
    usages += "\n" + sansStyle;
    sansStyle.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (m, code) => { js.push({ f, t: code }); return ""; });
  } else {
    usages += "\n" + t;
    if (SCRIPTS.includes(ext(f))) js.push({ f, t });
  }
}
const cssTout = css.map((c) => c.t).join("\n");

// Déclarations d'une règle, sans les blocs imbriqués qu'elle contient
function sansBlocs(corps) {
  let sortie = "", prof = 0, debut = 0;
  for (let k = 0; k < corps.length; k++) {
    if (corps[k] === "{") { if (!prof) { sortie += corps.slice(debut, corps.lastIndexOf(";", k) + 1); } prof++; }
    else if (corps[k] === "}") { prof--; if (!prof) debut = k + 1; }
  }
  return sortie + corps.slice(debut);
}
// Analyse CSS : règles (sélecteur + déclarations) avec leur contexte (@media...), @keyframes à part
function analyser(texte, contexte = "", regles = [], keyframes = []) {
  texte = texte.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < texte.length) {
    const ouvre = texte.indexOf("{", i);
    if (ouvre < 0) break;
    // Le sélecteur commence après le dernier point-virgule : ce qui précède est une instruction sans bloc (@import,
    // @charset, « @layer a, b; ») ou, dans une règle imbriquée, les déclarations du parent. Sans cela, la première
    // règle qui suit un @import était avalée avec lui
    const tete = texte.slice(i, ouvre).split(";").pop().trim().replace(/^[}\s]+/, "");
    let prof = 1, j = ouvre + 1;
    while (j < texte.length && prof) { if (texte[j] === "{") prof++; else if (texte[j] === "}") prof--; j++; }
    const corps = texte.slice(ouvre + 1, j - 1);
    if (/^@(-webkit-)?keyframes/i.test(tete)) keyframes.push(tete.split(/\s+/)[1]);
    else if (/^@(media|supports|container|layer|document|scope|starting-style)/i.test(tete)) analyser(corps, tete, regles, keyframes);
    else if (!tete.startsWith("@")) {
      // Règles imbriquées (.carte { ... .titre { ... } }) : le parent garde ses déclarations, les enfants sont lus à part
      regles.push({ selecteur: tete, corps: sansBlocs(corps).trim(), contexte });
      if (corps.includes("{")) analyser(corps, (contexte + " " + tete).trim(), regles, keyframes);
    }
    i = j;
  }
  return { regles, keyframes };
}
const parSource = css.map((c) => ({ ...c, ...analyser(c.t) }));
const regles = parSource.flatMap((s) => s.regles.map((r) => ({ ...r, f: s.f })));
const keyframes = new Set(parSource.flatMap((s) => s.keyframes));

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const present = (nom, texte) => new RegExp(`(?<![\\w-])${echapper(nom)}(?![\\w-])`).test(texte);
// Un nom « prefixe-suite » peut être fabriqué en JS : "prefixe-" + x, `prefixe-${x}`
const peutEtreConstruit = (nom) => {
  const morceaux = nom.split("-");
  for (let k = morceaux.length - 1; k > 0; k--) {
    const prefixe = morceaux.slice(0, k).join("-") + "-";
    if (new RegExp(`["'\`]${echapper(prefixe)}(["'\`]|\\$\\{)`).test(usages)) return prefixe;
  }
  return null;
};

const sortie = [];
const section = (titre, lignes) => { if (lignes.length) sortie.push(`\n## ${titre} (${lignes.length})\n` + lignes.map((l) => "- " + l).join("\n")); };

// 1. Classes et identifiants
const classes = new Map(), ids = new Map();
for (const r of regles) {
  const sel = r.selecteur.replace(/\[[^\]]*\]/g, "").replace(/url\([^)]*\)/g, "");
  for (const m of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!classes.has(m[1])) classes.set(m[1], r.f);
  for (const m of sel.matchAll(/#(-?[_a-zA-Z][\w-]*)/g)) if (!ids.has(m[1])) ids.set(m[1], r.f);
}
const mortes = [], douteuses = [];
for (const [c, f] of classes) if (!present(c, usages)) { const p = peutEtreConstruit(c); (p ? douteuses : mortes).push(p ? `.${c} (le code fabrique des noms en « ${p} » : à vérifier)` : `.${c}  (${path.basename(f)})`); }
for (const [i, f] of ids) if (!present(i, usages)) mortes.push(`#${i}  (${path.basename(f)})`);
section("Classes et identifiants stylés mais jamais posés", mortes);
section("Classes peut-être fabriquées par le script", douteuses);

// 2. Variables CSS
const declarees = new Set([...(cssTout + usages).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const setProp = new Set([...usages.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)].map((m) => m[1]));
const lues = new Set([...(cssTout + usages).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
const sansRepli = new Set([...(cssTout + usages).matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]));
section("Variables CSS déclarées, jamais lues", [...declarees].filter((v) => !lues.has(v) && !new RegExp(`["'\`]${echapper(v)}["'\`]`).test(usages)));
section("Variables CSS lues sans être déclarées ni avoir de valeur de repli", [...sansRepli].filter((v) => !declarees.has(v) && !setProp.has(v)));

// 3. Animations
const nomsAnimes = new Set();
for (const m of (cssTout + usages).matchAll(/animation(?:-name)?\s*:\s*([^;}"'`]+)/g)) for (const mot of m[1].split(/[\s,]+/)) nomsAnimes.add(mot);
for (const m of usages.matchAll(/animationName\s*=\s*["'`]([\w-]+)/g)) nomsAnimes.add(m[1]);
section("@keyframes jamais utilisées", [...keyframes].filter((k) => !nomsAnimes.has(k) && !present(k, usages)));
const motsCss = new Set(["none", "infinite", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "both", "forwards", "backwards", "alternate", "alternate-reverse", "reverse", "normal", "running", "paused", "step-start", "step-end", "initial", "inherit", "unset", "revert"]);
section("Animations qui appellent des @keyframes inexistantes", [...nomsAnimes].filter((n) => /^[a-zA-Z_][\w-]*$/.test(n) && !motsCss.has(n) && !keyframes.has(n) && !/^(cubic|steps|var)/.test(n)));

// 4. Doublons CSS
const norm = (c) => c.split(";").map((d) => d.trim().replace(/\s+/g, " ")).filter(Boolean).sort().join(";");
const parCorps = new Map(), parSel = new Map();
for (const r of regles) {
  const n = norm(r.corps);
  if (n.split(";").length >= 2) { const k = r.f + "|" + r.contexte + "|" + n; parCorps.set(k, [...(parCorps.get(k) || []), r.selecteur]); }
  const ks = r.f + "|" + r.contexte + "|" + r.selecteur.replace(/\s+/g, " ");
  parSel.set(ks, (parSel.get(ks) || 0) + 1);
}
section("Mêmes déclarations sous plusieurs sélecteurs (à regrouper ou passer en variable)", [...parCorps.values()].filter((s) => s.length > 1).map((s) => s.join("  |  ")));
section("Sélecteurs déclarés plusieurs fois au même niveau", [...parSel].filter(([, n]) => n > 1).map(([k, n]) => `${k.split("|")[2]}  (${n} fois${k.split("|")[1] ? ", dans " + k.split("|")[1] : ""}, ${path.basename(k.split("|")[0])})`));

// 5. JavaScript : noms déclarés et jamais repris
const toutJs = js.map((x) => x.t).join("\n");
const declares = new Map();
for (const { f, t } of js) {
  for (const m of t.matchAll(/(?:^|[\s;{}(])(?:function\*?|class|const|let|var)\s+([A-Za-zÀ-ÿ_$][\w$À-ÿ]*)/g)) if (!declares.has(m[1])) declares.set(m[1], f);
  for (const m of t.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) for (const n of m[1].split(",")) { const nom = n.split(":").pop().split("=")[0].trim(); if (nom && !declares.has(nom)) declares.set(nom, f); }
}
// Un nom est inutilisé quand chacune de ses apparitions est une déclaration : cela reste vrai quand une même page
// existe en plusieurs exemplaires (page générée, copie par famille), où un simple comptage le ferait passer pour utilisé
const compte = (motif) => (usages.match(new RegExp(motif, "g")) || []).length;
const inutilise = (nom) => {
  const e = echapper(nom);
  return compte(`(?<![\\w$À-ÿ])${e}(?![\\w$À-ÿ])`) === compte(`(?:function\\*?|class|const|let|var)\\s+${e}(?![\\w$À-ÿ])`);
};
section("Noms JavaScript déclarés et jamais utilisés ailleurs", [...declares].filter(([n]) => n.length > 1 && inutilise(n)).map(([n, f]) => `${n}  (${path.basename(f)})`));

// 6. Fichiers orphelins
if (!args.includes("--pas-de-fichiers")) {
  const toutTexte = tous.filter((f) => TEXTE.has(ext(f))).map(lire).join("\n");
  const orphelins = tous.filter((f) => RESSOURCES.has(ext(f)) && !/(^|[\\/])(sw|service-worker|favicon)\.[a-z]+$/i.test(f)).filter((f) => {
    const nom = path.basename(f);
    return !toutTexte.includes(nom) && !toutTexte.includes(encodeURI(nom)) && !toutTexte.includes(nom.replace(ext(f), ""));
  });
  section("Fichiers que rien ne référence", orphelins.map((f) => path.relative(process.cwd(), f)));
}

console.log(`Inventaire de ${tous.length} fichier(s) : ${regles.length} règles CSS, ${classes.size} classes, ${declares.size} noms JavaScript.`);
console.log(sortie.length ? sortie.join("\n") : "\nRien de suspect trouvé.");
console.log("\nRappel : ce sont des suspects. Confirmer chacun (recherche dans tout le projet, autres pages, outils tiers) avant de supprimer.");
