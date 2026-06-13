import sys, time, json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = "/Users/pablocarvalho/Desktop/pablo/rap/.qa/shots"

MOD = sys.argv[1] if len(sys.argv) > 1 else "minuto-libre"
MODE = sys.argv[2] if len(sys.argv) > 2 else "arena"  # "arena" or "full"
VP = sys.argv[3] if len(sys.argv) > 3 else "1440x900"
VW, VH = (int(x) for x in VP.split("x"))
SUFFIX = "" if VP == "1440x900" else "_m"
NAMES = {
    "4x4": "4x4", "minuto-libre": "Minuto libre", "palabras": "Palabras que rimen",
    "hard": "Hard", "easy": "Easy", "deconceptos": "De conceptos",
}
NAME = NAMES[MOD]

PHASE_JS = """() => {
  const q = s => document.querySelector(s);
  if (q('.battle-phase.translucent') || q('.judge-zone')) return 'result';
  if (q('.judging-overlay')) return 'judging';
  if (q('.battle-countdown')) return 'countdown';
  if (q('.splash-names')) return 'ready_check';
  if (q('.battle-arena')) {
    const tb = q('.turn-who');
    return 'turn::' + (tb ? tb.innerText.replace(/\\n/g,' ').slice(0,40) : '');
  }
  if (document.body.innerText.includes('BATALLA TERMINADA')) return 'aborted';
  if (q('.battle-searching-title') || q('.battle-radar')) return 'searching';
  if (q('.config-h1')) return 'setup';
  return 'unknown';
}"""

logs = []
seen = {}

def shot(page, label):
    fn = f"{OUT}/{MOD}__{label}{SUFFIX}.png"
    page.screenshot(path=fn)
    print(f"  shot {label}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=[
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
    ])
    ctx = browser.new_context(viewport={"width":VW,"height":VH},
                              permissions=["camera","microphone"])
    # getUserMedia hangs under headless fake-device; inject a synthetic
    # camera (animated canvas) + mic (oscillator) so the real ready/preview
    # path runs deterministically.
    ctx.add_init_script("""
      (() => {
        function fakeStream(c){
          const cv = document.createElement('canvas');
          cv.width=640; cv.height=480;
          const g = cv.getContext('2d'); let t=0;
          (function draw(){ t+=0.04;
            g.fillStyle='#120006'; g.fillRect(0,0,640,480);
            g.fillStyle='hsl('+((t*40)%360)+',70%,45%)';
            g.beginPath(); g.arc(320+Math.sin(t)*120,240+Math.cos(t*1.3)*80,70,0,7); g.fill();
            g.fillStyle='#f2ecdd'; g.font='bold 40px sans-serif'; g.fillText('MC CAM', 220, 60);
            requestAnimationFrame(draw); })();
          const vstream = cv.captureStream(30);
          const tracks=[];
          if(!c || c.video!==false) tracks.push(...vstream.getVideoTracks());
          if(!c || c.audio!==false){
            const ac=new (window.AudioContext||window.webkitAudioContext)();
            const osc=ac.createOscillator(); const dst=ac.createMediaStreamDestination();
            const gn=ac.createGain(); gn.gain.value=0.02; osc.connect(gn); gn.connect(dst); osc.start();
            tracks.push(...dst.stream.getAudioTracks());
          }
          return new MediaStream(tracks);
        }
        navigator.mediaDevices.getUserMedia = async (c)=> fakeStream(c);
        navigator.mediaDevices.enumerateDevices = async ()=> [
          {deviceId:'fake-cam',kind:'videoinput',label:'Fake Cam',groupId:'g'},
          {deviceId:'fake-mic',kind:'audioinput',label:'Fake Mic',groupId:'g'},
        ];
      })();
    """)
    page = ctx.new_page()
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ("error","warning") else None)
    page.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))

    page.goto(BASE+"/arena", wait_until="domcontentloaded")
    page.wait_for_selector(".aka-input", timeout=15000)
    page.fill(".aka-input", "QA-TESTER")
    page.locator(f'.mode-card:has(.mode-card-name:text-is("{NAME}"))').click()
    page.wait_for_timeout(300)
    # activar mic+camara
    page.locator("button:has-text('ACTIVAR MIC')").click()
    try:
        page.wait_for_selector("button:has-text('APAGAR SEÑAL')", timeout=10000)
    except Exception as e:
        print("  media not ready:", e)
    page.wait_for_timeout(500)
    # bot dev
    page.locator("button:has-text('Bot dev')").click()
    page.wait_for_timeout(200)
    shot(page, "setup_ready")
    # buscar rival
    page.locator("button:has-text('BUSCAR RIVAL')").click()

    start = time.time()
    ready_clicked = False
    turn_count = 0
    last_phase = None
    while time.time() - start < 150:
        try:
            phase = page.evaluate(PHASE_JS)
        except Exception:
            phase = "eval_err"
        base = phase.split("::")[0]
        if base != last_phase:
            print(f"  phase -> {phase}")
            last_phase = base
        # capture first sighting of each phase
        if base == "searching" and "searching" not in seen:
            seen["searching"]=1; shot(page,"searching")
        elif base == "ready_check":
            if "ready_check" not in seen:
                seen["ready_check"]=1; page.wait_for_timeout(1600); shot(page,"ready_check")
            if not ready_clicked:
                try:
                    page.locator("button:has-text('ESTOY LISTO')").click(timeout=800)
                    ready_clicked = True; print("  clicked ESTOY LISTO")
                except Exception as e:
                    pass
        elif base == "countdown" and "countdown" not in seen:
            seen["countdown"]=1; page.wait_for_timeout(150); shot(page,"countdown")
        elif base == "turn":
            who = phase.split("::")[1] if "::" in phase else ""
            mine = "TÚ" in who or "QA-TESTER" in who
            key = f"turn_{'mine' if mine else 'rival'}"
            if key not in seen:
                seen[key]=1; page.wait_for_timeout(400); shot(page, key)
            # accelerate my turns in full mode
            if MODE=="full" and mine:
                try:
                    btn = page.locator(".fighter-controls.mine button:has-text('TERMINAR TURNO'), .fighter-controls.mine button:has-text('ENVIAR VERSO')")
                    if btn.count()>0: btn.first.click(timeout=500)
                except Exception: pass
            turn_count += 1
            if MODE=="arena" and "turn_mine" in seen and "turn_rival" in seen:
                break
            if MODE=="arena" and turn_count > 8:
                break
        elif base == "judging" and "judging" not in seen:
            seen["judging"]=1; shot(page,"judging")
        elif base == "result":
            if "result_suspense" not in seen:
                seen["result_suspense"]=1; shot(page,"result_suspense")
                page.wait_for_timeout(1600)
            if "result_votes" not in seen:
                seen["result_votes"]=1; shot(page,"result_votes")
                page.wait_for_timeout(2600)
            if "result_final" not in seen:
                seen["result_final"]=1
                page.wait_for_timeout(800); shot(page,"result_final")
                # full-page result for scoring detail
                page.screenshot(path=f"{OUT}/{MOD}__result_full.png", full_page=True)
            break
        elif base == "aborted":
            shot(page,"aborted"); break
        page.wait_for_timeout(300)

    with open(f"{OUT}/../console_{MOD}.json","w") as f:
        json.dump(logs, f, indent=1)
    print(f"DONE {MOD} phases={list(seen.keys())} console_issues={len(logs)}")
    browser.close()
