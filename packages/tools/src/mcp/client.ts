/**
 * MCP Client wrapper for stdio transport.
 *
 * Provides a clean interface to connect to MCP servers via stdio,
 * list available tools, and call them. Handles graceful shutdown
 * and reconnection on error.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "@mieweb/jerry-agent-runtime";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

/**
 * MCP Client that wraps the SDK for stdio-based servers.
 */
export class McpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;
  private readonly config: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /**
   * Connect to the MCP server.
   * Spawns the server process and establishes stdio transport.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
      });

      this.client = new Client(
        { name: "jerry", version: "1.0.0" },
        { capabilities: {} }
      );

      await this.client.connect(this.transport);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      this.client = null;
      this.transport = null;
      throw new Error(
        `Failed to connect to MCP server "${this.config.name}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Disconnect from the MCP server.
   * Closes the transport and terminates the server process.
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.client.close();
    } catch {
      // Ignore close errors
    } finally {
      this.connected = false;
      this.client = null;
      this.transport = null;
    }
  }

  /**
   * List all tools available from the MCP server.
   */
  async listTools(): Promise<McpToolInfo[]> {
    if (!this.connected || !this.client) {
      throw new Error(`MCP client "${this.config.name}" is not connected`);
    }

    const result = await this.client.listTools();
    return (result.tools || []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    if (!this.connected || !this.client) {
      throw new Error(`MCP client "${this.config.name}" is not connected`);
    }

    const result = await this.client.callTool({ name: toolName, arguments: args });
    return {
      content: result.content as McpCallResult["content"],
      isError: result.isError,
    };
  }

  /**
   * Check if the client is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the server name.
   */
  getName(): string {
    return this.config.name;
  }
}

/**
 * Create and connect an MCP client for the given config.
 * Returns null if connection fails (graceful fallback).
 */
export async function createMcpClient(
  config: McpServerConfig
): Promise<McpClient | null> {
  const client = new McpClient(config);
  try {
    await client.connect();
    return client;
  } catch (error) {
    console.error(
      `MCP client "${config.name}" failed to connect:`,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
