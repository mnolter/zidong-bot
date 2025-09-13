// index.js (versión extendida con utilidades)
// ESM
import 'dotenv/config';
import {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  ActivityType,
  PermissionsBitField,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ============ Config & Validaciones de entorno ============
const REQUIRED_ENVS = ['DISCORD_TOKEN'];
for (const key of REQUIRED_ENVS) {
  if (!process.env[key]) {
    console.error(`❌ Falta variable de entorno: ${key}`);
    process.exit(1);
  }
}

const OWNER_ID = process.env.OWNER_ID ?? null; // opcional (para comandos owner-only)
const NODE_ENV = process.env.NODE_ENV ?? 'development';

// ============ Cliente ============
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // necesario para roles
    // NOTA: no pedimos MessageContent porque usamos slash commands
  ],
});

// Colecciones & estructuras
client.commands = new Collection();         // /comandos
client.cooldowns = new Collection();        // cooldowns por comando (Map<commandName, Map<userId, timestamp>>)

// ============ Logger pequeño ============
const log = {
  info: (...args) => console.log('ℹ️', ...args),
  ok:   (...args) => console.log('✅', ...args),
  warn: (...args) => console.warn('⚠️', ...args),
  err:  (...args) => console.error('❌', ...args),
};

// ============ Carga de comandos ============
async function loadCommands() {
  const commandsPath = path.join(process.cwd(), 'commands');

  if (!fs.existsSync(commandsPath)) {
    log.warn('Carpeta /commands no encontrada. Crea /commands y agrega tus comandos.');
    return;
  }

  // Permite subcarpetas (ej: /commands/admin/grant.js)
  const files = [];
  function walk(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
      const full = path.join(dir, it.name);
      if (it.isDirectory()) walk(full);
      else if (it.isFile() && full.endsWith('.js')) files.push(full);
    }
  }
  walk(commandsPath);

  for (const filePath of files) {
    try {
      const mod = await import(pathToFileURL(filePath).href);
      const cmd = mod.default ?? mod;
      if (cmd?.data && typeof cmd.execute === 'function') {
        client.commands.set(cmd.data.name, cmd);
        log.info(`Comando cargado: /${cmd.data.name}`);
      } else {
        log.warn(`Archivo inválido (sin {data, execute}): ${filePath}`);
      }
    } catch (e) {
      log.err(`Error importando ${filePath}:`, e);
    }
  }

  if (!client.commands.size) {
    log.warn('No se cargaron comandos. ¿Olvidaste exportar default?');
  }
}

// ============ Presencia rotativa (opcional) ============
const presences = [
  { name: '/grant para asignar roles', type: ActivityType.Listening },
  { name: `${NODE_ENV === 'production' ? 'online' : 'dev mode'}`, type: ActivityType.Watching },
];
function rotatePresence(i = 0) {
  const p = presences[i % presences.length];
  client.user?.setPresence({ activities: [{ name: p.name, type: p.type }], status: 'online' }).catch(() => {});
  setTimeout(() => rotatePresence(i + 1), 60_000);
}

// ============ Utilidades de permisos/cooldowns ============
function hasAllPermissions(member, perms = []) {
  if (!perms?.length) return true;
  return member.permissions.has(new PermissionsBitField(perms));
}

function ensureCooldown(interaction, command) {
  const seconds = command.cooldown ?? 0; // define cooldown (en segundos) opcional en cada comando
  if (!seconds) return false;

  const name = command.data.name;
  if (!client.cooldowns.has(name)) {
    client.cooldowns.set(name, new Collection());
  }
  const now = Date.now();
  const timestamps = client.cooldowns.get(name);
  const cooldownAmount = seconds * 1000;

  if (timestamps.has(interaction.user.id)) {
    const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
    if (now < expirationTime) {
      const remaining = Math.ceil((expirationTime - now) / 1000);
      interaction.reply({
        content: `⏳ Esperá **${remaining}s** para volver a usar \`/${name}\`.`,
        ephemeral: true,
      }).catch(() => {});
      return true;
    }
  }

  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
  return false;
}

// ============ Eventos ============
client.once(Events.ClientReady, (c) => {
  log.ok(`Bot conectado como ${c.user.tag}`);
  rotatePresence();
});

client.on(Events.GuildCreate, (guild) => {
  log.info(`Añadido a guild: ${guild.name} (${guild.id})`);
});

client.on(Events.GuildDelete, (guild) => {
  log.info(`Removido de guild: ${guild?.name ?? 'desconocido'} (${guild?.id ?? 'sin id'})`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    log.warn(`Comando no encontrado: ${interaction.commandName}`);
    return;
  }

  // Owner-only (opcional, si el comando define { ownerOnly: true })
  if (command.ownerOnly && OWNER_ID && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '🚫 Este comando es solo para el owner.', ephemeral: true }).catch(() => {});
  }

  // Cooldown por comando (opcional: command.cooldown = segundos)
  if (ensureCooldown(interaction, command)) return;

  // Permisos requeridos del BOT (opcional: command.requiredBotPerms = [PermissionFlagsBits.ManageRoles, ...])
  if (command.requiredBotPerms?.length) {
    const me = interaction.guild?.members?.me;
    if (!me || !hasAllPermissions(me, command.requiredBotPerms)) {
      return interaction.reply({
        content: '❌ No tengo los permisos necesarios para ejecutar este comando.',
        ephemeral: true,
      }).catch(() => {});
    }
  }

  // Permisos requeridos del USUARIO (opcional: command.requiredUserPerms = [PermissionFlagsBits.ManageRoles, ...])
  if (command.requiredUserPerms?.length) {
    const invoker = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasAllPermissions(invoker, command.requiredUserPerms)) {
      return interaction.reply({
        content: '🚫 No tenés permisos suficientes para usar este comando.',
        ephemeral: true,
      }).catch(() => {});
    }
  }

  try {
    // Sugerencia: para comandos que pueden tardar (IO con APIs), defer reply
    // if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
    await command.execute(interaction, client);
  } catch (error) {
    log.err('Error ejecutando comando:', error);
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
  log.err('unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  log.err('uncaughtException:', err);
});
process.on('SIGINT', () => {
  log.info('Saliendo…');
  client.destroy();
  process.exit(0);
});
process.on('SIGTERM', () => {
  log.info('Saliendo…');
  client.destroy();
  process.exit(0);
});

// ============ Bootstrap ============
await loadCommands();

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  log.err('Error al loguear el bot:', e);
  process.exit(1);
});

