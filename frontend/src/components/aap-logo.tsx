import { useEffect, useState } from "react";

import { readColorMode } from "../color-mode";

const STANDARD = `${import.meta.env.BASE_URL}brand/aap-logo-standard.png`;
const REVERSE = `${import.meta.env.BASE_URL}brand/aap-logo-reverse.png`;

export function AapLogo() {
  const [dark, setDark] = useState(() => readColorMode() === "dark");

  useEffect(() => {
    const node = document.documentElement;
    const sync = () => setDark(node.classList.contains("pf-v6-theme-dark"));
    const observer = new MutationObserver(sync);
    observer.observe(node, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <img className="aam-aap-logo" src={dark ? REVERSE : STANDARD} alt="Red Hat Ansible Automation Platform" />;
}
