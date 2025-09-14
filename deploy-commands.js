import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('❌ Falta DISCORD_TOKEN/CLIENT_ID/GUILD_ID'); process.exit(1);
}

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

(async () => {
  const dir = path.resolve(process.cwd(), process.env.COMMANDS_DIR ?? 'commands');
  const files = collect(dir);
  const body = [];
  for (const f of files) {
    try {
      const j = await load(f);
      body.push(j);
      console.log(`✅ /${j.name}`);
    } catch (e) { console.error(`⚠️ ${f}: ${e.message}`); }
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const res = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
  console.log(`🟢 Deploy OK: ${res.length} comandos`);
})().catch(e => { console.error('❌', e); process.exit(1); });



