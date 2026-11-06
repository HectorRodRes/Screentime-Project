/* Scrollytelling for the Screened Out story.
   - Steps: when a .step reaches the middle of the screen, its section's graphic updates.
   - Fun facts / takeaways (.reveal) fade in as they scroll into view.
   - Progress bar and chapter nav follow the reader. */

/* ---------- Title page: count the headline number up from 0 ---------- */
(function () {
  const el = document.getElementById("fNumber");
  if (!el) return;
  const target = +el.dataset.target, fmt = new Intl.NumberFormat("en-US");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; // already shows the final figure
  const dur = 1400, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt.format(Math.round(target * e));
    if (k < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
  // Animation frames pause in background tabs; the final figure still has to land.
  setTimeout(() => { el.textContent = fmt.format(target); }, dur + 200);
})();

/* ---------- Day graphic (chapter 1) ---------- */
const dayGrid = document.getElementById("dayGrid");
const dayTitle = document.getElementById("dayTitle");
const dayLegend = document.getElementById("dayLegend");
for (let h = 0; h < 24; h++) {
  const cell = document.createElement("div");
  cell.textContent = h + 1;
  dayGrid.appendChild(cell);
}

function updateDay(step) {
  const fill = JSON.parse(step.dataset.fill || "[]");
  dayTitle.innerHTML = step.dataset.title || "";
  // Lay the activities end to end along the 24 hours; a square can be partly filled.
  const segs = [];
  let start = 0;
  fill.forEach(p => { segs.push({ from: start, to: start + p.hours, color: p.color }); start += p.hours; });

  [...dayGrid.children].forEach((cell, h) => {
    const stops = [];
    segs.forEach(s => {
      const a = Math.max(s.from, h), b = Math.min(s.to, h + 1);
      if (b > a) stops.push(`${s.color} ${(a - h) * 100}% ${(b - h) * 100}%`);
    });
    const covered = segs.reduce((t, s) => t + Math.max(0, Math.min(s.to, h + 1) - Math.max(s.from, h)), 0);
    if (stops.length && covered < 1) stops.push(`var(--c-empty) ${covered * 100}% 100%`);
    cell.style.background = stops.length ? `linear-gradient(to right, ${stops.join(", ")})` : "";
    cell.classList.toggle("filled", covered > 0.5);
  });

  dayLegend.innerHTML = fill
    .map(p => `<span><i style="background:${p.color}"></i>${p.label}: ${fmtHours(p.hours)}</span>`)
    .join("");
}

function fmtHours(h) {
  const total = Math.round(h * 60), hh = Math.floor(total / 60), mm = total % 60;
  return (hh ? hh + " h" : "") + (hh && mm ? " " : "") + (mm ? mm + " min" : "");
}

/* ---------- Embedded charts (chapter 3 and later) ---------- */
// Remember the latest state for each frame, so it can be re-sent once the frame finishes loading.
const frameState = new Map();

function sendToFrame(frame, state) {
  const merged = { ...(frameState.get(frame) || {}), ...state };
  frameState.set(frame, merged);
  frame.contentWindow?.postMessage({ type: "viz-state", ...state }, "*");
}

document.querySelectorAll(".sticky-frame").forEach(frame => {
  frame.addEventListener("load", () => {
    const s = frameState.get(frame);
    if (s) frame.contentWindow.postMessage({ type: "viz-state", ...s, scrollTo: undefined }, "*");
  });
});

/* ---------- Step triggers ---------- */
const stepObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const step = entry.target;
    const scrolly = step.closest(".scrolly");
    scrolly.querySelectorAll(".step").forEach(s => s.classList.toggle("is-active", s === step));

    if (scrolly.dataset.kind === "day") updateDay(step);
    if (scrolly.dataset.kind === "frame") {
      // Combine this step with every step before it, so scrolling back up restores the right view.
      const steps = [...scrolly.querySelectorAll(".step")];
      const state = {};
      steps.slice(0, steps.indexOf(step) + 1).forEach(s => Object.assign(state, JSON.parse(s.dataset.state || "{}")));
      if (!JSON.parse(step.dataset.state || "{}").scrollTo) state.scrollTo = ".controls";
      if (scrolly.hasAttribute("data-smooth")) delete state.scrollTo; // position is handled by glideFrames()
      sendToFrame(scrolly.querySelector(".sticky-frame"), state);
    }
  });
}, { rootMargin: "-50% 0px -50% 0px" }); // fires when a step crosses the middle of the screen

document.querySelectorAll(".step").forEach(s => stepObserver.observe(s));

/* ---------- Smooth glide (.scrolly[data-smooth]) ---------- */
// Instead of jumping when a step becomes active, the chart scrolls along with the page:
// between two steps it sits partway between their scrollTo targets.
const glideScrollies = [...document.querySelectorAll(".scrolly[data-smooth]")];
let glideQueued = false;

function glideFrames() {
  glideQueued = false;
  glideScrollies.forEach(scrolly => {
    const steps = [...scrolly.querySelectorAll(".step")];
    const targets = steps.map(s => JSON.parse(s.dataset.state || "{}").scrollTo || "body");
    const mid = innerHeight / 2;
    const centers = steps.map(s => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
    let pos = 0;
    if (mid >= centers[centers.length - 1]) pos = steps.length - 1;
    else for (let i = 0; i < centers.length - 1; i++) {
      if (mid >= centers[i] && mid < centers[i + 1]) { pos = i + (mid - centers[i]) / (centers[i + 1] - centers[i]); break; }
    }
    scrolly.querySelector(".sticky-frame").contentWindow?.postMessage({ type: "viz-glide", targets, pos }, "*");
  });
}

if (glideScrollies.length) {
  addEventListener("scroll", () => { if (!glideQueued) { glideQueued = true; requestAnimationFrame(glideFrames); } }, { passive: true });
  addEventListener("resize", glideFrames);
  glideScrollies.forEach(s => s.querySelector(".sticky-frame").addEventListener("load", glideFrames));
}

/* ---------- Load only the visible copy of a chart (chapter 2) ---------- */
// The APA chart has a pinned desktop copy and a normal phone copy; only one is shown at a time.
// Hidden iframes would still load and animate, so they get data-src and load once visible.
function loadVisibleFrames() {
  document.querySelectorAll("iframe[data-src]").forEach(f => {
    if (f.offsetParent !== null) { f.src = f.dataset.src; f.removeAttribute("data-src"); }
  });
}
loadVisibleFrames();
addEventListener("resize", loadVisibleFrames, { passive: true });

/* ---------- Mini generation bars on fun-fact cards (chapter 2) ---------- */
// data-gens="GenZ,Millennials,GenX,Boomers" (weighted %), drawn on a 0–100% scale.
const GENS = ["Gen Z", "Millennials", "Gen X", "Boomers & older"];
document.querySelectorAll("[data-gens]").forEach(card => {
  const vals = card.dataset.gens.split(",").map(Number);
  const box = document.createElement("div");
  box.className = "genbars";
  box.innerHTML = vals.map((v, i) =>
    `<div><span>${GENS[i]}</span><i style="--v:${v};--c:var(--gen-${i})"></i><b>${Math.round(v)}%</b></div>`).join("");
  card.appendChild(box);
});

/* ---------- Fade-in for fun facts ---------- */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add("is-visible");
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll(".reveal, .lede-stack, .to-chart").forEach(el => revealObserver.observe(el));

/* ---------- Resize chart frames to fit their content ---------- */
addEventListener("message", e => {
  // A chart asks the page to scroll to a spot inside it (e.g. Valay's Compare panel opening).
  // The chart usually grows at the same moment, so the scroll waits for its new height (below).
  if (e.data && e.data.type === "viz-scroll") {
    document.querySelectorAll(".viz-frame").forEach(frame => {
      if (frame.contentWindow !== e.source) return;
      clearTimeout(frame._scrollTimer);
      frame._pendingScroll = e.data.top;
      frame._scrollTimer = setTimeout(() => scrollIntoFrame(frame), 300); // in case the height doesn't change
    });
    return;
  }
  if (!e.data || e.data.type !== "viz-height") return;
  document.querySelectorAll(".viz-frame").forEach(frame => {
    if (frame.contentWindow !== e.source) return;
    frame.dataset.h = e.data.height; // full chart height
    if (frame.closest(".viz-pin")) layoutPins();
    else frame.style.height = Math.max(300, e.data.height) + "px";
    if (frame._pendingScroll != null) { clearTimeout(frame._scrollTimer); requestAnimationFrame(() => scrollIntoFrame(frame)); }
  });
});

function scrollIntoFrame(frame) {
  const inner = frame._pendingScroll;
  if (inner == null) return;
  frame._pendingScroll = null;
  // A pinned frame's on-screen spot moves while it's stuck, so measure from where its pin starts on the page.
  const pin = frame.closest(".viz-pin");
  const frameTop = pin
    ? pin.getBoundingClientRect().top + scrollY + (frame.getBoundingClientRect().top - pin.querySelector(".viz-block").getBoundingClientRect().top)
    : frame.getBoundingClientRect().top + scrollY;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  scrollTo({ top: frameTop + inner - navH() - 8, behavior: reduce ? "auto" : "smooth" });
}

/* ---------- Pinned charts (.viz-pin) ---------- */
// The chart holds still for a stretch of scrolling (--pin-dwell in css/style.css), then the page moves on.
// The frame always gets the chart's full height, so nothing ever scrolls inside it:
//   - fits the screen: it sticks centered below the nav
//   - taller (phones): the reader scrolls through it, and it holds once its bottom reaches the screen's bottom
const pins = [...document.querySelectorAll(".viz-pin")];
const navH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 48;

function layoutPins() {
  pins.forEach(pin => {
    const block = pin.querySelector(".viz-block");
    const frame = block.querySelector(".viz-frame");
    const avail = innerHeight - navH();
    if (frame && frame.dataset.h) frame.style.height = Math.max(300, +frame.dataset.h) + "px";
    const h = block.offsetHeight;
    const top = h <= avail ? navH() + (avail - h) / 2 : innerHeight - h;
    pin.style.setProperty("--pin-h", h + "px");
    pin.style.setProperty("--pin-top", top + "px");
  });
}

function updatePinned() {
  pins.forEach(pin => {
    const r = pin.getBoundingClientRect();
    const blockTop = pin.querySelector(".viz-block").getBoundingClientRect().top;
    const stuck = r.top < blockTop - 1 && r.bottom > innerHeight * 0.6;
    pin.classList.toggle("is-pinned", stuck);
  });
}

if (pins.length) {
  const ro = new ResizeObserver(layoutPins);
  pins.forEach(pin => ro.observe(pin.querySelector(".viz-block")));
  addEventListener("resize", layoutPins);
  addEventListener("scroll", updatePinned, { passive: true });
  layoutPins();
}

/* ---------- Progress bar + active chapter ---------- */
const bar = document.getElementById("progress");
const navLinks = document.querySelectorAll(".chapters a");
const chapters = document.querySelectorAll("[data-chapter]:not(a)");

function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";

  let current = "";
  chapters.forEach(ch => {
    if (ch.getBoundingClientRect().top < innerHeight * 0.4) current = ch.dataset.chapter;
  });
  navLinks.forEach(a => a.classList.toggle("active", a.dataset.chapter === current));
}
addEventListener("scroll", onScroll, { passive: true });
onScroll();
