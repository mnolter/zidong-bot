// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ── Validador de ENV (muestra qué falta y enmascara el token si existe)
(function validateEnv() {
  const miss = [];
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN) miss.push('DISCORD_TOKEN');
  if (!CLIENT_ID)    miss.push('CLIENT_ID');
  if (!GUILD_ID)     miss.push('GUILD_ID');

  if (miss.length) {
    console.error('❌ Faltan variables:', miss.join(', '));
    console.log('🔎 Vistas:',
      'DISCORD_TOKEN=', process.env.DISCORD_TOKEN ? `set(${String(process.env.DISCORD_TOKEN).slice(0,6)}…${String(process.env.DISCORD_TOKEN).slice(-4)})` : '(empty)',
      'CLIENT_ID=', process.env.CLIENT_ID ?? '(empty)',
      'GUILD_ID=', process.env.GUILD_ID ?? '(empty)'
    );
    process.exit(1);
  }
})();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

// ── Utilidades
function collect(dir) {
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...collect(full));
    else if (full.endsWith('.js') || full.endsWith('.mjs')) out.push(full);
  }
  return out;
}

async function load(file) {
  const mod = await import(pathToFileURL(file).href);
  const cmd = mod.default ?? mod.command ?? mod.data ?? mod;
  if (!cmd?.toJSON) throw new Error(`Sin .toJSON(): ${file}`);
  return cmd.toJSON();
}

// ── Main
(async () => {
  const dir = path.resolve(process.cwd(), process.env.COMMANDS_DIR ?? 'commands');
  if (!fs.existsSync(dir)) {
    console.error(`❌ No existe la carpeta de comandos: ${dir}`);
    process.exit(1);
  }

  const files = collect(dir);
  if (files.length === 0) {
    console.warn(`⚠️ No se encontraron archivos de comando en: ${dir}`);
  } else {
    console.log(`🔎 Encontrados ${files.length} archivos de comandos`);
  }

  const body = [];
  for (const f of files) {
    try {
      const j = await load(f);
      body.push(j);
      console.log(`✅ /${j.name}`);
    } catch (e) {
      console.error(`⚠️ ${f}: ${e.message}`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const res = await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body }
  );
  console.log(`🟢 Deploy OK: ${res.length} comandos → GUILD ${GUILD_ID}`);
})().catch(e => {
  console.error('❌ Error en deploy:', e);
  process.exit(1);
});



