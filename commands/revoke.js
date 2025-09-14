// commands/revoke.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// Export nombrado (no default)
export const data = new SlashCommandBuilder()
  .setName('revoke')
  .setDescription('Quita un rol a un usuario')
  .addUserOption(option =>
    option.setName('usuario')
      .setDescription('Usuario al que quitarás el rol')
      .setRequired(true))
  .addRoleOption(option =>
    option.setName('rol')
      .setDescription('Rol a quitar')
      .setRequired(true))
  // Solo quienes tengan "Manage Roles" pueden usarlo
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false);

export async function execute(interaction) {
  // Verificar permisos del invocador
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ Necesitás permiso **Manage Roles**.', ephemeral: true });
  }

  // Verificar permisos del bot
  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: '⛔ El bot no tiene permiso **Manage Roles** en este servidor.', ephemeral: true });
  }

  const usuario = interaction.options.getUser('usuario', true);
  const rol = interaction.options.getRole('rol', true);

  // Evitar roles gestionados o superiores
  if (rol.managed) {
    return interaction.reply({ content: '⚠️ No se puede quitar un rol administrado por una integración.', ephemeral: true });
  }
  if (rol.position >= me.roles.highest.position) {
    return interaction.reply({ content: '⚠️ No puedo quitar ese rol porque está por encima (o igual) del rol más alto del bot.', ephemeral: true });
  }

  const miembro = await interaction.guild.members.fetch(usuario.id).catch(() => null);
  if (!miembro) {
    return interaction.reply({ content: '❌ No pude encontrar a ese miembro en el servidor.', ephemeral: true });
  }

  // Revisar que el invocador no intente quitar un rol superior a su jerarquía
  const invocador = interaction.member;
  if (invocador && rol.position >= invocador.roles.highest.position && !invocador.permissions.has('Administrator')) {
    return interaction.reply({ content: '⚠️ No podés quitar un rol que sea igual o superior a tu rol más alto.', ephemeral: true });
  }

  if (!miembro.roles.cache.has(rol.id)) {
    return interaction.reply({ content: `ℹ️ ${usuario} no tiene el rol **${rol.name}**.`, ephemeral: true });
  }

  try {
    await miembro.roles.remove(rol, `Revoke por ${interaction.user.tag}`);
    return interaction.reply({ content: `✅ Se quitó el rol **${rol.name}** a ${usuario}.`, ephemeral: true });
  } catch (error) {
    console.error('revoke error:', error);
    return interaction.reply({ content: '❌ No pude quitar el rol. Revisá permisos y jerarquía.', ephemeral: true });
  }
}
