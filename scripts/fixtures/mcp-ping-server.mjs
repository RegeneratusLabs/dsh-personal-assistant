#!/usr/bin/env node
/**
 * Minimal MCP stdio server used as a connector fixture.
 *
 * It exists to prove the rc.2 MCP manager + Capabilities page end to end
 * without a third-party supply chain: one tool (`ping`) that returns `pong`.
 * No dependencies, no filesystem access, no network.
 *
 * Wired through the profile's `mcp-manager` row:
 *   command: /home/josh/dsh/node/bin/node
 *   args: [<this file>]
 *
 * The SDK speaks newline-delimited JSON-RPC over stdio.
 */
import readline from 'node:readline';

const PROTOCOL = '2025-06-18';
const TOOLS = [
  {
    name: 'ping',
    description: 'Return pong. A dependency-free liveness tool for the connector fixture.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return; // malformed input is not a request
  }
  const { id, method, params } = message ?? {};
  if (id === undefined || id === null) return; // notification
  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'dsh-ping-fixture', version: '0.1.0' },
        instructions: 'Dependency-free connector fixture. Call ping and expect pong.',
      });
      break;
    case 'ping':
      reply(id, {});
      break;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      break;
    case 'tools/call':
      if (params?.name !== 'ping') {
        reply(id, {
          content: [{ type: 'text', text: `unknown tool: ${String(params?.name)}` }],
          isError: true,
        });
      } else {
        reply(id, { content: [{ type: 'text', text: 'pong' }], isError: false });
      }
      break;
    default:
      error(id, -32601, `method not found: ${String(method)}`);
  }
});
