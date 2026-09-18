#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server.js";

// stdout carries the MCP protocol; never print to it here.
await createServer().connect(new StdioServerTransport());
