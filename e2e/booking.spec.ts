import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The booking funnel, and the race.
 *
 * Six checks, chosen because each one fails in a way a person would feel:
 * a buyer who cannot get in, a slot offered and then refused, two strangers
 * sent to the same doorstep. Everything else is covered a layer down, where
 * it is faster and the failure message is better.
 *
 * Fixtures come from `npm run seed` and are deterministic. A random fixture
 * makes a CI failure irreproducible on a machine nobody logs into.
 */

const SATURDAY_MORNING = "6.480-840"; // Saturday 08:00-14:00, buyer's clock

test.describe("the buyer's funnel", () => {
  test("the landing page shows the match before it claims anything", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "laid on the same rule",
    );
    // The legend is how the overlap reads without colour. If it is gone, the
    // drawing has become decoration.
    await expect(page.getByText("Both — bookable")).toBeVisible();
    await expect(page.getByRole("button", { name: /Keep a book/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Find a slot/ })).toBeVisible();
  });

  test("an empty week asks for one instead of listing everything", async ({ page }) => {
    // The whole premise: availability is the filter. No availability, no list.
    await page.goto("/search");

    await expect(page.getByText("Tell the book when you are free.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  });

  test("a week with availability returns only reachable listings", async ({ page }) => {
    await page.goto(`/search?a=${SATURDAY_MORNING}`);

    const results = page.getByRole("article");
    await expect(results.first()).toBeVisible();

    // Every listing returned must carry at least one slot; a result with none
    // would mean the filter leaked.
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(results.nth(i).getByRole("button", { name: /^Book / })).not.toHaveCount(
        0,
      );
    }
  });

  test("a slot names its date, time and timezone in text", async ({ page }) => {
    // Not by position, and not by colour. Someone reading this aloud has to be
    // able to say which doorstep, and when.
    await page.goto(`/search?a=${SATURDAY_MORNING}`);

    const slot = page.getByRole("button", { name: /^Book / }).first();
    const label = await slot.getAttribute("aria-label");
    expect(label).toMatch(/^Book \w{3}, \w{3} \d+ at \d{1,2}:\d{2}\s?(AM|PM) [A-Z]{2,5}/);
  });

  test("a signed-out visitor can browse but not book", async ({ page }) => {
    await page.goto(`/search?a=${SATURDAY_MORNING}`);

    await expect(page.getByRole("button", { name: /^Book / }).first()).toBeDisabled();
    await expect(page.getByText(/Sign in as the demo buyer/).first()).toBeVisible();
  });

  test("the demo door signs in and lands on the buyer's side", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Find a slot/ }).click();

    await page.waitForURL("**/search");
    // `.` rather than an apostrophe: the page renders a typographic ’, and an
    // ASCII ' silently matches nothing.
    await expect(page.getByText(/Buyer.s side/i)).toBeVisible();
  });
});

/**
 * The race.
 *
 * Two buyers, one slot, both requests already in flight. This is the assertion
 * the EXCLUDE constraint exists for: one insert wins, the other gets a 409,
 * and nobody is quietly given a showing that someone else also has. An
 * application-level "is it free?" check would pass for both.
 */
test("two buyers cannot take the same slot", async ({ playwright, baseURL }) => {
  const first = await playwright.request.newContext({ baseURL });
  const second = await playwright.request.newContext({ baseURL });

  await signInAsBuyer(first);
  await signInAsBuyer(second);

  const target = await firstOpenSlot(first);

  // Fired together, not one after the other: the interesting window is the one
  // where both are inside the database at the same moment.
  const [a, b] = await Promise.all([
    first.post("/api/showings", { data: target }),
    second.post("/api/showings", { data: target }),
  ]);

  const statuses = [a.status(), b.status()].sort();
  expect(statuses).toEqual([201, 409]);

  const loser = a.status() === 409 ? a : b;
  expect((await loser.json()).error).toMatch(/just booked|not available/i);

  await first.dispose();
  await second.dispose();
});

async function signInAsBuyer(request: APIRequestContext) {
  const response = await request.post("/api/auth/demo", { data: { role: "buyer" } });
  expect(response.ok()).toBeTruthy();
}

/** Read a real bookable slot out of the app rather than inventing a time. */
async function firstOpenSlot(request: APIRequestContext) {
  const page = await request.get(`/search?a=${SATURDAY_MORNING}`);
  const html = await page.text();

  const listingId = /data-listing="([0-9a-f-]{36})"/.exec(html)?.[1];
  const startsAt = /data-starts-at="([^"]+)"/.exec(html)?.[1];

  expect(listingId, "no listing id rendered on the search page").toBeTruthy();
  expect(startsAt, "no slot rendered on the search page").toBeTruthy();

  return { listingId, startsAt };
}
