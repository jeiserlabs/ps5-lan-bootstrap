import asyncio
from playwright.async_api import async_playwright

async def get_fresh_akira_url(file_url):
    print(f"Fetching fresh download URL for: {file_url}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        target_download_url = None
        
        # Intercept network requests
        async def on_request(request):
            nonlocal target_download_url
            u = request.url
            if "download.akirabox.com" in u or ("/download/" in u and "akirabox" in u):
                print(f"CAPTURED DIRECT URL: {u}")
                target_download_url = u

        page.on("request", on_request)
        
        try:
            await page.goto(file_url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(2)
            print("Title:", await page.title())
            
            # Look for download button
            buttons = await page.query_selector_all("button, a")
            print(f"Clickable elements: {len(buttons)}")
            for b in buttons:
                txt = (await b.inner_text()).strip()
                if any(k in txt.lower() for k in ["download", "descargar"]):
                    print(f"Clicking: '{txt}'")
                    try:
                        async with page.expect_download(timeout=8000) as download_info:
                            await b.click()
                        dl = await download_info.value
                        print(f"DIRECT DOWNLOAD URL FROM EVENT: {dl.url}")
                        target_download_url = dl.url
                        break
                    except Exception as e:
                        print("Click handled, checking captured url. Err:", e)
                        await asyncio.sleep(3)
                        if target_download_url:
                            break
        except Exception as e:
            print("Error during navigation:", e)
        finally:
            await browser.close()
            
        return target_download_url

if __name__ == "__main__":
    url = asyncio.run(get_fresh_akira_url("https://akirabox.to/1RgzRaeb3bpB/file"))
    print("FINAL RESULT:", url)
