import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const docsRouter = new Hono();

// Leer el archivo openapi.yaml
const openapiPath = join(__dirname, '../../../api-spec/openapi.yaml');
const openapiSpecYaml = readFileSync(openapiPath, 'utf-8');
const openapiSpecJson = parse(openapiSpecYaml);

// Servir Swagger UI
docsRouter.get('/', (c) => {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>TCG ERP API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const spec = ${JSON.stringify(openapiSpecJson)};
      
      window.ui = SwaggerUIBundle({
        url: '/api-docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        validatorUrl: null,
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>
  `;
  
  return c.html(html);
});

// Endpoint para servir el spec en JSON
docsRouter.get('/openapi.json', (c) => {
  return c.json(openapiSpecJson);
});

// Endpoint para servir el spec en YAML
docsRouter.get('/openapi.yaml', (c) => {
  return c.text(openapiSpecYaml, 200, {
    'Content-Type': 'application/x-yaml',
  });
});

