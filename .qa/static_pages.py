import sys, time, json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = "/Users/pablocarvalho/Desktop/pablo/rap/.qa/shots"

errors = {}

def capture(page, name, scrolls=None):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1200)
    page.screenshot(path=f"{OUT}/{name}.png")
    if scrolls:
        for i, y in enumerate(scrolls):
            page.evaluate(f"window.scrollTo(0,{y})")
            page.wait_for_timeout(900)
            page.screenshot(path=f"{OUT}/{name}_s{i}.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_page(viewport={"width":1440,"height":900})
    logs = []
    ctx.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ("error","warning") else None)
    ctx.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))

    pages = {
        "home": (BASE+"/", [600,1300,2100,2900,3700,4500]),
        "arena": (BASE+"/arena", None),
        "ranking": (BASE+"/ranking", [600,1300]),
        "batallas": (BASE+"/batallas", [600,1300]),
        "backoffice": (BASE+"/backoffice", None),
    }
    for name,(url,scrolls) in pages.items():
        logs.clear()
        try:
            ctx.goto(url, wait_until="domcontentloaded", timeout=30000)
            capture(ctx, name, scrolls)
            errors[name] = list(logs)
            print(f"OK {name} ({len(logs)} console issues)")
        except Exception as e:
            errors[name] = [f"NAV FAIL: {e}"] + list(logs)
            print(f"FAIL {name}: {e}")

    browser.close()

with open(f"{OUT}/../static_console.json","w") as f:
    json.dump(errors, f, indent=1)
print("DONE")
