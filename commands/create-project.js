// commands/create-project.js
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('create-project')
  .setDescription('Crea un proyecto privado: rol, categoría y canales, y asigna el rol a miembros.')
  .addStringOption(opt =>
    opt.setName('nombre')
      .setDescription('Nombre del proyecto (se usará para el rol y la categoría)')
      .setRequired(true))
  .addUserOption(o => o.setName('usuario1').setDescription('Miembro del proyecto'))
  .addUserOption(o => o.setName('usuario2').setDescription('Miembro del proyecto'))
  .addUserOption(o => o.setName('usuario3').setDescription('Miembro del proyecto'))
  .addUserOption(o => o.setName('usuario4').setDescription('Miembro del proyecto'))
  .addUserOption(o => o.setName('usuario5').setDescription('Miembro del proyecto'))
  .addStringOption(opt =>
    opt.setName('canales')
      .setDescription('Canales (texto) separados por comas. Ej: general,avances,docs'))
  .addBooleanOption(opt =>
    opt.setName('voz')
      .setDescription('Crear también un canal de voz (por defecto: no)'))
  // Solo quien puede gestionar canales/roles puede usarlo
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles)
  .setDMPermission(false);

export async function execute(interaction) {
  // Validaciones de permisos
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ Necesitás **Manage Channels** y **Manage Roles**.', ephemeral: true });
  }
  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels) ||
      !me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ El bot necesita **Manage Channels** y **Manage Roles**.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const rawName = interaction.options.getString('nombre', true).trim();
  // Saneamos un nombre razonable para rol/categoría
  const baseName = rawName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase().slice(0, 90);
  const roleName = `proj-${baseName}`;
  const categoryName = `📁 ${baseName}`;

  const users = ['usuario1','usuario2','usuario3','usuario4','usuario5']
    .map(k => interaction.options.getUser(k))
    .filter(Boolean);

  const textList = (interaction.options.getString('canales')?.trim() || 'general,avances,docs')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10); // por seguridad

  const createVoice = interaction.options.getBoolean('voz') || false;

  try {
    // 1) Crear (o reutilizar) rol del proyecto
    let projRole = interaction.guild.roles.cache.find(r => r.name === roleName);
    if (!projRole) {
      projRole = await interaction.guild.roles.create({
        name: roleName,
        mentionable: false,
        reason: `Rol de proyecto creado por ${interaction.user.tag}`,
      });
    }

    // 2) Asignar rol a los usuarios provistos
    const assigned = [];
    for (const u of users) {
      const member = await interaction.guild.members.fetch(u.id).catch(() => null);
      if (member) {
        await member.roles.add(projRole, `Alta a proyecto ${baseName} por ${interaction.user.tag}`);
        assigned.push(`<@${u.id}>`);
      }
    }

    // 3) Crear categoría privada con permisos
    const everyone = interaction.guild.roles.everyone;
    const overwrites = [
      {
        id: everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: projRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AddReactions,
        ],
      },
      // Admins con Administrator ya ven todo (no hace falta añadirlos aquí)
    ];

    const category = await interaction.guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: overwrites,
      reason: `Categoría de proyecto ${baseName}`,
    });

    // 4) Crear canales de texto dentro de la categoría (heredan overwrites)
    const createdText = [];
    for (const ch of textList) {
      const chName = ch
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '')
        .slice(0, 90) || 'general';
      const newChan = await interaction.guild.channels.create({
        name: `📌-${chName}`,
        type: ChannelType.GuildText,
        parent: category.id,
        reason: `Canal de proyecto ${baseName}`,
      });
      createdText.push(`#${newChan.name}`);
    }

    // 5) Canal de voz opcional
    let voiceInfo = '';
    if (createVoice) {
      const voice = await interaction.guild.channels.create({
        name: `🔊-${baseName}`,
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: `Voz de proyecto ${baseName}`,
      });
      voiceInfo = `\n- Voz: **${voice.name}**`;
    }

    // 6) Resumen
    const summary =
      `✅ **Proyecto creado**\n` +
      `- Rol: **@${projRole.name}**\n` +
      `- Categoría: **${category.name}**\n` +
      `- Canales: ${createdText.join(', ')}${voiceInfo}\n` +
      (assigned.length ? `- Miembros asignados: ${assigned.join(', ')}` : '- Miembros asignados: *(ninguno especificado)*') +
      `\n\n🔒 Solo verán el proyecto: **Admins** (por permiso *Administrator*) y quienes tengan **@${projRole.name}**.`;

    return interaction.editReply({ content: summary });
  } catch (err) {
    console.error('create-project error:', err);
    return interaction.editReply({
      content: '💥 Ocurrió un error creando el proyecto. Revisá permisos del bot y jerarquía.',
    });
  }
}
