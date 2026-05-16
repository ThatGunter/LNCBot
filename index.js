const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder,
    Routes,
    REST
} = require('discord.js');

const express = require('express');
const app = express();

// IMPORTANT: Use environment variable OR replace with your NEW token
const TOKEN = process.env.TOKEN;

const CLIENT_ID = '1501874024249032724';
const GUILD_ID = '1501863034866630697';

const REQUEST_CHANNEL_ID = '1501866176039489566';
const REQUESTS_CHANNEL_ID = '1501866222285750373';
const WAIT_CHANNEL_ID = '1501866198059581463';
const PRIVATE_REQUESTS_CHANNEL_ID = '1501864935678939226';

const CREW_ROLE = 'Late Night Crew';
const ADMIN_ROLE = 'Admin';

const GAME_CHANNELS = {
    games1: {
        name: "Late Night Games 1",
        id: "1501864531964723272"
    },
    games2: {
        name: "Late Night Games 2",
        id: "1501864608926007378"
    },
    games3: {
        name: "Late Night Games 3",
        id: "1501864559961571400"
    },
	private: {
		name: "Private",
		id: "1501864963952742541"
	},
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const cooldowns = new Map();
const requestTimeouts = new Map();

client.once('ready', () => {
    console.log(`${client.user.tag} is online`);
});

const commands = [
    new SlashCommandBuilder()
        .setName('setuprequests')
        .setDescription('Creates the request panel'),

    new SlashCommandBuilder()
        .setName('requesttimeout')
        .setDescription('Timeout a user from requesting')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Minutes')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('cleartimeout')
        .setDescription('Remove a user request timeout')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User')
                .setRequired(true)
        )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands }
    );
    console.log('Slash commands registered');
})();

client.on('guildMemberAdd', async member => {

    const role = member.guild.roles.cache.find(
        r => r.name === 'Guest'
    );

    if (!role) {
        console.log('Guest role not found');
        return;
    }

    try {
        await member.roles.add(role);
        console.log(`Gave Guest role to ${member.user.tag}`);
    } catch (err) {
        console.error(err);
    }
});

app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(3000, () => {
    console.log('Express server running on port 3000');
});

client.on('interactionCreate', async interaction => {

    // =========================
    // SLASH COMMANDS
    // =========================
    if (interaction.isChatInputCommand()) {

        // CREATE PANEL
        if (interaction.commandName === 'setuprequests') {

            const channel =
                interaction.guild.channels.cache.get(REQUEST_CHANNEL_ID);

            const embed = new EmbedBuilder()
                .setTitle('Late Night Games Requests')
                .setDescription('Click a button to request a game channel.')
                .setColor('Blue');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('request_games1')
                    .setLabel('Late Night Games 1')
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId('request_games2')
                    .setLabel('Late Night Games 2')
                    .setStyle(ButtonStyle.Primary),

                new ButtonBuilder()
                    .setCustomId('request_games3')
                    .setLabel('Late Night Games 3')
                    .setStyle(ButtonStyle.Primary),
					
				new ButtonBuilder()
					.setCustomId('request_private')
					.setLabel('Join Private Call')
					.setStyle(ButtonStyle.Secondary)
            );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

            return interaction.reply({
                content: 'Request panel created.',
                ephemeral: true
            });
        }

        // TIMEOUT USER
        if (interaction.commandName === 'requesttimeout') {

            const isAdmin =
                interaction.member.roles.cache.some(
                    r => r.name === ADMIN_ROLE
                );

            if (!isAdmin) {
                return interaction.reply({
                    content: 'No permission.',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('user');
            const minutes = interaction.options.getInteger('minutes');

            requestTimeouts.set(
                user.id,
                Date.now() + minutes * 60000
            );

            return interaction.reply({
                content: `${user.tag} timed out for ${minutes} minute(s).`
            });
        }

        // CLEAR TIMEOUT
        if (interaction.commandName === 'cleartimeout') {

            const isAdmin =
                interaction.member.roles.cache.some(
                    r => r.name === ADMIN_ROLE
                );

            if (!isAdmin) {
                return interaction.reply({
                    content: 'No permission.',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('user');

            if (requestTimeouts.has(user.id)) {
                requestTimeouts.delete(user.id);

                return interaction.reply({
                    content: `${user.tag}'s timeout removed.`
                });
            }

            return interaction.reply({
                content: `${user.tag} is not timed out.`,
                ephemeral: true
            });
        }
    }

    // =========================
    // BUTTONS
    // =========================
    if (interaction.isButton()) {

        // REQUEST BUTTONS
        if (interaction.customId.startsWith('request_')) {

            const member = interaction.member;

            if (
                !member.voice.channel ||
                member.voice.channel.id !== WAIT_CHANNEL_ID
            ) {
                return interaction.reply({
                    content: 'You must be in Wait VC.',
                    ephemeral: true
                });
            }

            // timeout check
            if (requestTimeouts.has(member.id)) {
                const expires = requestTimeouts.get(member.id);

                if (Date.now() < expires) {
                    return interaction.reply({
                        content: 'You are timed out from requesting.',
                        ephemeral: true
                    });
                }

                requestTimeouts.delete(member.id);
            }

            // cooldown
            if (cooldowns.has(member.id)) {
                const expires = cooldowns.get(member.id);

                if (Date.now() < expires) {
                    return interaction.reply({
                        content: 'Wait before requesting again.',
                        ephemeral: true
                    });
                }
            }

            cooldowns.set(member.id, Date.now() + 60000);

            const gameKey = interaction.customId.split('_')[1];
            const game = GAME_CHANNELS[gameKey];
			
			if (!game) {
				return interaction.reply({
					content: 'Invalid request type.',
					ephemeral: true
				});
			}

            let targetChannelId = REQUESTS_CHANNEL_ID;

			if (gameKey === 'private') {
				targetChannelId = PRIVATE_REQUESTS_CHANNEL_ID;
			}

			const channel =
				interaction.guild.channels.cache.get(targetChannelId);
				
			if (!channel) {
				return interaction.reply({
					content: 'Request channel not found.',
					ephemeral: true
				});
			}
			
            const embed = new EmbedBuilder()
                .setTitle('Game Request')
                .setDescription(`${member} requested **${game.name}**`)
                .setColor('Blue');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${member.id}_${gameKey}`)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(`deny_${member.id}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

            return interaction.reply({
                content: 'Request sent.',
                ephemeral: true
            });
        }

        // STAFF ACTIONS
        const isCrew =
            interaction.member.roles.cache.some(
                r => r.name === CREW_ROLE
            );

        if (!isCrew) return;

        // APPROVE
        if (interaction.customId.startsWith('approve_')) {

            const [, userId, gameKey] =
                interaction.customId.split('_');

            const member =
                await interaction.guild.members.fetch(userId);

            const game = GAME_CHANNELS[gameKey];

            const vc =
                interaction.guild.channels.cache.get(game.id);

            await member.voice.setChannel(vc);

            return interaction.update({
                content: `${member.user.tag} approved for ${game.name}`,
                embeds: [],
                components: []
            });
        }

        // DENY
        if (interaction.customId.startsWith('deny_')) {

            const userId =
                interaction.customId.split('_')[1];

            const member =
                await interaction.guild.members.fetch(userId);

            return interaction.update({
                content: `${member.user.tag} denied.`,
                embeds: [],
                components: []
            });
        }
    }
});

client.login(TOKEN);