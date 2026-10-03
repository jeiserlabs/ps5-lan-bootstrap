import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        print("Navigating to AkiraBox...")
        await page.goto("https://akirabox.com/2WVGr2dEGkx7/file", wait_until="domcontentloaded")
        print("DOM loaded.")
        
        # Listen to download event
        download_future = asyncio.get_event_loop().create_future()
        page.on("download", lambda d: download_future.set_result(d))
        
        # Wait up to 15s to see if Turnstile solves itself or download button becomes active
        for sec in range(15):
            await asyncio.sleep(1)
            btn = page.locator("#download")
            if await btn.count() > 0:
                txt = (await btn.text_content()).strip()
                disabled = await btn.get_attribute("aria-disabled")
                cls = await btn.get_attribute("class")
                print(f"[{sec}s] btn text: '{txt}', aria-disabled: '{disabled}'")
                if disabled != "true" and "pointer-events-none" not in (cls or ""):
                    print("Button is ACTIVE! Clicking...")
                    await btn.click()
                    break
                    
        # Check if download started
        try:
            download = await asyncio.wait_for(download_future, timeout=5)
            path = "C:/Users/dev/Desktop/GOW_DLC_REAL.rar"
            await download.save_as(path)
            print("DOWNLOADED SUCCESSFULLY TO", path, "Size:", os.path.getsize(path))
        except Exception as e:
            print("Download not triggered:", e)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
