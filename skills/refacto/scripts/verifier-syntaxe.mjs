// Vérifie que tout le code d'un projet se lit sans erreur de syntaxe, AVANT d'ouvrir un navigateur ou de lancer des tests.
// Couvre : .js .mjs .cjs (node --check), les <script> écrits dans les pages .html (y compris les modules), les blocs
// JSON-LD et les fichiers .json / .webmanifest (JSON valide), les .py (compilation sans exécution).
// Né d'une panne réelle : une apostrophe non protégée dans un texte cassait toute une appli, sans aucun message visible.
//
// Usage : node verifier-syntaxe.mjs <fichier ou dossier> [autres...]
// Sortie : une ligne par problème, puis un bilan. Code de sortie 1 s'il y a au moins un problème.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const cibles = process.argv.slice(2);
if (!cibles.length) { console.log("Usage : node verifier-syntaxe.mjs <fichier ou dossier> [...]"); process.exit(2); }

const IGNORES = new Set(["node_modules", ".git", ".vercel", ".next", "dist-cache", "__pycache__"]);
const fichiers = [];
function parcourir(p) {
  const s = fs.statSync(p);
  if (s.isDirectory()) { for (const n of fs.readdirSync(p)) if (!IGNORES.has(n)) parcourir(path.join(p, n)); }
  else fichiers.push(p);
}
for (const c of cibles) { if (!fs.existsSync(c)) { console.log("Introuvable : " + c); process.exit(2); } parcourir(path.resolve(c)); }

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "verif-syntaxe-"));
const problemes = [];
let verifies = 0;
// Ce que cet outil ne sait pas lire est compté et dit : « aucune erreur » ne doit jamais couvrir des fichiers non lus
const NON_LUS = new Set([".ts", ".mts", ".cts", ".tsx", ".jsx", ".vue", ".svelte", ".astro", ".php"]);
const nonLus = new Map();
let lus = 0;
let python = null;

function checkNode(fichier, libelle) {
  const r = spawnSync(process.execPath, ["--check", fichier], { encoding: "utf8" });
  verifies++;
  if (r.status === 0) return;
  // Message utile seulement : emplacement, ligne fautive, flèche, nature de l'erreur (sans la pile interne de Node)
  const lignes = (r.stderr || "").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("Node.js") && !/^\s+at /.test(l));
  const estTemp = fichier.startsWith(temp);
  const message = lignes.map((l) => (estTemp && l.startsWith(fichier) ? "ligne " + l.slice(fichier.length + 1) + " de la page" : l));
  problemes.push(`${libelle}\n   ${message.slice(0, 4).join("\n   ")}`);
}
function checkJson(texte, libelle) {
  verifies++;
  try { JSON.parse(texte); } catch (e) { problemes.push(`${libelle}\n   JSON invalide : ${e.message}`); }
}
const ligneDe = (texte, index) => texte.slice(0, index).split("\n").length;

for (const f of fichiers) {
  const ext = path.extname(f).toLowerCase();
  if (NON_LUS.has(ext)) { nonLus.set(ext, (nonLus.get(ext) || 0) + 1); continue; }
  if ([".js", ".mjs", ".cjs", ".json", ".webmanifest", ".py", ".html", ".htm"].includes(ext)) lus++;
  if ([".js", ".mjs", ".cjs"].includes(ext)) checkNode(f, f);
  else if (ext === ".json" || ext === ".webmanifest") checkJson(fs.readFileSync(f, "utf8").replace(/^﻿/, ""), f);
  else if (ext === ".py") {
    verifies++;
    // « python » sous Windows, « python3 » ailleurs : le premier qui répond sert pour tous les fichiers
    python ??= ["python", "python3"].find((c) => spawnSync(c, ["--version"]).status === 0) || "";
    const r = python ? spawnSync(python, ["-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read(), sys.argv[1])", f], { encoding: "utf8" }) : { error: true };
    if (r.error) problemes.push(`${f}\n   Python introuvable, fichier non vérifié`);
    else if (r.status !== 0) problemes.push(`${f}\n   ${(r.stderr || "").trim().split(/\r?\n/).slice(-3).join("\n   ")}`);
  } else if (ext === ".html" || ext === ".htm") {
    const html = fs.readFileSync(f, "utf8");
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, n = 0;
    while ((m = re.exec(html))) {
      const attrs = m[1], code = m[2];
      if (/\bsrc\s*=/.test(attrs) || !code.trim()) continue;
      n++;
      const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1]?.toLowerCase() || "";
      const libelle = `${f}, script n°${n} (ligne ${ligneDe(html, m.index)})`;
      if (type.includes("json") || type === "importmap" || type === "speculationrules") { checkJson(code, libelle); continue; }
      if (type && !["module", "text/javascript", "application/javascript"].includes(type)) continue; // gabarits, shaders...
      const tmp = path.join(temp, `script-${verifies}${type === "module" ? ".mjs" : ".cjs"}`);
      // Décalage des lignes pour que l'erreur pointe la bonne ligne de la page
      fs.writeFileSync(tmp, "\n".repeat(ligneDe(html, m.index + m[0].indexOf(">") + 1) - 1) + code);
      checkNode(tmp, libelle);
    }
  }
}
fs.rmSync(temp, { recursive: true, force: true });

for (const p of problemes) console.log("PROBLÈME " + p);
console.log(`${verifies} bloc(s) de code vérifié(s) dans ${lus} fichier(s) : ${problemes.length ? problemes.length + " problème(s)" : "aucune erreur de syntaxe"}`);
if (nonLus.size) console.log(`NON VÉRIFIÉS : ${[...nonLus.values()].reduce((a, b) => a + b, 0)} fichier(s) ${[...nonLus.keys()].sort().join(", ")}, que cet outil ne lit pas. Les faire contrôler par l'outil du projet (tsc, construction, linter).`);
process.exitCode = problemes.length ? 1 : 0;
