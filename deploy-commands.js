// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Faltan variables en .env (DISCORD_TOKEN, CLIENT_ID, GUILD_ID)');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Carga todos los comandos desde /commands
function collectCommandFiles(dir) {
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...collectCommandFiles(full));
    else if (it.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

async function loadCommandsJSON() {
  const commandsDir = path.join(process.cwd(), 'commands');
  if (!fs.existsSync(commandsDir)) return [];
  const files = collectCommandFiles(commandsDir);

  const json = [];
  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(file).href);
      const cmd = mod.default ?? mod;
      if (cmd?.data) {
        json.push(cmd.data.toJSON());
        console.log(`🔹 Detectado comando: /${cmd.data.name}`);
      } else {
        console.warn(`⚠️ ${file} no exporta "data".`);
      }
    } catch (e) {
      console.error(`❌ Error importando ${file}:`, e);
    }
  }
  return json;
}

(async () => {
  try {
    console.log('🔄 Publicando comandos (guild)…');
    const body = await loadCommandsJSON();
    const res = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body }
    );
    console.log(`✅ Deploy OK: ${res.length} comando(s) publicados en el guild ${GUILD_ID}`);
  } catch (err) {
    console.error('❌ Error en deploy:', err);
    process.exit(1);
  }
})();
