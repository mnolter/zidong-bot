// index.js — MVP Zidong Bot (discord.js v14, ESM)
import 'dotenv/config';
import {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, ChannelType, PermissionFlagsBits
} from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// -------- Comandos --------
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Crea roles base y estructura mínima del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('project')
    .setDescription('Gestiona proyectos')
    .addSubcommand(sc =>
      sc.setName('create')
        .setDescription('Crea categoría y canales estándar de un proyecto')
        .addStringOption(o => o.setName('name').setDescription('Clave del proyecto (ej: alpha)').setRequired(true))
        .addStringOption(o => o.setName('visibility')
          .setDescription('public | private')
          .addChoices({ name: 'public', value: 'public' }, { name: 'private', value: 'private' })
          .setRequired(true)
        )
    ),

  new SlashCommandBuilder()
    .setName('project_text')
    .setDescription('Crea un canal de texto dentro de la categoría de un proyecto')
    .addStringOption(o => o.setName('name').setDescription('Clave del proyecto').setRequired(true))
    .addStringOption(o => o.setName('channel').setDescription('Nombre del canal').setRequired(true)),
].map(c => c.toJSON());

// -------- Helpers --------
const BASE_ROLES = ['Zidong – Exec', 'PM', 'Dev', 'Data/AI', 'QA', 'Invitado'];
const catName = (k) => `PROY – ${k}`;
const stdChannels = (k) => ([
  { name: `${k}-general`, type: ChannelType.GuildText },
  { name: `${k}-dev`,     type: ChannelType.GuildText },
  { name: `${k}-data`,    type: ChannelType.GuildText },
  { name: `${k}-qa`,      type: ChannelType.GuildText },
  { name: `${k}-docs`,    type: ChannelType.GuildText },
  { name: `${k}-meet`,    type: ChannelType.GuildVoice },
]);

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
    { body: commands }
  );
  console.log('✅ Slash commands registrados');
}

// -------- Bot ready --------
client.once('ready', async () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  await registerCommands();
});

// -------- Router --------
client.on('interactionCreate', async (inter) => {
  if (!inter.isChatInputCommand()) return;

  // /setup
  if (inter.commandName === 'setup') {
    await inter.deferReply({ ephemeral: true });
    const g = inter.guild;

    for (const r of BASE_ROLES) {
      if (!g.roles.cache.find(rr => rr.name === r)) await g.roles.create({ name: r });
    }

    const ensureCat = async (name) => {
      let c = g.channels.cache.find(ch => ch.type === ChannelType.GuildCategory && ch.name === name);
      if (!c) c = await g.channels.create({ name, type: ChannelType.GuildCategory });
      return c;
    };
    const admin = await ensureCat('01_Admin');
    const general = await ensureCat('02_General');
    const proyectos = await ensureCat('03_Proyectos');
    const reuniones = await ensureCat('04_Salas de Reunión');

    const ensureText = async (parent, name, publicView = true) => {
      let ch = g.channels.cache.find(c => c.parentId === parent.id && c.name === name);
      if (!ch) {
        ch = await g.channels.create({
          name, type: ChannelType.GuildText, parent: parent.id,
          permissionOverwrites: publicView ? [] : [{ id: g.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }]
        });
      }
      return ch;
    };
    await ensureText(admin, 'anuncios', false);
    await ensureText(admin, 'audit-log', false);
    await ensureText(general, 'general', true);
    await ensureText(general, 'it-helpdesk', true);

    for (let i = 1; i <= 5; i++) {
      const name = `Sala Reunión ${i}`;
      let v = g.channels.cache.find(c => c.parentId === reuniones.id && c.name === name);
      if (!v) await g.channels.create({ name, type: ChannelType.GuildVoice, parent: reuniones.id });
    }

    await inter.editReply('✅ Setup listo: roles, categorías y 5 salas creadas.');
    return;
  }

  // /project create
  if (inter.commandName === 'project' && inter.options.getSubcommand() === 'create') {
    await inter.deferReply({ ephemeral: true });
    const g = inter.guild;
    const key = inter.options.getString('name', true).toLowerCase();
    const visibility = inter.options.getString('visibility', true); // public | private

    let category = g.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === catName(key));
    if (!category) {
      const overwrites = visibility === 'private'
        ? [{ id: g.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }]
        : [];
      category = await g.channels.create({ name: catName(key), type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
    }

    for (const cfg of stdChannels(key)) {
      const exists = g.channels.cache.find(c => c.parentId === category.id && c.name === cfg.name);
      if (!exists) {
        await g.channels.create({
          name: cfg.name, type: cfg.type, parent: category.id,
          permissionOverwrites: (visibility === 'private')
            ? [{ id: g.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] }]
            : []
        });
      }
    }

    await inter.editReply(`✅ Proyecto **${key}** creado (${visibility}).`);
    return;
  }

  // /project_text
  if (inter.commandName === 'project_text') {
    await inter.deferReply({ ephemeral: true });
    const g = inter.guild;
    const key = inter.options.getString('name', true).toLowerCase();
    const channelName = inter.options.getString('channel', true);

    const category = g.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === catName(key));
    if (!category) return inter.editReply(`❌ No existe la categoría **${catName(key)}**. Ejecutá /project create.`);

    const exists = g.channels.cache.find(c => c.parentId === category.id && c.name === channelName);
    if (exists) return inter.editReply('ℹ️ Ese canal ya existe.');

    await g.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category.id });
    await inter.editReply(`🆕 Canal **#${channelName}** creado en **${catName(key)}**.`);
  }
});

client.login(process.env.DISCORD_TOKEN);
