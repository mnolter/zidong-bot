import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// Export N O M B R A D O  (no default)
export const data = new SlashCommandBuilder()
  .setName('grant')
  .setDescription('Asigna un rol a un usuario')
  .addUserOption(option =>
    option.setName('usuario')
      .setDescription('Usuario al que darás el rol')
      .setRequired(true))
  .addRoleOption(option =>
    option.setName('rol')
      .setDescription('Rol a asignar')
      .setRequired(true))
  // Solo quien tenga "Manage Roles" ve/usa el comando
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false);

export async function execute(interaction) {
  // Permisos del invocador (doble check por si cambian los defaults)
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ Necesitás permiso **Manage Roles**.', ephemeral: true });
  }

  // Permisos del bot
  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ El bot no tiene permiso **Manage Roles** en este servidor.', ephemeral: true });
  }

  const usuario = interaction.options.getUser('usuario', true);
  const rol = interaction.options.getRole('rol', true);

  // No permitir roles "managed" (integraciones) o superiores al bot
  if (rol.managed) {
    return interaction.reply({ content: '⚠️ No se puede asignar un rol administrado por una integración.', ephemeral: true });
  }
  if (rol.position >= me.roles.highest.position) {
    return interaction.reply({ content: '⚠️ No puedo asignar ese rol porque está por encima (o igual) del rol más alto del bot.', ephemeral: true });
  }

  const miembro = await interaction.guild.members.fetch(usuario.id).catch(() => null);
  if (!miembro) {
    return interaction.reply({ content: '❌ No pude encontrar a ese miembro en el servidor.', ephemeral: true });
  }

  // Evitar que un moderador otorgue un rol superior a su propio rol más alto
  const invocador = interaction.member; // GuildMember
  if (invocador && rol.position >= invocador.roles.highest.position && !invocador.permissions.has('Administrator')) {
    return interaction.reply({ content: '⚠️ No podés asignar un rol que sea igual o superior a tu rol más alto.', ephemeral: true });
  }

  if (miembro.roles.cache.has(rol.id)) {
    return interaction.reply({ content: `ℹ️ ${usuario} ya tiene el rol **${rol.name}**.`, ephemeral: true });
  }

  try {
    await miembro.roles.add(rol, `Grant por ${interaction.user.tag}`);
    return interaction.reply({ content: `✅ Se asignó el rol **${rol.name}** a ${usuario}.`, ephemeral: true });
  } catch (error) {
    console.error('grant error:', error);
    return interaction.reply({ content: '❌ No pude asignar el rol. Revisá permisos y jerarquía.', ephemeral: true });
  }
}

