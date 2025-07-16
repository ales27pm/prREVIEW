import { jest } from "@jest/globals";
import {
  createStatusIndicator,
  updateStatus,
  removeStatusIndicator,
} from "../extension/ui.js";

describe("ui DOM manipulation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    global.chrome = {
      runtime: { getURL: () => "status.css" },
    };
  });

  test("createStatusIndicator adds status element", () => {
    createStatusIndicator();
    const indicator = document.getElementById("ai-review-status-indicator");
    expect(indicator).not.toBeNull();
    expect(indicator.querySelector("#ai-review-status-text")).not.toBeNull();
  });

  test("updateStatus sets text and hides spinner when complete", () => {
    createStatusIndicator();
    jest.useFakeTimers();
    updateStatus("Done", { isComplete: true });
    const text = document.getElementById("ai-review-status-text");
    const spinner = document.querySelector(
      "#ai-review-status-indicator .spinner",
    );
    expect(text.textContent).toBe("Done");
    expect(spinner.style.display).toBe("none");
    jest.advanceTimersByTime(5000);
    expect(document.getElementById("ai-review-status-indicator")).toBeNull();
    jest.useRealTimers();
  });
});
