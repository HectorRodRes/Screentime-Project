/* Scrollytelling for the Screened Out story.
   - Steps: when a .step reaches the middle of the screen, its section's graphic updates.
   - Fun facts / takeaways (.reveal) fade in as they scroll into view.
   - Progress bar and chapter nav follow the reader. */

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
      sendToFrame(scrolly.querySelector(".sticky-frame"), state);
    }
  });
}, { rootMargin: "-50% 0px -50% 0px" }); // fires when a step crosses the middle of the screen

document.querySelectorAll(".step").forEach(s => stepObserver.observe(s));

/* ---------- Fade-in for fun facts ---------- */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add("is-visible");
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll(".reveal").forEach(el => revealObserver.observe(el));

/* ---------- Resize chart frames to fit their content ---------- */
addEventListener("message", e => {
  if (!e.data || e.data.type !== "viz-height") return;
  document.querySelectorAll(".viz-frame").forEach(frame => {
    if (frame.contentWindow !== e.source) return;
    frame.dataset.h = e.data.height; // full chart height
    if (frame.closest(".viz-pin")) layoutPins(); // pinned frames are capped to the screen
    else frame.style.height = Math.max(300, e.data.height) + "px";
  });
});

/* ---------- Pinned charts (.viz-pin) ---------- */
// The chart sticks centered below the nav. If it's taller than the screen, its frame is
// shrunk to fit and the reader scrolls inside the chart before the page moves on.
const pins = [...document.querySelectorAll(".viz-pin")];
const navH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 48;

function layoutPins() {
  pins.forEach(pin => {
    const block = pin.querySelector(".viz-block");
    const frame = block.querySelector(".viz-frame");
    const avail = innerHeight - navH();
    if (frame && frame.dataset.h) {
      const others = block.offsetHeight - frame.offsetHeight; // title + notes
      frame.style.height = Math.max(300, Math.min(+frame.dataset.h, avail - others - 16)) + "px";
    }
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
