import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main } from '../../editor_server/editor-gateway.mjs';

export * from '../../editor_server/editor-gateway.mjs';

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
