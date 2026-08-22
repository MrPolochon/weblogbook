"""Bot Discord d'assistance PTFS — parle uniquement dans les tickets."""
from __future__ import annotations

import logging
import os
import re
import time
from typing import Any
from urllib.parse import urljoin

import aiohttp
import discord
from discord.ext import tasks

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("support-bot")

SECRET = (os.getenv("SUPPORT_BOT_SECRET") or os.getenv("ATIS_WEBHOOK_SECRET") or "").strip()
TOKEN = (os.getenv("SUPPORT_BOT_TOKEN") or "").strip()


def _site_base() -> str:
    raw = (os.getenv("WEBLOGBOOK_URL") or "https://www.mixouairlinesptfsweblogbook.com").rstrip("/")
    # L'apex 307/308 vers www ; un POST suivi en GET cassait /api/support/bot/message.
    if "://" in raw:
        host = raw.split("://", 1)[1].split("/", 1)[0]
        if host == "mixouairlinesptfsweblogbook.com":
            return raw.replace("://mixouairlinesptfsweblogbook.com", "://www.mixouairlinesptfsweblogbook.com", 1)
    return raw


WEBLOGBOOK_URL = _site_base()

_runtime: dict[str, Any] = {
    "guild_id": None,
    "staff_role_id": None,
    "instructor_role_id": None,
    "required_role_id": None,
    "category_ids": set(),
    "open_channel_ids": set(),
    "panel_channel_id": None,
    "panel_message_id": None,
    "bot_user_id": None,
}

_ack_ids: set[int] = set()
_is_ticket_cache: dict[str, tuple[bool, float]] = {}
_empty_content_warned: set[int] = set()
# Idempotence locale : un même message Discord (reconnexion gateway, event
# rejoué) ne doit pas partir deux fois vers l'API. Le site déduplique aussi.
_handled_message_ids: set[int] = set()
_slash_client: discord.Client | None = None
_commands_guild: str | None = None
_TICKETISH_PREFIX = ("🤖", "🔴", "🟠", "🟢", "tkt-")
_TICKETISH_RE = re.compile(r"^(🤖|🔴|🟠|🟢|tkt-)|-\w{4}$")


async def api_request(method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "x-support-bot-secret": SECRET}
    timeout = aiohttp.ClientTimeout(total=90)
    url = f"{WEBLOGBOOK_URL}{path}"
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for attempt in range(2):
            kwargs: dict[str, Any] = {"headers": headers, "allow_redirects": False}
            if payload is not None:
                kwargs["json"] = payload
            async with session.request(method, url, **kwargs) as resp:
                if resp.status in (301, 302, 307, 308) and attempt == 0:
                    loc = resp.headers.get("Location") or ""
                    log.warning("Redirect %s %s -> %s — corrigez WEBLOGBOOK_URL (www)", resp.status, url, loc)
                    if loc:
                        url = loc if loc.startswith("http") else urljoin(url, loc)
                        continue
                try:
                    data = await resp.json(content_type=None)
                except Exception:
                    text = await resp.text()
                    log.warning("API %s %s HTTP %s body=%s", method, path, resp.status, (text or "")[:240])
                    data = {}
                if resp.status >= 400:
                    log.warning("API %s %s HTTP %s data=%s", method, path, resp.status, str(data)[:240])
                return resp.status, data if isinstance(data, dict) else {}
    return 0, {}


async def api_post(path: str, payload: dict) -> tuple[int, dict]:
    return await api_request("POST", path, payload)


async def api_get(path: str) -> tuple[int, dict]:
    return await api_request("GET", path)


async def refresh_runtime() -> None:
    status, data = await api_get("/api/support/bot/runtime")
    if status < 400 and data:
        _runtime["guild_id"] = data.get("guild_id")
        _runtime["staff_role_id"] = data.get("staff_role_id")
        _runtime["instructor_role_id"] = data.get("instructor_role_id")
        _runtime["required_role_id"] = data.get("required_role_id")
        cats = data.get("category_ids") or {}
        _runtime["category_ids"] = set(str(v) for v in cats.values() if v)
        _runtime["open_channel_ids"] = set(str(v) for v in (data.get("open_channel_ids") or []) if v)
        _runtime["panel_channel_id"] = data.get("panel_channel_id")
        _runtime["panel_message_id"] = data.get("panel_message_id")
        _runtime["bot_user_id"] = data.get("bot_user_id")
        log.info(
            "Config site: guild=%s %s sections, %s tickets ouverts, staff_role=%s instructor_role=%s panel=%s/%s bot_user=%s",
            _runtime["guild_id"],
            len(_runtime["category_ids"]),
            len(_runtime["open_channel_ids"]),
            _runtime["staff_role_id"],
            _runtime["instructor_role_id"],
            _runtime["panel_channel_id"],
            _runtime["panel_message_id"],
            _runtime["bot_user_id"],
        )
    else:
        log.warning("Runtime API indisponible (%s) url=%s/api/support/bot/runtime", status, WEBLOGBOOK_URL)


def _strip_bot_mention(text: str, bot_user_id: int) -> str:
    """Retire la mention du bot : il reste la demande (« ferme le ticket »)."""
    return re.sub(rf"<@!?{bot_user_id}>", " ", text).strip()


def looks_ticketish(name: str) -> bool:
    n = name or ""
    if n.startswith(_TICKETISH_PREFIX):
        return True
    return bool(_TICKETISH_RE.search(n))


def is_ticket_channel(channel: discord.abc.GuildChannel) -> bool:
    cid = str(getattr(channel, "id", "") or "")
    open_ids = _runtime.get("open_channel_ids") or set()
    if cid and cid in open_ids:
        return True
    if not isinstance(channel, discord.TextChannel):
        return False
    cats = _runtime.get("category_ids") or set()
    if channel.category_id and str(channel.category_id) in cats:
        return True
    return looks_ticketish(channel.name or "")


async def api_is_ticket(channel_id: str) -> bool:
    now = time.monotonic()
    cached = _is_ticket_cache.get(channel_id)
    if cached and now - cached[1] < 60:
        return cached[0]
    status, data = await api_get(f"/api/support/bot/is-ticket?channel_id={channel_id}")
    ok = status < 400 and bool(data.get("is_ticket"))
    _is_ticket_cache[channel_id] = (ok, now)
    if ok:
        ids = _runtime.setdefault("open_channel_ids", set())
        if isinstance(ids, set):
            ids.add(channel_id)
    return ok


async def should_handle_ticket_message(channel: discord.abc.Messageable) -> bool:
    if not isinstance(channel, discord.abc.GuildChannel):
        return False
    if is_ticket_channel(channel):
        return True
    name = getattr(channel, "name", "") or ""
    cats = _runtime.get("category_ids") or set()
    # Config absente, ou nom de salon ticket : demander au site (évite d'ignorer un ticket).
    if cats and not looks_ticketish(name):
        return False
    return await api_is_ticket(str(channel.id))


def has_verified_role(member: discord.Member) -> bool:
    required = str(_runtime.get("required_role_id") or "").strip()
    if not required:
        return True
    return any(str(role.id) == required for role in member.roles)


def is_staff_member(member: discord.Member) -> bool:
    rids = [rid for rid in (_runtime.get("staff_role_id"), _runtime.get("instructor_role_id")) if rid]
    if rids and any(str(r.id) in {str(x) for x in rids} for r in member.roles):
        return True
    return member.guild_permissions.manage_channels


def _command_name(interaction: discord.Interaction) -> str | None:
    if interaction.type is not discord.InteractionType.application_command:
        return None
    data = interaction.data
    if data is None:
        return None
    name = data.get("name") if isinstance(data, dict) else getattr(data, "name", None)
    return str(name) if name else None


GUILD_COMMANDS = [
    {"name": "ticketdel", "description": "Fermer et supprimer ce ticket", "type": 1, "default_member_permissions": None},
    {"name": "ticketia", "description": "Rendre la main à l'IA sur ce ticket", "type": 1, "default_member_permissions": None},
    {
        "name": "register",
        "description": "Créer un compte site lié à ton Discord",
        "type": 1,
        "dm_permission": False,
        "default_member_permissions": None,
    },
]


async def register_guild_commands(_client: discord.Client | None = None) -> None:
    """Commandes de guilde via REST. L'endpoint HTTP Vercel gère les interactions."""
    global _commands_guild
    guild_id = str(_runtime.get("guild_id") or os.getenv("DISCORD_GUILD_ID") or "").strip()
    if not guild_id:
        return
    if _commands_guild == guild_id:
        return
    headers = {"Authorization": f"Bot {TOKEN}", "Content-Type": "application/json"}
    timeout = aiohttp.ClientTimeout(total=20)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get("https://discord.com/api/v10/users/@me", headers=headers) as resp:
                me = await resp.json(content_type=None) if resp.status < 400 else {}
            app_id = str((me or {}).get("id") or "").strip()
            if not app_id:
                log.warning("GET /users/@me sans id — commandes slash non enregistrées")
                return
            url = f"https://discord.com/api/v10/applications/{app_id}/guilds/{guild_id}/commands"
            async with session.put(url, headers=headers, json=GUILD_COMMANDS) as resp:
                body = await resp.text()
                if resp.status >= 400:
                    log.warning("Enregistrement slash HTTP %s %s", resp.status, body[:240])
                    return
            log.info("Slash /ticketdel /ticketia /register enregistrés guild=%s app=%s", guild_id, app_id)
            _commands_guild = guild_id
    except Exception:
        log.exception("Impossible d'enregistrer les commandes slash")


async def handle_ticketdel(interaction: discord.Interaction) -> None:
    if not interaction.response.is_done():
        try:
            await interaction.response.defer(ephemeral=True)
        except discord.HTTPException:
            log.exception("defer /ticketdel a échoué")
            return
    user = interaction.user
    staff = isinstance(user, discord.Member) and is_staff_member(user)
    if not staff:
        try:
            await interaction.followup.send("Staff uniquement.", ephemeral=True)
        except discord.HTTPException:
            pass
        return
    try:
        status, data = await api_post(
            "/api/support/bot/close",
            {
                "channel_id": str(interaction.channel_id),
                "closed_by": f"staff:{interaction.user.id}",
            },
        )
    except Exception:
        log.exception("API /api/support/bot/close a échoué")
        try:
            await interaction.followup.send("Impossible de fermer le ticket (erreur serveur).", ephemeral=True)
        except discord.HTTPException:
            pass
        return
    if status == 404:
        msg = "Cette commande ne fonctionne que dans un salon ticket."
    elif status >= 400:
        msg = data.get("error") or "Impossible de fermer le ticket."
    elif data.get("already"):
        msg = "Ticket déjà fermé."
    else:
        msg = "Ticket fermé."
    try:
        await interaction.followup.send(msg, ephemeral=True)
    except discord.HTTPException:
        pass


async def handle_ticketia(interaction: discord.Interaction) -> None:
    """Filet gateway pour /ticketia — l'endpoint HTTP Vercel gère le cas normal."""
    if not interaction.response.is_done():
        try:
            await interaction.response.defer(ephemeral=True)
        except discord.HTTPException:
            log.exception("defer /ticketia a échoué")
            return
    user = interaction.user
    if not (isinstance(user, discord.Member) and is_staff_member(user)):
        try:
            await interaction.followup.send("Staff uniquement.", ephemeral=True)
        except discord.HTTPException:
            pass
        return
    try:
        status, data = await api_post(
            "/api/support/bot/resume-ia",
            {"channel_id": str(interaction.channel_id), "resumed_by": f"staff:{interaction.user.id}"},
        )
    except Exception:
        log.exception("API /api/support/bot/resume-ia a échoué")
        status, data = 500, {}
    if status == 404:
        msg = "Cette commande ne fonctionne que dans un salon ticket."
    elif status >= 400:
        msg = data.get("error") or "Impossible de rendre la main à l'IA."
    elif data.get("already"):
        msg = "L'IA était déjà active sur ce ticket."
    else:
        msg = "L'IA reprend la main sur ce ticket."
    try:
        await interaction.followup.send(msg, ephemeral=True)
    except discord.HTTPException:
        pass


class RegisterModal(discord.ui.Modal, title="Créer un compte site"):
    identifiant = discord.ui.TextInput(
        label="Identifiant (2-30, lettres / chiffres / _)",
        style=discord.TextStyle.short,
        min_length=2,
        max_length=30,
        required=True,
        custom_id="register_identifiant",
    )
    mot_de_passe = discord.ui.TextInput(
        label="Mot de passe (8 caractères minimum)",
        style=discord.TextStyle.short,
        min_length=8,
        max_length=72,
        required=True,
        custom_id="register_password",
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        if not interaction.response.is_done():
            await interaction.response.defer(ephemeral=True)
        user = interaction.user
        roles = [str(role.id) for role in user.roles] if isinstance(user, discord.Member) else []
        try:
            status, data = await api_post(
                "/api/support/bot/register",
                {
                    "identifiant": str(self.identifiant.value),
                    "mot_de_passe": str(self.mot_de_passe.value),
                    "discord_id": str(user.id),
                    "discord_username": str(user),
                    "member_roles": roles,
                },
            )
        except Exception:
            log.exception("API /api/support/bot/register a échoué")
            await interaction.followup.send("Impossible de créer le compte (erreur serveur).", ephemeral=True)
            return
        if status >= 400:
            await interaction.followup.send(data.get("error") or data.get("message") or "Impossible de créer le compte.", ephemeral=True)
            return
        await interaction.followup.send(data.get("message") or "Compte créé.", ephemeral=True)


async def handle_register(interaction: discord.Interaction) -> None:
    user = interaction.user
    if not isinstance(user, discord.Member) or not has_verified_role(user):
        if not interaction.response.is_done():
            await interaction.response.send_message(
                "Il te faut le rôle Vérifié du serveur pour créer un compte. Demande la vérification Discord, puis relance /register.",
                ephemeral=True,
            )
        return
    if interaction.response.is_done():
        return
    try:
        await interaction.response.send_modal(RegisterModal())
    except discord.HTTPException:
        log.exception("send_modal /register a échoué")


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
    """Vue persistante : les boutons postés en REST (Vercel) fonctionnent sur le gateway si pas d'endpoint HTTP."""

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


@tasks.loop(minutes=1)
async def runtime_loop() -> None:
    await refresh_runtime()
    if _slash_client is not None and _slash_client.is_ready():
        await register_guild_commands(_slash_client)


async def _notify_channel(channel: discord.abc.Messageable, text: str) -> None:
    try:
        await channel.send(text)
    except discord.HTTPException:
        log.exception("Impossible d'envoyer le message de repli dans %s", getattr(channel, "id", "?"))


def attach_handlers(client: discord.Client) -> None:
    @client.event
    async def on_interaction(interaction: discord.Interaction) -> None:
        # Si l'endpoint HTTP Interactions est configuré, Discord n'envoie plus ces events au gateway.
        command = _command_name(interaction)
        if command == "ticketdel":
            await handle_ticketdel(interaction)
            return
        if command == "ticketia":
            await handle_ticketia(interaction)
            return
        if command == "register":
            await handle_register(interaction)
            return
        cid = _component_custom_id(interaction)
        if cid != "support_open_ticket":
            return
        await send_open_ticket_modal(interaction)

    @client.event
    async def on_ready() -> None:
        global _slash_client
        _slash_client = client
        client.add_view(PanelView())
        client.add_view(TicketActions())
        me = str(client.user.id) if client.user else ""
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
        await register_guild_commands(client)
        expected = str(_runtime.get("bot_user_id") or "")
        if expected and me and expected != me:
            log.error(
                "Token mismatch: le bot gateway est %s mais le site (SUPPORT_BOT_TOKEN Vercel) est %s. "
                "Les salons tickets sont créés pour l'autre bot — le chat IA sera silencieux.",
                me,
                expected,
            )
        if not runtime_loop.is_running():
            runtime_loop.start()

    @client.event
    async def on_message(message: discord.Message) -> None:
        if message.author.bot or not message.guild:
            return
        # Idempotence : une reconnexion gateway peut rejouer un event déjà traité.
        if message.id in _handled_message_ids:
            log.info("Message Discord déjà traité localement id=%s", message.id)
            return
        _handled_message_ids.add(message.id)
        if len(_handled_message_ids) > 2000:
            _handled_message_ids.clear()
        if not await should_handle_ticket_message(message.channel):
            return

        content = (message.content or "").strip()
        if not content:
            try:
                fetched = await message.channel.fetch_message(message.id)
                content = (fetched.content or "").strip()
            except discord.HTTPException:
                log.exception("fetch_message vide channel=%s id=%s", message.channel.id, message.id)
        if not content:
            log.warning(
                "Message vide dans ticket channel=%s id=%s — intent Message Content probablement off",
                message.channel.id,
                message.id,
            )
            if message.channel.id not in _empty_content_warned:
                _empty_content_warned.add(message.channel.id)
                await _notify_channel(
                    message.channel,
                    "Je n'ai pas pu lire le texte de ton message (intent **Message Content** du bot). "
                    "Un admin doit l'activer sur le portail Discord, ou un staff peut t'aider ici.",
                )
            return

        author = message.author
        if not isinstance(author, discord.Member):
            try:
                author = await message.guild.fetch_member(message.author.id)
            except discord.HTTPException:
                pass
        # from_staff = rôle staff/instructeur. L’API décide le relais
        # (staff autre que le demandeur du ticket) via discord_user_id.
        from_staff = isinstance(author, discord.Member) and is_staff_member(author)
        author_id = str(message.author.id)
        # Protocole de commande du serveur : [mention du bot] + [demande].
        # La mention réveille l'IA quand un staff a pris le relais, et le reste
        # du message est traité comme l'instruction — on la retire du texte.
        mentions_bot = bool(client.user and client.user in message.mentions)
        if mentions_bot and client.user:
            content = _strip_bot_mention(content, client.user.id)
            if not content:
                content = "reprends la main sur ce ticket"
        log.info(
            "Ticket message channel=%s author=%s staff_role=%s mention_bot=%s len=%s",
            message.channel.id,
            author_id,
            from_staff,
            mentions_bot,
            len(content),
        )
        try:
            await message.channel.typing()
        except discord.HTTPException:
            pass

        _data: dict = {}
        try:
            status, _data = await api_post(
                "/api/support/bot/message",
                {
                    "channel_id": str(message.channel.id),
                    "content": content,
                    "from_staff": from_staff,
                    "discord_user_id": author_id,
                    "message_id": str(message.id),
                    "mentions_bot": mentions_bot,
                },
            )
        except Exception:
            log.exception("API /api/support/bot/message a échoué")
            if not _data.get("handed_over"):
                await _notify_channel(
                    message.channel,
                    "Je n'ai pas pu répondre (erreur serveur). Réessaie dans un instant, ou un staff va t'aider.",
                )
            return
        if status >= 400:
            log.warning("API message %s: %s", status, _data)
            if not _data.get("handed_over"):
                await _notify_channel(
                    message.channel,
                    "Je n'ai pas pu répondre pour le moment. Réessaie, ou un staff va t'aider.",
                )


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
