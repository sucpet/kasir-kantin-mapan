import { test, expect } from '@playwright/test'

const URL = 'https://kasir-kantin-mapan-drab.vercel.app'
const EMAIL = 'admin@admin.com'
const PASSWORD = 'admin123'

test('login berhasil dan masuk ke app', async ({ page }) => {
  await page.goto(URL + '/login')
  await expect(page).toHaveTitle(/Kasir Kantin/)

  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.screenshot({ path: 'scripts/ss-before-login.png' })

  await page.click('button[type="submit"]')
  await page.waitForURL(URL + '/', { timeout: 10000 })
  await page.screenshot({ path: 'scripts/ss-after-login.png' })

  await expect(page.locator('text=Kasir Kantin Mapan')).toBeVisible()
  console.log('✅ Login UI berhasil!')
})
