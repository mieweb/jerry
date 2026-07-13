/**
 * MCP (Model Context Protocol) tools module.
 *
 * Provides integration with external MCP servers, starting with footnote
 * for hybrid search capabilities.
 */

export { McpClient, createMcpClient, type McpToolInfo, type McpCallResult } from "./client.js";
export { createFootnoteMcpTools, FOOTNOTE_TOOL_NAMES } from "./footnote-adapter.js";
