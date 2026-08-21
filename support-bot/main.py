"""Bot Discord d'assistance PTFS — parle uniquement dans les tickets."""
from __future__ import annotations

import logging
import os

import aiohttp
import discord

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("support-bot")

WEBLOGBOOK_URL = os.getenv("WEBLOGBOOK_URL", "https://mixouairlinesptfsweblogbook.com").rstrip("/")
SECRET = (os.getenv("SUPPORT_BOT_SECRET") or os.getenv("ATIS_WEBHOOK_SECRET") or "").strip()
TOKEN = (os.getenv("SUPPORT_BOT_TOKEN") or "").strip()

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.members = True

bot = discord.Client(intents=intents)


async def api_post(path: str, payload: dict) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "x-support-bot-secret": SECRET}
    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{WEBLOGBOOK_URL}{path}", json=payload, headers=headers) as resp:
            try:
                data = await resp.json(content_type=None)
            except Exception:
                data = {}
            return resp.status, data if isinstance(data, dict) else {}


class ReasonModal(discord.ui.Modal, title="Ouvrir un ticket"):
    reason = discord.ui.TextInput(
        label="Quelle est la raison de l'ouverture de votre ticket ?",
        style=discord.TextStyle.paragraph,
        max_length=1000,
        required=True,
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        status, data = await api_post(
            "/api/support/bot/open",
            {
                "discord_user_id": str(interaction.user.id),
                "discord_username": str(interaction.user),
                "reason": str(self.reason.value),
            },
        )
        if status == 409:
            ch = data.get("channel_id")
            await interaction.followup.send(
                f"Tu as déjà un ticket ouvert : <#{ch}>" if ch else data.get("message", "Ticket déjà ouvert."),
                ephemeral=True,
            )
            return
        if status >= 400:
            await interaction.followup.send(data.get("error") or "Impossible d'ouvrir le ticket.", ephemeral=True)
            return
        ch = data.get("channel_id")
        await interaction.followup.send(f"Ticket créé : <#{ch}>", ephemeral=True)
        if ch and interaction.guild:
            channel = interaction.guild.get_channel(int(ch))
            if channel:
                await channel.send(view=TicketActions())


class TicketActions(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(label="C'est résolu", style=discord.ButtonStyle.success, custom_id="support_resolved")
    async def resolved(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.defer()
        await api_post("/api/support/bot/close", {"channel_id": str(interaction.channel_id), "closed_by": f"user:{interaction.user.id}"})
        try:
            await interaction.followup.send("Ticket fermé. Merci !", ephemeral=True)
        except discord.HTTPException:
            pass

    @discord.ui.button(label="Pas résolu — staff", style=discord.ButtonStyle.danger, custom_id="support_need_staff")
    async def need_staff(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.defer()
        await api_post(
            "/api/support/bot/message",
            {
                "channel_id": str(interaction.channel_id),
                "content": "L'utilisateur indique que ce n'est pas résolu. Appeler un staff.",
                "from_staff": False,
            },
        )

    @discord.ui.button(label="Fermer (staff)", style=discord.ButtonStyle.secondary, custom_id="support_staff_close")
    async def staff_close(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        if not isinstance(interaction.user, discord.Member) or not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message("Staff uniquement.", ephemeral=True)
            return
        await interaction.response.defer()
        await api_post("/api/support/bot/close", {"channel_id": str(interaction.channel_id), "closed_by": f"staff:{interaction.user.id}"})


@bot.event
async def on_ready() -> None:
    bot.add_view(TicketActions())
    log.info("Support bot connecté: %s", bot.user)


@bot.event
async def on_interaction(interaction: discord.Interaction) -> None:
    if interaction.type != discord.InteractionType.component:
        return
    cid = interaction.data.get("custom_id") if interaction.data else None
    if cid == "support_open_ticket":
        await interaction.response.send_modal(ReasonModal())
        return


@bot.event
async def on_message(message: discord.Message) -> None:
    if message.author.bot or not message.guild:
        return
    if not isinstance(message.channel, discord.TextChannel):
        return
    if not message.channel.category:
        return
    # Un salon ticket a un nom commençant par un emoji statut
    name = message.channel.name or ""
    if not (name.startswith("🤖") or name.startswith("🔴") or name.startswith("🟠") or name.startswith("🟢")):
        return

    is_staff = False
    if isinstance(message.author, discord.Member):
        is_staff = message.author.guild_permissions.manage_channels

    if is_staff:
        await api_post(
            "/api/support/bot/message",
            {"channel_id": str(message.channel.id), "content": message.content, "from_staff": True},
        )
        return

    status, data = await api_post(
        "/api/support/bot/message",
        {"channel_id": str(message.channel.id), "content": message.content, "from_staff": False},
    )
    if status == 404:
        return
    # L'API poste déjà la réponse IA dans le salon


def main() -> None:
    if not TOKEN:
        raise SystemExit("SUPPORT_BOT_TOKEN manquant")
    if not SECRET:
        raise SystemExit("SUPPORT_BOT_SECRET manquant")
    bot.run(TOKEN)


if __name__ == "__main__":
    main()
