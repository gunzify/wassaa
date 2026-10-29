// Syntax/grammar check for the Supabase Edge API (Deno-style TypeScript with
// `npm:` imports and the Deno global — `tsc --noEmit` cannot check these
// directly, so we run TypeScript's transpile pass and report its diagnostics).
import ts from '../backend/node_modules/typescript/lib/typescript.js';
import { readFileSync } from 'node:fs';

const files = [
  'supabase/functions/api/index.ts',
  'supabase/functions/api/npc.ts',
  'supabase/functions/api/npc-content.ts',
  'supabase/functions/api/domain.ts',
];

let failed = false;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const diagnostics = result.diagnostics || [];
  if (diagnostics.length) {
    failed = true;
    for (const d of diagnostics) {
      const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : null;
      const where = pos ? `${file}:${pos.line + 1}:${pos.character + 1}` : file;
      console.error(`error ${where} - ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    }
  } else {
    console.log(`ok    ${file}`);
  }
}
process.exit(failed ? 1 : 0);
