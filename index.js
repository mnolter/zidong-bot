// index.js — versión final
import 'dotenv/config';
import {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  ActivityType,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ============ Validación de entorno ============
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Falta DISCORD_TOKEN en variables de entorno');
  process.exit(1);
}

// ============ Cliente ============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // necesario para asignar/quitar roles
  ],
});

// Colección de comandos
client.commands = new Collection();

// ============ Carga de comandos (recursiva) ============
async function loadCommands() {
  const commandsDir = path.join(process.cwd(), 'commands');
  if (!fs.existsSync(commandsDir)) {
    console.warn('⚠️ Carpeta /commands no encontrada. Crea /commands y agrega tus comandos.');
    return;
  }

  const files = [];
  (function walk(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
      const full = path.join(dir, it.name);
      if (it.isDirectory()) walk(full);
      else if (it.isFile() && full.endsWith('.js')) files.push(full);
    }
  })(commandsDir);

  for (const filePath of files) {
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const cmd = mod.default ?? mod;
      if (cmd?.data && typeof cmd.execute === 'function') {
        client.commands.set(cmd.data.name, cmd);
        console.log(`🔹 Comando cargado: /${cmd.data.name}`);
      } else {
        console.warn(`⚠️ Archivo inválido (sin {data, execute}): ${filePath}`);
      }
    } catch (e) {
      console.error(`❌ Error importando ${filePath}:`, e);
    }
  }

  if (!client.commands.size) {
    console.warn('⚠️ No se cargaron comandos. ¿Olvidaste exportar default?');
  }
}

// ============ Eventos ============
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot conectado como ${c.user.tag}`);
  // Presencia fija (sin rotación). v14: setActivity NO es promesa.
  c.user.setActivity('/grant para asignar roles', { type: ActivityType.Listening });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️ Comando no encontrado: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error('❌ Error ejecutando comando:', error);
    const payload = { content: '❌ Ocurrió un error al ejecutar el comando.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      interaction.followUp(payload).catch(() => {});
    } else {
      interaction.reply(payload).catch(() => {});
    }
  }
});

// ============ Anti-crash básico ============
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

// ============ Bootstrap ============
await loadCommands();

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('❌ Error al loguear el bot:', e);
  process.exit(1);
});


