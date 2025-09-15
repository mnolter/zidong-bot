// commands/assign-pm.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

function normalizeProjectName(raw) {
  return raw.trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase()
    .slice(0, 90);
}

export const data = new SlashCommandBuilder()
  .setName('assign-pm')
  .setDescription('Asigna un Project Manager a un proyecto (crea rol proj-<nombre>-pm si no existe).')
  .addStringOption(opt =>
    opt.setName('nombre')
      .setDescription('Nombre del proyecto (mismo usado en /create-project)')
      .setRequired(true))
  .addUserOption(opt =>
    opt.setName('pm')
      .setDescription('Usuario que será PM del proyecto')
      .setRequired(true))
  .addBooleanOption(opt =>
    opt.setName('asignar_rol_proyecto')
      .setDescription('También asignar el rol del proyecto (proj-<nombre>) al PM (default: true)'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels)
  .setDMPermission(false);

export async function execute(interaction) {
  // Verificación de permisos del invocador
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ Necesitás permiso **Manage Roles**.', ephemeral: true });
  }
  // Verificación de permisos del BOT
  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ El bot necesita permiso **Manage Roles**.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const raw = interaction.options.getString('nombre', true);
  const base = normalizeProjectName(raw);

  const pmUser = interaction.options.getUser('pm', true);
  const alsoAssignProjectRole = interaction.options.getBoolean('asignar_rol_proyecto');
  const shouldAssignProjectRole = (alsoAssignProjectRole === null) ? true : alsoAssignProjectRole;

  const roleProjectName = `proj-${base}`;
  const rolePmName = `proj-${base}-pm`;

  try {
    // Buscar/crear rol de PM
    let pmRole = interaction.guild.roles.cache.find(r => r.name === rolePmName);
    if (!pmRole) {
      // Asegurar jerarquía: el rol del bot debe estar por encima del que crea/asigna
      pmRole = await interaction.guild.roles.create({
        name: rolePmName,
        mentionable: true,
        reason: `Rol PM de proyecto creado por ${interaction.user.tag}`,
      });
    }

    // Buscar (si existe) rol general del proyecto
    let projectRole = interaction.guild.roles.cache.find(r => r.name === roleProjectName) || null;

    // Verificar jerarquía antes de asignar
    if (pmRole.position >= me.roles.highest.position) {
      return interaction.editReply({
        content: `⚠️ No puedo asignar **@${pmRole.name}** porque está por encima (o igual) del rol más alto del bot.`,
      });
    }
    if (projectRole && projectRole.position >= me.roles.highest.position) {
      return interaction.editReply({
        content: `⚠️ No puedo asignar **@${projectRole.name}** porque está por encima (o igual) del rol más alto del bot.`,
      });
    }

    // Asignar roles al PM
    const member = await interaction.guild.members.fetch(pmUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply({ content: '❌ No pude encontrar a ese miembro en el servidor.' });
    }

    const added = [];
    if (!member.roles.cache.has(pmRole.id)) {
      await member.roles.add(pmRole, `Asignado como PM de ${base} por ${interaction.user.tag}`);
      added.push(`@${pmRole.name}`);
    }
    if (shouldAssignProjectRole) {
      if (!projectRole) {
        projectRole = await interaction.guild.roles.create({
          name: roleProjectName,
          mentionable: false,
          reason: `Rol del proyecto creado por ${interaction.user.tag}`,
        });
      }
      if (!member.roles.cache.has(projectRole.id)) {
        await member.roles.add(projectRole, `Asignado al proyecto ${base} por ${interaction.user.tag}`);
        added.push(`@${projectRole.name}`);
      }
    }

    // Resumen
    const lines = [
      `✅ **PM asignado** para **${base}**`,
      `- Usuario: <@${pmUser.id}>`,
      `- Rol PM: **@${pmRole.name}**`,
      `- Rol proyecto: **${projectRole ? '@' + projectRole.name : '(no asignado)'}**`,
      added.length ? `- Roles agregados: ${added.join(', ')}` : `- Roles agregados: (ninguno, ya los tenía)`,
      `\n📣 Sugerencia: configurá las alertas de n8n para mencionar **<@&${pmRole.id}>**.`,
    ];
    return interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    console.error('assign-pm error:', err);
    return interaction.editReply({ content: '💥 Ocurrió un error asignando el PM. Revisá permisos y jerarquía.' });
  }
}
