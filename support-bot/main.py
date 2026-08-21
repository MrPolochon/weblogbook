"""Bot Discord d'assistance PTFS — parle uniquement dans les tickets."""
from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp
import discord
from discord.ext import tasks

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("support-bot")

WEBLOGBOOK_URL = os.getenv("WEBLOGBOOK_URL", "https://mixouairlinesptfsweblogbook.com").rstrip("/")
SECRET = (os.getenv("SUPPORT_BOT_SECRET") or os.getenv("ATIS_WEBHOOK_SECRET") or "").strip()
TOKEN = (os.getenv("SUPPORT_BOT_TOKEN") or "").strip()

_runtime: dict[str, Any] = {
    "staff_role_id": None,
    "instructor_role_id": None,
    "category_ids": {},
    "panel_channel_id": None,
    "panel_message_id": None,
}

_ack_ids: set[int] = set()


async def api_post(path: str, payload: dict) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "x-support-bot-secret": SECRET}
    timeout = aiohttp.ClientTimeout(total=90)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{WEBLOGBOOK_URL}{path}", json=payload, headers=headers) as resp:
            try:
                data = await resp.json(content_type=None)
            except Exception:
                data = {}
            return resp.status, data if isinstance(data, dict) else {}


async def api_get(path: str) -> tuple[int, dict]:
    headers = {"x-support-bot-secret": SECRET}
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(f"{WEBLOGBOOK_URL}{path}", headers=headers) as resp:
            try:
                data = await resp.json(content_type=None)
            except Exception:
                data = {}
            return resp.status, data if isinstance(data, dict) else {}


async def refresh_runtime() -> None:
    status, data = await api_get("/api/support/bot/runtime")
    if status < 400 and data:
        _runtime["staff_role_id"] = data.get("staff_role_id")
        _runtime["instructor_role_id"] = data.get("instructor_role_id")
        cats = data.get("category_ids") or {}
        _runtime["category_ids"] = set(str(v) for v in cats.values() if v)
        _runtime["panel_channel_id"] = data.get("panel_channel_id")
        _runtime["panel_message_id"] = data.get("panel_message_id")
        log.info(
            "Config site: %s sections, staff_role=%s instructor_role=%s panel=%s/%s",
            len(_runtime["category_ids"]),
            _runtime["staff_role_id"],
            _runtime["instructor_role_id"],
            _runtime["panel_channel_id"],
            _runtime["panel_message_id"],
        )
    else:
        log.warning("Runtime API indisponible (%s) url=%s/api/support/bot/runtime", status, WEBLOGBOOK_URL)


def is_ticket_channel(channel: discord.abc.GuildChannel) -> bool:
    if not isinstance(channel, discord.TextChannel):
        return False
    cats = _runtime.get("category_ids") or set()
    if channel.category_id and str(channel.category_id) in cats:
        return True
    name = channel.name or ""
    return name.startswith("🤖") or name.startswith("🔴") or name.startswith("🟠") or name.startswith("🟢") or name.startswith("tkt-")


def is_staff_member(member: discord.Member) -> bool:
    rids = [rid for rid in (_runtime.get("staff_role_id"), _runtime.get("instructor_role_id")) if rid]
    if rids and any(str(r.id) in {str(x) for x in rids} for r in member.roles):
        return True
    return member.guild_permissions.manage_channels


async def send_open_ticket_modal(interaction: discord.Interaction) -> None:
    """ACK immédiat (< 3s). Filet gateway si l'endpoint HTTP n'est pas configuré."""
    iid = interaction.id
    if iid in _ack_ids:
        return
    _ack_ids.add(iid)
    if len(_ack_ids) > 500:
        _ack_ids.clear()
    if interaction.response.is_done():
        return
    try:
        await interaction.response.send_modal(ReasonModal())
        log.info("ACK modal support_open_ticket user=%s", interaction.user.id)
    except discord.InteractionResponded:
        return
    except discord.HTTPException:
        log.exception("send_modal support_open_ticket a échoué")


def _component_custom_id(interaction: discord.Interaction) -> str | None:
    if interaction.type is not discord.InteractionType.component:
        return None
    data = interaction.data
    if data is None:
        return None
    cid = data.get("custom_id") if isinstance(data, dict) else None
    if not cid:
        cid = getattr(data, "custom_id", None)
    return str(cid) if cid else None


class ReasonModal(discord.ui.Modal, title="Ouvrir un ticket"):
    reason = discord.ui.TextInput(
        label="Quelle est la raison de votre ticket ?",
        style=discord.TextStyle.paragraph,
        max_length=1000,
        required=True,
        custom_id="reason",
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        if not interaction.response.is_done():
            await interaction.response.defer(ephemeral=True)
        try:
            status, data = await api_post(
                "/api/support/bot/open",
                {
                    "discord_user_id": str(interaction.user.id),
                    "discord_username": str(interaction.user),
                    "reason": str(self.reason.value),
                },
            )
        except Exception:
            log.exception("API /api/support/bot/open a échoué")
            await interaction.followup.send("Impossible d'ouvrir le ticket (erreur serveur).", ephemeral=True)
            return
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


class PanelView(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(label="Ouvrir un ticket", style=discord.ButtonStyle.primary, custom_id="support_open_ticket", emoji="🎫")
    async def open_ticket(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await send_open_ticket_modal(interaction)


class TicketActions(discord.ui.View):
    def __init__(self) -> None:
        super().__init__(timeout=None)

    @discord.ui.button(label="C'est résolu", style=discord.ButtonStyle.success, custom_id="support_resolved")
    async def resolved(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.defer(ephemeral=True)
        await api_post("/api/support/bot/close", {"channel_id": str(interaction.channel_id), "closed_by": f"user:{interaction.user.id}"})
        try:
            await interaction.followup.send("Ticket fermé. Merci !", ephemeral=True)
        except discord.HTTPException:
            pass

    @discord.ui.button(label="Pas résolu — staff", style=discord.ButtonStyle.danger, custom_id="support_need_staff")
    async def need_staff(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.defer(ephemeral=True)
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
        user = interaction.user
        staff = isinstance(user, discord.Member) and is_staff_member(user)
        if not staff:
            await interaction.response.send_message("Staff uniquement.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        await api_post("/api/support/bot/close", {"channel_id": str(interaction.channel_id), "closed_by": f"staff:{interaction.user.id}"})


@tasks.loop(minutes=5)
async def runtime_loop() -> None:
    await refresh_runtime()


def attach_handlers(client: discord.Client) -> None:
    @client.event
    async def on_interaction(interaction: discord.Interaction) -> None:
        # Si l'endpoint HTTP Interactions est configuré, Discord n'envoie plus ces events au gateway.
        cid = _component_custom_id(interaction)
        if cid != "support_open_ticket":
            return
        await send_open_ticket_modal(interaction)

    @client.event
    async def on_ready() -> None:
        client.add_view(PanelView())
        client.add_view(TicketActions())
        log.info(
            "Support bot connecté: %s (gateway %.0f ms) WEBLOGBOOK_URL=%s — "
            "boutons panel gérés par l'endpoint HTTP Vercel si configuré : "
            "%s/api/support/discord/interactions",
            client.user,
            client.latency * 1000,
            WEBLOGBOOK_URL,
            WEBLOGBOOK_URL,
        )
        await refresh_runtime()
        if not runtime_loop.is_running():
            runtime_loop.start()

    @client.event
    async def on_message(message: discord.Message) -> None:
        if message.author.bot or not message.guild:
            return
        if not is_ticket_channel(message.channel):
            return
        content = (message.content or "").strip()
        if not content:
            return

        author = message.author
        if not isinstance(author, discord.Member):
            try:
                author = await message.guild.fetch_member(message.author.id)
            except discord.HTTPException:
                pass
        from_staff = isinstance(author, discord.Member) and is_staff_member(author)
        try:
            await message.channel.typing()
        except discord.HTTPException:
            pass

        status, _data = await api_post(
            "/api/support/bot/message",
            {"channel_id": str(message.channel.id), "content": content, "from_staff": from_staff},
        )
        if status >= 400:
            log.warning("API message %s: %s", status, _data)


def _intents(*, members: bool, message_content: bool) -> discord.Intents:
    if not members and not message_content:
        return discord.Intents.default()
    intents = discord.Intents.default()
    intents.guilds = True
    intents.message_content = message_content
    intents.members = members
    return intents


def main() -> None:
    if not TOKEN:
        raise SystemExit("SUPPORT_BOT_TOKEN manquant")
    if not SECRET:
        raise SystemExit("SUPPORT_BOT_SECRET manquant")
    log.info("Démarrage bot assistance — site=%s", WEBLOGBOOK_URL)

    plans = [
        {"members": True, "message_content": True, "label": "guilds+message_content+members"},
        {"members": False, "message_content": True, "label": "guilds+message_content (sans members)"},
        {"members": False, "message_content": False, "label": "intents.default() (pas de lecture tickets)"},
    ]

    last_exc: BaseException | None = None
    for i, plan in enumerate(plans):
        if not plan["message_content"]:
            log.error(
                "Message Content Intent refusé ou désactivé. Activez-le sur "
                "https://discord.com/developers/applications → Bot → Privileged Gateway Intents "
                "pour que le bot lise les messages des tickets. "
                "Tentative intents.default() pour rester connecté au gateway "
                "(les boutons du panel sont gérés par l'endpoint HTTP Vercel)."
            )
        log.info("Gateway: essai intents %s", plan["label"])
        client = discord.Client(intents=_intents(members=plan["members"], message_content=plan["message_content"]))
        attach_handlers(client)
        try:
            client.run(TOKEN)
            return
        except discord.PrivilegedIntentsRequired as exc:
            last_exc = exc
            log.warning(
                "PrivilegedIntentsRequired (%s). Nouvel essai avec moins d'intents — pas de crash-loop.",
                plan["label"],
            )
            if i == len(plans) - 1:
                log.error("Échec même avec intents.default(). Vérifiez le token bot.")
                raise

    if last_exc:
        raise last_exc


if __name__ == "__main__":
    main()
