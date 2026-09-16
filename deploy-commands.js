// ═══════════════════════════════════════
// Registra los slash commands del bot en el servidor.
// Correr una vez (y cada vez que cambies un comando) con: node deploy-commands.js
// ═══════════════════════════════════════
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('postular-arbitro')
    .setDescription('Postúlate para ser árbitro de la LFPP')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('verificar')
    .setDescription('Vincula tu cuenta de Roblox con tu Discord (inicio de sesión oficial de Roblox)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('verificar-reset')
    .setDescription('(Admin) Elimina el vínculo de Roblox de un usuario para que pueda volver a verificarse')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario de Discord a reiniciar')
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('quien-es')
    .setDescription('(Admin) Consulta qué cuenta de Roblox tiene vinculada un usuario de Discord')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario de Discord a consultar')
        .setRequired(true)
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
      console.error('Falta CLIENT_ID o GUILD_ID en el .env. Revisa el README/instrucciones.');
      process.exit(1);
    }

    console.log('Registrando comandos slash...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Comandos registrados correctamente ✅');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
})();
