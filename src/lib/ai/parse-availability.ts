import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DAY_LABELS, recurringRuleSchema, type RecurringRule } from "@/lib/scheduling";

/**
 * Natural language -> availability rules.
 *
 * This is the only place a model touches the product, and the boundary is
 * drawn on purpose. The model does one thing: turn "weekday evenings after 6
 * and Saturday mornings" into structured rules. It never decides what is
 * bookable, never sees another user's data, and never writes anything.
 *
 * Everything it returns is treated as untrusted input:
 *
 *   - The output must satisfy a zod schema before it is used. A hallucinated
 *     `dayOfWeek: 9` or an inverted range is dropped, not repaired.
 *   - The result pre-fills the manual grid rather than replacing it. The buyer
 *     confirms what they see, so a wrong parse costs a correction, not a
 *     missed showing.
 *   - Input is length-capped, so a pasted novel cannot turn into a large bill.
 *
 * Without `ANTHROPIC_API_KEY` the app still works: the route reports the
 * feature is off and the UI falls back to the grid, which was always there.
 */

const MODEL = "claude-sonnet-5";
export const MAX_INPUT_CHARS = 400;

/** Shape the model is asked to produce. Deliberately flat and hard to get wrong. */
const parsedRulesSchema = z.object({
  rules: z.array(recurringRuleSchema).max(30),
  /** One short line shown back to the buyer, so a bad parse is visible. */
  interpretation: z.string().max(200),
});

export type ParsedAvailability = z.infer<typeof parsedRulesSchema>;

export type ParseResult =
  | { ok: true; value: ParsedAvailability }
  | {
      ok: false;
      reason: "disabled" | "too_long" | "empty" | "unparseable" | "upstream";
      /** Only on "upstream": what the API actually said, for the server log. */
      detail?: string;
    };

const TOOL_NAME = "record_availability";

const systemPrompt = `You convert a home buyer's description of when they are free into structured weekly availability rules.

Rules:
- dayOfWeek is 0 for Sunday through 6 for Saturday.
- startMinute and endMinute are minutes from local midnight. 09:00 is 540, 18:30 is 1110, midnight at the end of a day is 1440.
- endMinute must be greater than startMinute. Never wrap past midnight; split "Friday 10pm to 1am" into Friday 1320-1440 and Saturday 0-60.
- Emit one rule per day. "Weekdays" is five rules, Monday through Friday.
- Interpret vague terms conservatively and state your reading in the interpretation field: morning is 08:00-12:00, afternoon 12:00-17:00, evening 17:00-21:00, "after 6" runs to 21:00.
- If the text says nothing about availability, return an empty rules array and say so in the interpretation.`;

export async function parseAvailability(
  text: string,
  options: { apiKey?: string; workspaceId?: string } = {},
): Promise<ParseResult> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const workspaceId = options.workspaceId ?? process.env.ANTHROPIC_WORKSPACE_ID;
  if (!apiKey) return { ok: false, reason: "disabled" };

  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_INPUT_CHARS) return { ok: false, reason: "too_long" };

  const client = new Anthropic({
    apiKey,
    // An identity-linked key (one that works across all workspaces) is rejected
    // without this header: "anthropic-workspace-id is required when
    // authenticating with an identity-linked API key". A workspace-scoped key
    // carries its own workspace and needs nothing, so the header is only sent
    // when it is configured — which lets either kind of key work.
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    // Forcing the tool call is what makes this structured output rather than
    // prose that has to be scraped. The model cannot reply with a paragraph.
    tool_choice: { type: "tool", name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the buyer's weekly availability as structured rules.",
        input_schema: {
          type: "object",
          properties: {
            rules: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
                  startMinute: { type: "integer", minimum: 0, maximum: 1440 },
                  endMinute: { type: "integer", minimum: 0, maximum: 1440 },
                },
                required: ["dayOfWeek", "startMinute", "endMinute"],
              },
            },
            interpretation: {
              type: "string",
              description:
                "One short sentence describing how the text was read, shown back to the buyer.",
            },
          },
          required: ["rules", "interpretation"],
        },
      },
    ],
      messages: [{ role: "user", content: trimmed }],
    });
  } catch (error) {
    // Auth, quota, rate limit, outage — all reach here. None of them are the
    // buyer's fault and none are recoverable by retrying the same request, so
    // the caller gets one honest signal and the reason goes to the log rather
    // than to the screen. Before this existed the route threw, the client's
    // `response.json()` blew up on an HTML error page, and the UI said "could
    // not reach the parser" — which was false: it was reached, and it answered.
    return {
      ok: false,
      reason: "upstream",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) return { ok: false, reason: "unparseable" };

  // The gate. Anything that does not fit the schema does not reach the engine.
  const parsed = parsedRulesSchema.safeParse(toolUse.input);
  if (!parsed.success) return { ok: false, reason: "unparseable" };

  return { ok: true, value: { ...parsed.data, rules: mergeRules(parsed.data.rules) } };
}

/**
 * Merge overlapping rules on the same day.
 *
 * The engine merges intervals anyway, but a buyer is about to *look* at these
 * in a grid. "Monday 09:00-12:00" plus "Monday 11:00-15:00" should read back
 * as one block, or they will reasonably think something was misunderstood.
 */
export function mergeRules(rules: RecurringRule[]): RecurringRule[] {
  const byDay = new Map<number, RecurringRule[]>();
  for (const rule of rules) {
    byDay.set(rule.dayOfWeek, [...(byDay.get(rule.dayOfWeek) ?? []), rule]);
  }

  const merged: RecurringRule[] = [];
  for (const [dayOfWeek, dayRules] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...dayRules].sort((a, b) => a.startMinute - b.startMinute);
    for (const rule of sorted) {
      const previous = merged[merged.length - 1];
      if (
        previous &&
        previous.dayOfWeek === dayOfWeek &&
        rule.startMinute <= previous.endMinute
      ) {
        previous.endMinute = Math.max(previous.endMinute, rule.endMinute);
      } else {
        merged.push({ ...rule });
      }
    }
  }
  return merged;
}

/** Render rules as a sentence, for reading a parse back to the buyer. */
export function describeRules(rules: RecurringRule[]): string {
  if (rules.length === 0) return "No availability set.";
  return mergeRules(rules)
    .map(
      (r) =>
        `${DAY_LABELS[r.dayOfWeek]} ${formatMinute(r.startMinute)}-${formatMinute(r.endMinute)}`,
    )
    .join(", ");
}

export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
