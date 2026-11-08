// Syntax/grammar check for the Supabase Edge API (Deno-style TypeScript with
// `npm:` imports and the Deno global — `tsc --noEmit` cannot check these
// directly, so we run TypeScript's transpile pass and report its diagnostics).
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const files = [
  'supabase/functions/api/index.ts',
  'supabase/functions/api/npc.ts',
  'supabase/functions/api/npc-content.ts',
  'supabase/functions/api/ai.ts',
  'supabase/functions/api/domain.ts',
  'supabase/functions/api/notifications.ts',
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
// Per-file transpilation cannot see across modules: a route file that imports
// a helper the router never exported still transpiles cleanly and only fails
// later, in the deploy bundler. Type-check the graph as a whole so missing
// exports and unresolved relative imports fail here instead of at deploy time.
if (!failed) {
  const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'scripts/tsconfig.edge.json'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (tsc.status !== 0) failed = true;
  else console.log('ok    module graph (tsc -p scripts/tsconfig.edge.json)');
}

process.exit(failed ? 1 : 0);
