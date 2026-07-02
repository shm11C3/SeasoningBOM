import "@testing-library/jest-dom/vitest";
import { createElement, type HTMLAttributes, type ReactNode } from "react";
import { vi } from "vitest";

type PrimerButtonProps = HTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  type?: "button" | "submit" | "reset";
  variant?: string;
};

type PrimerLabelProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  variant?: string;
};

vi.mock("@primer/react", () => ({
  BaseStyles: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  Button: ({ children, type = "button", variant: _variant, ...props }: PrimerButtonProps) =>
    // biome-ignore lint/a11y/useButtonType: this test mock forwards Primer's explicit button type.
    createElement("button", { ...props, type }, children),
  Label: ({ children, variant: _variant, ...props }: PrimerLabelProps) =>
    createElement("span", props, children),
  ThemeProvider: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
