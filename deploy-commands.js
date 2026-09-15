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
