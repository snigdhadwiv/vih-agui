// Optional convenience wrapper. Not required — the widget is a plain Web
// Component and works fine as the <script> + <agentic-ui-agent> tag from
// the README. Use this instead if your team prefers everything to be an
// explicit React import.
import { useEffect } from "react";
import "./agentic-widget.js";

export default function AgenticUIAgent({ endpoint = "http://localhost:4411" }) {
  useEffect(() => {
    // no-op: defining the custom element is enough, this effect exists so
    // bundlers don't tree-shake the side-effecting import above.
  }, []);
  return <agentic-ui-agent endpoint={endpoint}></agentic-ui-agent>;
}
