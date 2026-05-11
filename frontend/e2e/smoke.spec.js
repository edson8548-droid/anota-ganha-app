const { test, expect } = require('@playwright/test');

test('site renderiza a primeira tela sem ficar em branco', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();

  const bodyText = (await page.locator('body').innerText()).trim();
  expect(bodyText.length).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
