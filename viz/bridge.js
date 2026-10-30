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

  function click(sel) {
    const el = document.querySelector(sel);
    if (el) el.click();
  }

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
