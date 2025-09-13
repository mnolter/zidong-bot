// commands/grant.js
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('grant')
    .setDescription('Asigna un rol a un usuario')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario al que darás el rol')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('rol')
        .setDescription('Rol a asignar')
        .setRequired(true)),

  async execute(interaction) {
    const usuario = interaction.options.getUser('usuario', true);
    const rol = interaction.options.getRole('rol', true);
    const miembro = await interaction.guild.members.fetch(usuario.id);

    if (miembro.roles.cache.has(rol.id)) {
      return interaction.reply({ content: `ℹ️ ${usuario} ya tiene el rol **${rol.name}**.`, ephemeral: true });
    }

    try {
      await miembro.roles.add(rol);
      return interaction.reply({ content: `✅ Se asignó el rol **${rol.name}** a ${usuario}.`, ephemeral: true });
    } catch (error) {
      console.error(error);
      return interaction.reply({ content: '❌ No pude asignar el rol. Revisá permisos y jerarquía.', ephemeral: true });
    }
  }
};
