import { handle } from 'hono/vercel';
import { app } from '../src/app.js';

/** Node es el runtime por defecto en Vercel; no usar `runtime: nodejs20.x` (falla con la CLI nueva). */
export default handle(app);

