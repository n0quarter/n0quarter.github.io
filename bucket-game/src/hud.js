const BUCKET_ICON = `
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <path class="handle" d="M7 12a9 9 0 0 1 18 0" />
    <path class="body" d="M5.5 12h21l-2.7 15a2 2 0 0 1-2 1.7H10.2a2 2 0 0 1-2-1.7z" />
    <path class="band" d="M6.6 17.2h18.8M7.6 23.2h16.8" />
  </svg>`;

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    score: $("score"),
    combo: $("combo"),
    buckets: $("buckets"),
    windArrow: $("windArrow"),
    windText: $("windText"),
    distance: $("distance"),
    toast: $("toast"),
    floaters: $("floaters"),
    power: $("power"),
    powerFill: $("powerFill"),
    powerText: $("powerText"),
    hint: $("hint"),
    menu: $("menu"),
    menuBest: $("menuBest"),
    gameover: $("gameover"),
    finalScore: $("finalScore"),
    finalLine: $("finalLine"),
    finalBest: $("finalBest"),
    finalStats: $("finalStats"),
    muteButton: $("muteButton"),
    hud: document.querySelector(".hud"),
  };
  let toastTimer = 0;
  let shownScore = 0;
  let scoreAnimation = 0;

  // Counts the score up instead of jumping to the new value.
  function animateScore(target) {
    cancelAnimationFrame(scoreAnimation);
    const from = shownScore;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / 600, 1);
      shownScore = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
      el.score.textContent = String(shownScore);
      if (t < 1) scoreAnimation = requestAnimationFrame(step);
    };
    scoreAnimation = requestAnimationFrame(step);
  }

  function bump(element) {
    element.classList.remove("bump");
    void element.offsetWidth;
    element.classList.add("bump");
  }

  return {
    onPlay(handler) {
      $("playButton").addEventListener("click", handler);
      $("againButton").addEventListener("click", handler);
    },
    onMute(handler) {
      el.muteButton.addEventListener("click", handler);
    },
    setMuted(muted) {
      el.muteButton.classList.toggle("muted", muted);
    },
    setPhase(phase) {
      document.body.dataset.phase = phase;
    },
    setScore(score) {
      if (score === 0) {
        cancelAnimationFrame(scoreAnimation);
        shownScore = 0;
        el.score.textContent = "0";
        return;
      }
      animateScore(score);
      bump(el.score);
    },
    setCombo(streak) {
      const multiplier = Math.min(streak, 5);
      el.combo.textContent = `×${multiplier} streak`;
      el.combo.classList.toggle("active", multiplier > 1);
      el.combo.classList.toggle("hot", multiplier >= 3);
      el.combo.classList.toggle("fire", multiplier >= 5);
      if (multiplier > 1) bump(el.combo);
    },
    setBuckets(count) {
      el.buckets.innerHTML = `${BUCKET_ICON}<strong>${count}</strong>`;
      el.buckets.classList.toggle("low", count <= 2);
      bump(el.buckets.querySelector("strong"));
    },
    setWind(wind) {
      const speed = Math.hypot(wind.x, wind.z);
      el.windText.textContent = speed < 0.1 ? "Calm" : `${speed.toFixed(1)} m/s`;
      el.windArrow.style.opacity = speed < 0.1 ? "0.25" : "1";
      el.windArrow.style.transform = `rotate(${Math.atan2(wind.x, -wind.z)}rad)`;
      el.windArrow.dataset.strength = speed > 4 ? "strong" : speed > 2 ? "medium" : "light";
    },
    setDistance(meters) {
      el.distance.textContent = `${Math.round(meters)} m`;
    },
    toast(text, tone = "") {
      el.toast.textContent = text;
      el.toast.className = `toast visible ${tone}`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove("visible"), 2300);
    },
    floatText(text, caption, x, y, tone = "") {
      const floater = document.createElement("div");
      floater.className = `floater ${tone}`;
      // Never let the popup collide with the HUD pills at the top.
      const belowHud = el.hud.getBoundingClientRect().bottom + 70;
      floater.style.left = `${x}px`;
      floater.style.top = `${Math.max(y, belowHud)}px`;
      floater.innerHTML = `${text}<small>${caption}</small>`;
      floater.addEventListener("animationend", () => floater.remove());
      el.floaters.append(floater);
    },
    setPower(power) {
      el.power.classList.toggle("visible", power !== null);
      if (power === null) return;
      el.powerFill.style.transform = `scaleX(${power})`;
      el.powerText.textContent = `${Math.round(power * 100)}%`;
    },
    showHint(visible) {
      el.hint.classList.toggle("visible", visible);
    },
    showMenu(best) {
      el.menuBest.textContent = best > 0 ? `Best: ${best}` : "";
      el.menu.classList.remove("hidden");
      el.gameover.classList.add("hidden");
    },
    showGameOver({ score, best, isNewBest, line, stats }) {
      clearTimeout(toastTimer);
      el.toast.classList.remove("visible");
      el.finalScore.textContent = String(score);
      el.finalLine.textContent = line;
      el.finalStats.textContent = stats;
      el.finalBest.textContent = isNewBest ? "New best!" : best > 0 ? `Best: ${best}` : "";
      el.finalBest.classList.toggle("new", isNewBest);
      el.gameover.classList.remove("hidden");
    },
    hideScreens() {
      el.menu.classList.add("hidden");
      el.gameover.classList.add("hidden");
    },
  };
}
