import { getRagMode, setRagMode } from "./config.js";

export async function injectModeSelector() {
  const container = document.querySelector(".gh-header-actions");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.style.marginRight = "8px";

  const select = document.createElement("select");
  for (const mode of ["performance", "security", "test"]) {
    const opt = document.createElement("option");
    opt.value = mode;
    opt.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    select.appendChild(opt);
  }

  select.value = await getRagMode();
  select.addEventListener("change", async () => {
    await setRagMode(select.value);
    window.location.reload();
  });

  wrapper.appendChild(select);
  container.prepend(wrapper);
}
