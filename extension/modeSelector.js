import { getRagMode, setRagMode, AVAILABLE_MODES } from "./config.js";

export async function injectModeSelector() {
  const container = document.querySelector(".gh-header-actions");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.style.marginRight = "8px";

  const select = document.createElement("select");
  for (const mode of AVAILABLE_MODES) {
    const opt = document.createElement("option");
    opt.value = mode;
    opt.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    select.appendChild(opt);
  }

  try {
    select.value = await getRagMode();
  } catch (err) {
    console.error("Failed to load RAG mode", err);
  }

  select.addEventListener("change", async () => {
    try {
      await setRagMode(select.value);
      window.location.reload();
    } catch (err) {
      console.error("Failed to set RAG mode", err);
    }
  });

  wrapper.appendChild(select);
  container.prepend(wrapper);
}
