// commands/close-project.js
import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('close-project')
  .setDescription('Archiva un proyecto: bloquea permisos, renombra y opcionalmente mueve/elimina.')
  .addStringOption(opt =>
    opt.setName('nombre')
      .setDescription('Nombre del proyecto (el mismo que usaste en /create-project)')
      .setRequired(true))
  .addBooleanOption(opt =>
    opt.setName('mover_a_archivo')
      .setDescription('Mover a la categoría 🗄️ archived (default: true)'))
  .addBooleanOption(opt =>
    opt.setName('eliminar')
      .setDescription('Eliminar canales y categoría del proyecto (default: false)'))
  .addBooleanOption(opt =>
    opt.setName('eliminar_rol')
      .setDescription('Eliminar también el rol del proyecto (default: false)'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles)
  .setDMPermission(false);

export async function execute(interaction) {
  // Permisos de quien ejecuta
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ Necesitás **Manage Channels** y **Manage Roles**.', ephemeral: true });
  }
  // Permisos del bot
  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels) ||
      !me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ El bot necesita **Manage Channels** y **Manage Roles**.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const rawName = interaction.options.getString('nombre', true).trim();
  const baseName = rawName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase().slice(0, 90);
  const roleName = `proj-${baseName}`;
  const categoryName = `📁 ${baseName}`;

  const moveToArchive = interaction.options.getBoolean('mover_a_archivo');
  const shouldMoveToArchive = moveToArchive === null ? true : moveToArchive; // por defecto true
  const shouldDelete = interaction.options.getBoolean('eliminar') || false;
  const shouldDeleteRole = interaction.options.getBoolean('eliminar_rol') || false;

  // Buscar rol del proyecto
  const projRole = interaction.guild.roles.cache.find(r => r.name === roleName) || null;

  // Buscar categoría del proyecto
  const category = interaction.guild.channels.cache.find(
    ch => ch.type === ChannelType.GuildCategory && ch.name === categoryName
  ) || null;

  if (!projRole && !category) {
    return interaction.editReply({
      content: `❌ No encontré el rol **@${roleName}** ni la categoría **${categoryName}**.`,
    });
  }

  try {
    const affected = {
      text: [],
      voice: [],
      renamed: [],
      moved: false,
      deleted: { channels: 0, category: false, role: false },
    };

    // Si hay que ELIMINAR, primero borrar canales, luego categoría y eventualmente el rol
    if (shouldDelete) {
      if (category) {
        const children = interaction.guild.channels.cache.filter(ch => ch.parentId === category.id);
        for (const ch of children.values()) {
          await ch.delete(`Eliminar proyecto ${baseName} por ${interaction.user.tag}`);
          affected.deleted.channels++;
        }
        await category.delete(`Eliminar proyecto ${baseName} por ${interaction.user.tag}`);
        affected.deleted.category = true;
      }
      if (shouldDeleteRole && projRole) {
        await projRole.delete(`Eliminar rol de proyecto ${baseName} por ${interaction.user.tag}`);
        affected.deleted.role = true;
      }
      const msg = [
        `🗑️ **Proyecto eliminado**: ${baseName}`,
        `- Canales eliminados: **${affected.deleted.channels}**`,
        `- Categoría eliminada: **${affected.deleted.category ? 'sí' : 'no'}**`,
        `- Rol eliminado: **${affected.deleted.role ? 'sí' : 'no'}**`,
      ].join('\n');
      return interaction.editReply({ content: msg });
    }

    // ARCHIVAR (no eliminar)
    // 1) Bloquear permisos de escritura/habla al rol del proyecto (manteniendo visibilidad)
    if (category && projRole) {
      const children = interaction.guild.channels.cache
        .filter(ch => ch.parentId === category.id);

      for (const ch of children.values()) {
        if (ch.type === ChannelType.GuildText) {
          // Deny enviar mensajes y reacciones; mantener ViewChannel/ReadHistory
          await ch.permissionOverwrites.edit(projRole, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: false,
            AddReactions: false,
            AttachFiles: false,
          });
          // Marcar como archivado en el nombre (idempotente)
          const archivedName = ch.name.startsWith('🗄️-') ? ch.name : `🗄️-${ch.name.replace(/^📌-/,'')}`;
          if (archivedName !== ch.name) {
            await ch.setName(archivedName).catch(() => {});
            affected.renamed.push(`#${archivedName}`);
          }
          affected.text.push(`#${ch.name}`);
        } else if (ch.type === ChannelType.GuildVoice) {
          await ch.permissionOverwrites.edit(projRole, {
            ViewChannel: true,
            Connect: false,
            Speak: false,
            Stream: false,
          });
          // Renombrar voz también
          const archivedName = ch.name.startsWith('🗄️-') ? ch.name : `🗄️-${ch.name.replace(/^🔊-/,'')}`;
          if (archivedName !== ch.name) {
            await ch.setName(archivedName).catch(() => {});
            affected.renamed.push(`🔊 ${archivedName}`);
          }
          affected.voice.push(ch.name);
        }
      }
      // Renombrar categoría
      const newCatName = category.name.startsWith('🗄️ ') ? category.name : category.name.replace(/^📁 /, '🗄️ ');
      if (newCatName !== category.name) {
        await category.setName(newCatName).catch(() => {});
      }
    }

    // 2) Mover a categoría general de archivo si corresponde
    if (shouldMoveToArchive && category) {
      let archiveCat = interaction.guild.channels.cache.find(
        ch => ch.type === ChannelType.GuildCategory && ch.name === '🗄️ archived'
      );
      if (!archiveCat) {
        archiveCat = await interaction.guild.channels.create({
          name: '🗄️ archived',
          type: ChannelType.GuildCategory,
          reason: `Crear categoría de archivo por ${interaction.user.tag}`,
        });
      }
      // Mover la categoría no es posible directamente; movemos los hijos bajo "🗄️ archived"
      const children = interaction.guild.channels.cache.filter(ch => ch.parentId === category.id);
      for (const ch of children.values()) {
        await ch.setParent(archiveCat.id, { lockPermissions: false }).catch(() => {});
      }
      affected.moved = true;
    }

    const lines = [
      `📦 **Proyecto archivado**: ${baseName}`,
      projRole ? `- Rol del proyecto: **@${projRole.name}** (visibilidad: sí, escritura/habla: bloqueada)` : `- Rol del proyecto: *(no encontrado)*`,
      category ? `- Categoría original: **${category.name}**` : `- Categoría: *(no encontrada)*`,
      affected.text.length ? `- Canales de texto afectados: ${affected.text.length}` : '',
      affected.voice.length ? `- Canales de voz afectados: ${affected.voice.length}` : '',
      affected.renamed.length ? `- Renombrados: ${affected.renamed.join(', ')}` : '',
      shouldMoveToArchive ? `- Movidos a **🗄️ archived**: **${affected.moved ? 'sí' : 'no (n/a)'}**` : '- Movidos a 🗄️ archived: no',
      `\nℹ️ Puedes reabrir manualmente restaurando permisos o con un futuro comando /open-project.`,
    ].filter(Boolean);

    return interaction.editReply({ content: lines.join('\n') });
  } catch (err) {
    console.error('close-project error:', err);
    return interaction.editReply({
      content: '💥 Ocurrió un error al archivar. Revisá permisos del bot y jerarquía.',
    });
  }
}
