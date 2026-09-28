const LEFT_KEYS = ["ArrowLeft", "KeyA"];
const RIGHT_KEYS = ["ArrowRight", "KeyD"];

// Left/right walking from the keyboard or the on-screen buttons. Returns -1, 0 or 1.
export function createWalkControl(leftButton, rightButton) {
  const held = { left: false, right: false };
  const keys = { left: false, right: false };

  function bindButton(button, side) {
    const release = () => (held[side] = false);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      held[side] = true;
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  }
  bindButton(leftButton, "left");
  bindButton(rightButton, "right");

  window.addEventListener("keydown", (event) => {
    if (LEFT_KEYS.includes(event.code)) keys.left = true;
    if (RIGHT_KEYS.includes(event.code)) keys.right = true;
  });
  window.addEventListener("keyup", (event) => {
    if (LEFT_KEYS.includes(event.code)) keys.left = false;
    if (RIGHT_KEYS.includes(event.code)) keys.right = false;
  });
  window.addEventListener("blur", () => {
    Object.assign(held, { left: false, right: false });
    Object.assign(keys, { left: false, right: false });
  });

  return {
    direction() {
      const left = held.left || keys.left;
      const right = held.right || keys.right;
      return Number(right) - Number(left);
    },
  };
}
