import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { GlassButton } from "@/components/glass";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem("sp-theme");
    const prefersDark =
      stored === "dark" || (stored === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(stored === "light" ? false : prefersDark || stored === null);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("sp-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <GlassButton
      size="sm"
      onClick={() => setDark((v) => !v)}
      aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
      className="w-9 px-0"
    >
      {dark ? (
        <Sun strokeWidth={1.5} className="size-4" />
      ) : (
        <Moon strokeWidth={1.5} className="size-4" />
      )}
    </GlassButton>
  );
}
