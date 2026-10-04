import asyncio
from playwright.async_api import async_playwright

async def inspect_buttons():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://akirabox.to/1RgzRaeb3bpB/file", wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(2)
        
        elements = await page.query_selector_all("button, a")
        for i, el in enumerate(elements):
            txt = (await el.inner_text()).strip()
            href = await el.get_attribute("href")
            tag = await el.evaluate("el => el.tagName")
            cl = await el.get_attribute("class")
            if txt and "hyper" not in txt.lower():
                print(f"[{i}] <{tag}> text='{txt[:50]}' href='{href}' class='{cl[:40] if cl else ''}'")
                
        await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect_buttons())
