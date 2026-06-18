import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Dropdown from "./index";

describe("Dropdown", () => {
  it("supports hover, keyboard focus, and Escape dismissal", () => {
    render(
      <Dropdown ariaLabel="上传策略" trigger="云端上传">
        <button type="button">上传原视频</button>
      </Dropdown>,
    );

    const trigger = screen.getByRole("button", { name: "上传策略" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls") || "");

    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("aria-hidden", "true");

    fireEvent.mouseEnter(trigger.parentElement as HTMLElement);
    expect(panel).toHaveAttribute("aria-hidden", "false");

    fireEvent.mouseLeave(trigger.parentElement as HTMLElement);
    expect(panel).toHaveAttribute("aria-hidden", "true");

    fireEvent.focus(trigger);
    expect(panel).toHaveAttribute("aria-hidden", "false");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(trigger).toHaveFocus();
  });

  it("opens on click without fighting the focus handler", () => {
    render(
      <Dropdown ariaLabel="上传策略" trigger="云端上传">
        <button type="button">上传原视频</button>
      </Dropdown>,
    );

    const trigger = screen.getByRole("button", { name: "上传策略" });
    fireEvent.focus(trigger);
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: "上传策略" })).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });
});
