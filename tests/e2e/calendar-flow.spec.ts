import { test, expect, type Page } from "@playwright/test";

const OWNER = { email: "owner@demo.local", password: "password123" };
const WORKER = { email: "worker@demo.local", password: "password123" };

async function login(page: Page, user: typeof OWNER) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/calendar/, { timeout: 15_000 });
}

/**
 * Returns a date guaranteed to fall inside the FullCalendar `timeGridWeek`
 * view that the calendar opens with (Sunday..Saturday). We pick the last
 * remaining weekday in the current week so the slot is always visible,
 * regardless of which day the test runs on.
 */
function dateInCurrentWeek(): string {
  const d = new Date();
  const dayOfWeek = d.getDay();
  const offset = 6 - dayOfWeek;
  if (offset > 0) d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

test.describe("Work Calendar — golden paths", () => {
  test("worker can set availability and see it on the calendar", async ({ page }) => {
    await login(page, WORKER);

    await page.getByRole("button", { name: /set availability/i }).click();
    const dateStr = dateInCurrentWeek();

    await page.locator("#avail-date").fill(dateStr);
    await page.locator("#avail-start").fill("09:00");
    await page.locator("#avail-end").fill("17:00");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(
      page
        .locator(".tg-calendar-shell .tg-event-title")
        .filter({ hasText: /available/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("owner can create a shift and see it on the calendar", async ({ page }) => {
    await login(page, OWNER);

    await page.getByRole("button", { name: /new shift/i }).click();
    const dateStr = dateInCurrentWeek();

    await page.locator("#date").fill(dateStr);
    await page.locator("#startTime").fill("12:00");
    await page.locator("#endTime").fill("18:00");
    // Use a distinctive role so we don't collide with seeded "Bartender" shifts
    // or with the role filter <option> elements rendered on the page.
    await page.locator("#roleLabel").fill("E2E Test Role");
    await page.getByRole("button", { name: /save shift/i }).click();

    await expect(
      page
        .locator(".tg-calendar-shell .tg-event-title")
        .filter({ hasText: /e2e test role/i })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("notifications page renders for authenticated worker", async ({ page }) => {
    await login(page, WORKER);
    await page.getByRole("link", { name: /notifications/i }).click();
    await expect(page).toHaveURL(/\/notifications/);
    await expect(
      page.getByRole("heading", { name: /notifications/i }),
    ).toBeVisible();
  });

  test("worker can navigate to the My applications page", async ({ page }) => {
    await login(page, WORKER);
    await page.goto("/applications");
    await expect(
      page.getByRole("heading", { name: /my applications/i }),
    ).toBeVisible();
  });

  test("owner sees the KPI strip above the calendar", async ({ page }) => {
    await login(page, OWNER);
    // KPI cards are inside a role=group with aria-label "Staffing metrics"
    await expect(
      page.getByRole("group", { name: /staffing metrics/i }),
    ).toBeVisible();
  });

  test("toast appears after creating a shift", async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole("button", { name: /new shift/i }).click();
    const dateStr = dateInCurrentWeek();

    await page.locator("#date").fill(dateStr);
    await page.locator("#startTime").fill("14:00");
    await page.locator("#endTime").fill("20:00");
    await page.locator("#roleLabel").fill("E2E Toast Role");
    await page.getByRole("button", { name: /save shift/i }).click();

    // Sonner renders toasts inside a <section> with role="status"; scope the
    // match there to avoid colliding with localized status copy elsewhere.
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /shift created/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
