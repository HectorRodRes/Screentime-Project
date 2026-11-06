/* Bridge between a visualization page (inside an iframe) and the main story page.
   Every viz file in this folder should include:  <script src="bridge.js"></script>
   - Tells the story page how tall the viz is, so the frame can fit it.
   - Lets the story page drive the viz while the reader scrolls (clicks its buttons). */
(function () {
  function sendHeight() {
    parent.postMessage({ type: "viz-height", height: document.documentElement.scrollHeight }, "*");
  }
  addEventListener("load", sendHeight);
  addEventListener("resize", sendHeight);
  if (window.ResizeObserver) new ResizeObserver(sendHeight).observe(document.body);

  // "?embed=scrolly" hides the viz's own title, since the story page already has text around it.
  if (new URLSearchParams(location.search).get("embed") === "scrolly") {
    document.documentElement.classList.add("embed-scrolly");
    const st = document.createElement("style");
    st.textContent = ".embed-scrolly header, .embed-scrolly .key .hint { display: none !important; }";
    document.head.appendChild(st);
  }

  // "&glide=1": the story page moves this viz as you scroll, so the reader can't scroll it directly.
  // The wheel/touch then scrolls the story page instead of getting caught inside the frame.
  if (new URLSearchParams(location.search).get("glide") === "1") {
    const st = document.createElement("style");
    st.textContent = "html, body { overflow: hidden !important; overscroll-behavior: none; }";
    document.head.appendChild(st);
  }

  function click(sel) {
    const el = document.querySelector(sel);
    if (el) el.click();
  }

  // Smooth glide: the story page sends a list of elements and a position like 2.4
  // (40% of the way from element 2 to element 3); scroll there instantly, every frame.
  function topOf(sel) {
    const el = document.querySelector(sel);
    return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 8) : 0;
  }
  addEventListener("message", function (e) {
    const m = e.data;
    if (!m || m.type !== "viz-glide" || !m.targets || !m.targets.length) return;
    const i = Math.min(Math.floor(m.pos), m.targets.length - 1), f = m.pos - i;
    const a = topOf(m.targets[i]), b = i + 1 < m.targets.length ? topOf(m.targets[i + 1]) : a;
    window.scrollTo({ top: a + (b - a) * f, behavior: "instant" });
  });

  addEventListener("message", function (e) {
    const m = e.data;
    if (!m || m.type !== "viz-state") return;
    // Filter buttons, e.g. { year: "2014", day: "wd", scr: "total" }
    ["scr", "year", "day"].forEach(function (f) {
      if (m[f] == null) return;
      const b = document.querySelector('.seg[data-f="' + f + '"] button[data-v="' + m[f] + '"]');
      if (b && b.getAttribute("aria-pressed") !== "true") b.click();
    });
    // Highlight toggle
    if (m.hl != null) {
      const hl = document.getElementById("hl");
      if (hl && (hl.getAttribute("aria-pressed") === "true") !== m.hl) hl.click();
    }
    // Room of 100: survey year per room, e.g. roomYears: ["2014","2014","2014","2006","2014"]
    if (Array.isArray(m.roomYears)) m.roomYears.forEach(function (y, i) {
      const b = document.querySelector('.seg[data-i="' + i + '"] button[data-v="' + y + '"]');
      if (b && b.getAttribute("aria-pressed") !== "true") b.click();
    });
    // Pick a room (screen-time level) by index
    if (m.lv != null) click('.bar[data-i="' + m.lv + '"]');
    // Scroll inside the viz to an element
    if (m.scrollTo) {
      const t = document.querySelector(m.scrollTo);
      // window.scrollTo (not scrollIntoView) so only this frame scrolls, never the story page.
      if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 8, behavior: "smooth" });
    }
  });
})();
