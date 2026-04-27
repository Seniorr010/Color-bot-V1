require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// Sabitlər
// ─────────────────────────────────────────────
const PREFIX      = '!';
const ROLE_PREFIX = '';
const COLORS_FILE = path.join(__dirname, 'colors.json');

// Default rənglər (modal ilk dəfə açılanda göstərilir)
const DEFAULT_COLORS_TEXT =
  '🔴 Red #E74C3C\n' +
  '🟠 Orange #E67E22\n' +
  '🟡 Yellow #F1C40F\n' +
  '🟢 Green #2ECC71\n' +
  '🔵 Blue #3498DB\n' +
  '🟣 Purple #9B59B6\n' +
  '🩷 Pink #FF69B4\n' +
  '🟤 Brown #8B4513\n' +
  '⚪ White #FFFFFF\n' +
  '⚫ Black #2C2C2C';

// ─────────────────────────────────────────────
// Rəng konfiqinin saxlanması
// ─────────────────────────────────────────────
function loadColors() {
  if (fs.existsSync(COLORS_FILE)) {
    try { return JSON.parse(fs.readFileSync(COLORS_FILE, 'utf8')); } catch { return {}; }
  }
  return {};
}

function saveColors(data) {
  fs.writeFileSync(COLORS_FILE, JSON.stringify(data, null, 2));
}

let guildColors = loadColors();

// ─────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot aktif: ${client.user.tag}`);
  console.log(`📋 Prefix: ${PREFIX}   |   Komanda: ${PREFIX}color`);
});

// ─────────────────────────────────────────────
// Yardımçı: Rəng paneli yarat
//  colors = [{ emoji, name, hex (int) }, ...]
// ─────────────────────────────────────────────
function buildColorPanel(colors) {
  const embed = new EmbedBuilder()
    .setTitle('🎨 Rəng Seçimi')
    .setDescription(
      'Aşağıdakı düymələrə klikləyərək öz rənginizi seçin!\n' +
      'Yeni rəng seçdikdə köhnə rəng avtomatik silinir.\n\n' +
      colors.map(c => `${c.emoji} : **${c.name}** rəngini almaq üçün`).join('\n')
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Rəng Rolu Botu • Bir rəng seç!' })
    .setTimestamp();

  const rows = [];
  for (let i = 0; i < colors.length; i += 5) {
    const row = new ActionRowBuilder();
    colors.slice(i, i + 5).forEach(color => {
      // customId format: color|NAME|HEX  (| separator, max 100 chars)
      const hexStr = color.hex.toString(16).padStart(6, '0').toUpperCase();
      const customId = `color|${color.name}|${hexStr}`;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(customId.slice(0, 100))
          .setLabel(color.name.slice(0, 80))
          .setEmoji(color.emoji)
          .setStyle(ButtonStyle.Secondary)
      );
    });
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

// ─────────────────────────────────────────────
// Yardımçı: İstifadəçinin bütün rəng rolarını sil
// ─────────────────────────────────────────────
async function removeColorRoles(member, guildId) {
  const colors = guildColors[guildId] || [];
  const colorRoleNames = colors.map(c => `${ROLE_PREFIX}${c.name}`);

  const toRemove = member.roles.cache.filter(r => {
    if (ROLE_PREFIX !== '') {
      return r.name.startsWith(ROLE_PREFIX);
    }
    return colorRoleNames.includes(r.name);
  });

  if (toRemove.size > 0) {
    try {
      await member.roles.remove(toRemove);
    } catch (err) {
      console.error('❌ Köhnə rolları silərkən xəta:', err.message);
    }
  }
}

// ─────────────────────────────────────────────
// Yardımçı: Rol al ya da yarat
// ─────────────────────────────────────────────
async function getOrCreateRole(guild, colorName, hexInt) {
  const roleName = `${ROLE_PREFIX}${colorName}`;
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    const botPosition = guild.members.me.roles.highest.position;
    const targetPosition = botPosition > 1 ? botPosition - 1 : 1;

    role = await guild.roles.create({
      name: roleName,
      color: hexInt & 0xFFFFFF,
      position: targetPosition,
      reason: 'Rəng Rolu Botu tərəfindən yaradıldı',
    });
    console.log(`🎨 Yeni rol yaradıldı: ${roleName} (Mövqe: ${targetPosition})`);
  }
  return role;
}

// ─────────────────────────────────────────────
// Mətni rəng siyahısına çevir
// Format: emoji ad #RRGGBB  (hər sətir bir rəng)
// ─────────────────────────────────────────────
function parseColors(text) {
  const colors = [];
  const errors = [];

  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    // emoji name #HEX   ya da   emoji name
    const match = line.match(/^(\S+)\s+(.+?)(?:\s+#([0-9A-Fa-f]{6}))?$/);
    if (match) {
      const hexStr = match[3] || '5865F2';
      colors.push({
        emoji: match[1],
        name:  match[2].trim(),
        hex:   parseInt(hexStr, 16),
      });
    } else {
      errors.push(line);
    }
  }

  return { colors, errors };
}

// ─────────────────────────────────────────────
// PREFIX KOMANDA: !color
// ─────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const cmd = message.content.slice(PREFIX.length).trim().split(/\s+/)[0].toLowerCase();
  if (cmd !== 'color') return;

  // Admin yoxlaması
  if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return message.reply({ content: '❌ Bu komandı yalnız **Rol Yönet** icazəsi olan adminlər işlədə bilər!' });
  }

  // Cari rəngləri göstər (varsa)
  const existing = guildColors[message.guild.id] || [];
  const currentText = existing.length
    ? '\n\n**Cari rənglər:** ' + existing.map(c => `${c.emoji} ${c.name}`).join(' • ')
    : '\n\n*Hələ heç bir rəng tənzimlənməyib — varsayılan rənglər yüklənəcək.*';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_color_config')
      .setLabel('Rəngləri Tənzimlə')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary),
  );

  await message.reply({
    content: `## 🎨 Rəng Paneli${currentText}\n\nAşağıdakı düyməyə basaraq rəngləri əlavə et/redaktə et, sonra **Tamam** bas — bot bu kanalda paneli göndərəcək.`,
    components: [row],
  }).catch(err => {
    console.error('❌ Panel mesajı göndərilə bilmədi:', err.message);
  });
});

// ─────────────────────────────────────────────
// İNTERAKSİYALAR
// ─────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ── DÜYMƏ: Konfiq modal aç ──────────────────
  if (interaction.isButton() && interaction.customId === 'open_color_config') {
    // Yalnız admin
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Yalnız adminlər bu düyməni istifadə edə bilər!', ephemeral: true });
    }

    // Modal üçün mövcud rəngləri hazırla
    const existing = guildColors[interaction.guild.id] || [];
    const prefillText = existing.length
      ? existing.map(c => {
          const hexStr = '#' + c.hex.toString(16).padStart(6, '0').toUpperCase();
          return `${c.emoji} ${c.name} ${hexStr}`;
        }).join('\n')
      : DEFAULT_COLORS_TEXT;

    const modal = new ModalBuilder()
      .setCustomId('color_config_modal')
      .setTitle('🎨 Rəng Tənzimləmə');

    const textInput = new TextInputBuilder()
      .setCustomId('colors_input')
      .setLabel('Rənglər — hər sətir: emoji ad #HEX')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(prefillText)
      .setPlaceholder('🔴 Qırmızı #E74C3C\n🟢 Yaşıl #2ECC71\n🔵 Mavi #3498DB')
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await interaction.showModal(modal);
    return;
  }

  // ── MODAL: Rəngləri saxla + panel göndər ───
  if (interaction.isModalSubmit() && interaction.customId === 'color_config_modal') {
    await interaction.deferReply({ ephemeral: true });

    const rawText = interaction.fields.getTextInputValue('colors_input');
    const { colors, errors } = parseColors(rawText);

    if (colors.length === 0) {
      return interaction.editReply(
        '❌ Heç bir rəng ayrıştırılamadı!\n' +
        '**Format:** `emoji ad #RRGGBB`\nNümunə: `🔴 Qırmızı #E74C3C`'
      );
    }

    if (colors.length > 25) {
      return interaction.editReply('❌ Maksimum **25 rəng** əlavə edə bilərsiniz (Discord düymə limiti).');
    }

    // Yadda saxla
    guildColors[interaction.guild.id] = colors;
    saveColors(guildColors);

    // Kanalda paneli göndər
    const panel = buildColorPanel(colors);
    try {
      await interaction.channel.send(panel);
    } catch (err) {
      console.error('❌ Panel göndərmə xətası:', err.message);
      return interaction.editReply('❌ **Xəta:** Paneli bu kanala göndərə bilmədim. Botun bu kanalda "Mesaj Göndər" yetkisi olduğundan əmin olun!');
    }

    let reply = `✅ **${colors.length} rənglə** panel bu kanalda göndərildi!`;
    if (errors.length > 0) {
      reply += `\n\n⚠️ Ayrıştırılamayan sətrlər (${errors.length}):\n` +
               errors.map(e => `\`${e}\``).join('\n');
    }
    return interaction.editReply(reply);
  }

  // ── DÜYMƏ: Rəng rolu ver ─────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('color|')) {
    await interaction.deferReply({ ephemeral: true });

    // customId: color|NAME|HEX
    const [, colorName, hexStr] = interaction.customId.split('|');
    const hexInt = parseInt(hexStr, 16);

    const guild  = interaction.guild;
    const member = interaction.member;
    const botMember = guild.members.me;

    // Bot yetkisi yoxlaması
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.editReply('❌ Botun **Rol Yönet** yetkisi yoxdur! Server ayarlarından bota bu yetki ver.');
    }

    try {
      // Yeni rolü al / yarat
      const role = await getOrCreateRole(guild, colorName, hexInt);

      // Əgər istifadəçidə zatən bu rol varsa, onu sil (Toggle off)
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        const embed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setDescription(`❌ **${colorName}** rəngi uğurla silindi!`);
        return interaction.editReply({ embeds: [embed] });
      }

      // Bot rolu yetərincə yuxarıdamı?
      if (role.position >= botMember.roles.highest.position) {
        return interaction.editReply(
          `❌ **${role.name}** rolu botun rolundan yüksəkdir.\nServer Ayarları → Rollar → Bot rolunu yuxarı sürüklə!`
        );
      }

      // Köhnə rəng rollarını sil (istifadəçidə yalnız 1 rəng rolu qalsın)
      await removeColorRoles(member, guild.id);

      // Yeni rolü ver (Toggle on)
      await member.roles.add(role);

      const embed = new EmbedBuilder()
        .setColor(hexInt & 0xFFFFFF)
        .setDescription(`✅ **${colorName}** rəngi uğurla seçildi!`);

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('❌ Rol vermə xətası:', err);
      return interaction.editReply(
        '❌ **Rol verilə bilmədi!**\n' +
        '**Səbəb:** Botun öz rolu (`Color`) rollar siyahısında ən aşağıdadır.\n' +
        '**Həlli:** Server Ayarları -> Rollar (Roles) bölməsinə girin və botun rolunu mouse ilə tutub yuxarı qaldırın!'
      );
    }
  }
});

// ─────────────────────────────────────────────
// Botu başlat
// ─────────────────────────────────────────────
client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Giriş xətası:', err.message);
  process.exit(1);
});
