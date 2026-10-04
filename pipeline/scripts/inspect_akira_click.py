import asyncio
from playwright.async_api import async_playwright

async def inspect_confirm():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://akirabox.to/1RgzRaeb3bpB/file", wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(2)
        
        btn = await page.query_selector(".download-button")
        if btn:
            html = await btn.evaluate("el => el.outerHTML")
            print("Download button HTML:", html)
            print("Clicking download-button...")
            await btn.click()
            await asyncio.sleep(3)
            # check what appeared
            new_btn = await page.query_selector(".download-button, [data-testid], form, iframe")
            print("After click:", await page.evaluate("""() => {
                const els = Array.from(document.querySelectorAll('button, a, form'));
                return els.map(e => ({ tag: e.tagName, text: e.innerText.slice(0, 40), href: e.href, id: e.id, class: e.className }));
            }"""))
                
        await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect_confirm())
