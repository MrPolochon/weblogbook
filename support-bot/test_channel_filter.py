"""Simulation hors ligne du filtre réel, sans connexion Discord ni secrets."""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
import unittest

source = ast.parse(Path(__file__).with_name('main.py').read_text(encoding='utf-8'))
functions = [node for node in source.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name in {'is_ticket_channel', 'should_handle_ticket_message'}]


class Channel:
    def __init__(self, channel_id, guild='1', name='general', category='9'):
        self.id = channel_id
        self.guild = SimpleNamespace(id=guild)
        self.name = name
        self.category_id = category


class FilterTests(unittest.IsolatedAsyncioTestCase):
    async def test_simulation(self):
        calls = []
        async def lookup(channel_id):
            calls.append(channel_id)
            return channel_id == '100'
        namespace = {'discord': SimpleNamespace(abc=SimpleNamespace(GuildChannel=Channel, Messageable=Channel)),
                     '_runtime': {'guild_id': '1', 'open_channel_ids': {'100', '200'}, 'category_ids': {'9'}},
                     'api_is_ticket': lookup}
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'main.py', 'exec'), namespace)
        check = namespace['should_handle_ticket_message']
        cases = [(Channel('100'), True), (Channel('200'), False),
                 (Channel('300', name='🤖ticket-abcd'), False),
                 (Channel('301', name='general'), False),
                 (Channel('100', guild='2'), False), (object(), False)]
        for channel, expected in cases:
            with self.subTest(channel=getattr(channel, 'id', 'DM')):
                self.assertEqual(await check(channel), expected)
        self.assertEqual(calls, ['100', '200', '300', '301'])


if __name__ == '__main__':
    unittest.main()
