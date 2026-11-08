import type { Logger, ToolName } from '@scholarly-mcp/core';
import type { z } from 'zod';

/** What a tool handler gets besides its input. */
export interface ToolContext {
  readonly signal: AbortSignal;
  readonly logger: Logger;
}

/** A tool's answer: structured content for the client, readable text for every client. */
export interface ToolReply<Output> {
  readonly structured: Output;
  readonly text: string;
  /** How many articles or journals the answer holds, for the log line. */
  readonly resultCount: number;
  /** The article cards the answer shows, for the funnel's cards per journal (ADR 0033). */
  readonly cards?: readonly { readonly journal: string }[];
}

/**
 * One MCP tool, independent of the SDK: schemas, model-facing description and a handler.
 * The input schema is parsed by the tool layer, so schema failures map to `INVALID_INPUT`
 * like every other error (ADR 0025). Output schemas have no transforms, so they can be
 * published as JSON Schema; the tool layer adds the `notice` field to each.
 */
export interface ToolDefinition<
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodObject = z.ZodObject,
> {
  readonly name: ToolName;
  readonly title: string;
  readonly description: string;
  readonly input: Input;
  readonly output: Output;
  /** The MCP Apps UI resource that shows this tool's result, where the client supports it. */
  readonly ui?: string;
  run(input: z.output<Input>, context: ToolContext): Promise<ToolReply<z.input<Output>>>;
}

/** Keeps a tool's types tied to its schemas while collecting tools of different shapes. */
export function defineTool<Input extends z.ZodType, Output extends z.ZodObject>(
  tool: ToolDefinition<Input, Output>,
): ToolDefinition {
  return tool;
}
