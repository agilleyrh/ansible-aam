import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@patternfly/react-core";
import { MoonIcon, SunIcon } from "@patternfly/react-icons";

import { readColorMode, writeColorMode, type ColorMode } from "../color-mode";

export function ColorModeToggle() {
  const [mode, setMode] = useState<ColorMode>(() => readColorMode());

  function apply(next: ColorMode) {
    writeColorMode(next);
    setMode(next);
  }

  return (
    <ToggleGroup aria-label="Color theme">
      <ToggleGroupItem
        icon={<SunIcon />}
        aria-label="Light mode"
        buttonId="aam-theme-light"
        isSelected={mode === "light"}
        onChange={(_event, selected) => {
          if (selected) {
            apply("light");
          }
        }}
      />
      <ToggleGroupItem
        icon={<MoonIcon />}
        aria-label="Dark mode"
        buttonId="aam-theme-dark"
        isSelected={mode === "dark"}
        onChange={(_event, selected) => {
          if (selected) {
            apply("dark");
          }
        }}
      />
    </ToggleGroup>
  );
}
