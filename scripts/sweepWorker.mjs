// Bootstrap for sweep worker threads: register the TypeScript loader, then run sweep.ts.
import { register } from 'tsx/esm/api';
register();
await import('./sweep.ts');
