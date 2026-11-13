// Tweakbar: floating design panel for `astro dev`. Never part of a build.
//
// Usage in astro.config.mjs:
//   const istDev = process.argv.includes('dev');
//   integrations: [...(istDev ? [(await import('./tweakbar/integration.mjs')).default()] : [])]
//
// Double guard: even when registered, every hook does nothing unless the
// command is "dev". The client script is injected only in dev, the save
// endpoints exist only as Vite dev middleware.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { erstelleHandler } from './server/handler.mjs';

const CLIENT = fileURLToPath(new URL('./client.js', import.meta.url)).split(path.sep).join('/');

/**
 * @param {{ tokens?: string }} [optionen] tokens: path of the theme file, relative to the project root
 */
export default function tweakbar(optionen = {}) {
  const tokensDatei = optionen.tokens ?? 'src/config/tokens.css';
  let wurzel = process.cwd();
  return {
    name: 'portawerk-tweakbar',
    hooks: {
      'astro:config:setup': ({ command, injectScript, config, logger }) => {
        if (command !== 'dev') return;
        wurzel = fileURLToPath(config.root);
        injectScript('page', `import ${JSON.stringify(`/@fs/${CLIENT.replace(/^\/+/, '')}`)};`);
        logger.info('Tweakbar aktiv: Alt+T blendet das Panel ein und aus.');
      },
      'astro:server:setup': ({ server, logger }) => {
        try {
          server.middlewares.use(erstelleHandler({ wurzel, tokensDatei }));
        } catch (fehler) {
          logger.error(`Tweakbar konnte nicht starten: ${fehler instanceof Error ? fehler.message : fehler}`);
        }
      },
    },
  };
}
