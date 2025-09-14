// index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events, ActivityType } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import http from 'node:http';

// ── util ESM (__dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Discord client (solo slash commands)
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// colección de comandos
client.commands = new Collection();

// ── Recorrer /commands recursivamente
function collectCommandFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...collectCommandFiles(full));
    else if (it.isFile() && (full.endsWith('.js') || full.endsWith('.mjs'))) out.push(full);
  }
  return out;
}

// ── Cargar comandos (default export o nombrado)
async function loadCommands() {
  const cmdDir = path.resolve(process.cwd(), process.env.COMMANDS_DIR ?? 'commands');
  if (!fs.existsSync(cmdDir)) {
    console.warn(`⚠️ No existe carpeta de comandos: ${cmdDir}`);
    return;
  }
  const files = collectCommandFiles(cmdDir);
  console.log(`🔎 Encontrados ${files.length} archivos de comandos`);
  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(file).href);
      const cmd = mod.default ?? mod.command ?? mod;
      if (!cmd?.data?.name || typeof cmd?.execute !== 'function') {
        console.warn(`⚠️ Ignorado ${file} (falta data.name o execute)`);
        continue;
      }
      client.commands.set(cmd.data.name, cmd);
      console.log(`🧩 Comando cargado: /${cmd.data.name}`);
    } catch (e) {
      console.error(`❌ Error importando ${file}:`, e);
    }
  }
}

// ── Keepalive HTTP para Render Web Service (evita port-scan timeout)
if (process.env.PORT) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  server.listen(process.env.PORT, () => {
    console.log(`🌐 Keepalive HTTP escuchando en puerto ${process.env.PORT}`);
  });
}

// ── Ready
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot conectado como ${c.user.tag}`);
  try {
    c.user.setPresence({
      activities: [{ name: '/help', type: ActivityType.Listening }],
      status: 'online',
    });
  } catch {}
});

// ── Handler de interacciones
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({ content: 'Comando no encontrado.', ephemeral: true });
  }
  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`💥 Error en /${interaction.commandName}:`, err);
    const msg = 'Hubo un error ejecutando el comando.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

// ── Seguridad básica de proceso
process.on('unhandledRejection', (r) => console.error('🧯 unhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('🧯 uncaughtException:', e));

// ── Boot
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Falta DISCORD_TOKEN en variables de entorno');
  process.exit(1);
}
await loadCommands();
await client.login(process.env.DISCORD_TOKEN);

