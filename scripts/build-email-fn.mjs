// Gera supabase/functions/resumo-semanal/index.ts (arquivo único, para colar no painel do Supabase) a partir de resumo.js + handler.ts.txt
import fs from "fs";
const dir = new URL("../supabase/functions/resumo-semanal/", import.meta.url);
const lib = fs.readFileSync(new URL("resumo.js", dir), "utf8").replace(/^export /gm, "");
const h = fs.readFileSync(new URL("handler.ts.txt", dir), "utf8");
const topo = "// @ts-nocheck\n// ARQUIVO GERADO por scripts/build-email-fn.mjs. Para mudar a lógica, edite resumo.js e rode: node scripts/build-email-fn.mjs\n";
fs.writeFileSync(new URL("index.ts", dir), topo + lib + h);
console.log("index.ts gerado");
